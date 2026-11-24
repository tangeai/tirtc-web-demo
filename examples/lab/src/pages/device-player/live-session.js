import { TiRtcConn, TiRtcVideoOutput, TiRtcAudioOutput, TiRtcAudioInput } from '@/libs/tirtc';
import Emitter from '@/utils/emitter.js';

// 一次实时直播会话：连接设备、播放音视频、对讲、收发命令。
//
// 一条连接上挂三个 SDK 对象：videoOutput、audioOutput、audioInput。
// 对讲没有单独的 SDK 类型，就是操作这次会话的 audioInput（TiRtcAudioInput）。
//
// 用法：
//   const session = new LiveSession({
//     view: canvas,
//     streams: { audio, video, audioInput },
//     audioInputOptions: { sampleRate: 8000 },
//   });
//   session.on('change', (state) => ...);  // 状态变了就通知，页面据此刷新按钮和提示
//   await session.start({ deviceId, token });
//   await session.startTalkback();
//   session.stop();
//
// 会话只做事和维护状态，不弹提示。方法失败时 reject 一个 Error，由页面决定怎么展示。
//
// 事件：
//   change         state 变化，参数是最新的 state
//   command        设备发来的命令 { commandId, data }
//   streamMessage  设备发来的流消息 { streamId, timestampMs, data }

export const Phase = {
  IDLE: 'idle', // 没在播放
  CONNECTING: 'connecting', // 正在连接
  PLAYING: 'playing', // 已连上，正在播放
  FAILED: 'failed', // 连接失败，或播放中连接断开
};

// SDK 的 connect 失败时可能 reject 字符串或 { message, state }，统一成 Error
function toError(reason) {
  if (reason instanceof Error) return reason;
  return new Error(reason?.message || String(reason ?? '未知错误'));
}

export class LiveSession extends Emitter {
  state = { phase: Phase.IDLE, talking: false, error: null };

  // 每次 start / stop 都加一。异步操作回来时编号变了，说明期间已经停止或重新开始，结果作废
  #seq = 0;
  // 本次 start() 创建的 SDK 对象，只在 #teardown() 里释放
  #connection = null;
  #videoOutput = null; // 设备 → 浏览器：画面
  #audioOutput = null; // 设备 → 浏览器：声音
  #audioInput = null; // 浏览器 → 设备：对讲
  // 本次挂上的连接状态监听，只为 teardown 时 off 掉同一个函数
  #onConnectionState = null;

  // view：渲染画面的 canvas 元素
  // streams：{ audio, video, audioInput } 三路流号
  // audioInputOptions：对讲采集参数，传给 audioInput.setOptions，例如 { sampleRate: 8000 }
  constructor({ view, streams, audioInputOptions = {} }) {
    super();
    this.view = view;
    this.streams = streams;
    this.audioInputOptions = audioInputOptions;
  }

  // 用来发命令和流消息；没在播放时为 null
  get connection() {
    return this.state.phase === Phase.PLAYING ? this.#connection : null;
  }

  async start({ deviceId, token }) {
    if (this.state.phase === Phase.CONNECTING || this.state.phase === Phase.PLAYING) return;
    // 上次失败留下的连接先清掉
    this.#teardown();

    const seq = ++this.#seq;
    const { streams } = this;

    // 一条连接上挂三个 SDK 对象，都通过 connection 收发数据
    const connection = TiRtcConn();
    const videoOutput = TiRtcVideoOutput({ connection, streamId: streams.video, view: this.view });
    const audioOutput = TiRtcAudioOutput({ connection, streamId: streams.audio });
    const audioInput = TiRtcAudioInput({ connection, streamId: streams.audioInput });
    const onConnectionState = ({ state }) => this.#onConnectionStateChange(seq, state);
    // 对讲参数必须在 audioInput.start() 之前设置，录音中改会抛错
    audioInput.setOptions(this.audioInputOptions);

    this.#connection = connection;
    this.#videoOutput = videoOutput;
    this.#audioOutput = audioOutput;
    this.#audioInput = audioInput;
    this.#onConnectionState = onConnectionState;
    this.#setState({ phase: Phase.CONNECTING, talking: false, error: null });

    try {
      await connection.connect({ deviceId, token });
    } catch (reason) {
      const error = toError(reason);
      if (seq === this.#seq) {
        this.#teardown();
        this.#setState({ phase: Phase.FAILED, error });
      }
      throw error;
    }
    // 连接期间用户点了停止，或者又开始了一次新的播放
    if (seq !== this.#seq) return;

    // attach：本地开始解码、出声、画画面
    videoOutput.attach();
    audioOutput.attach();
    // subscribe：向设备要流。requestKeyFrame 让设备马上发关键帧，第一帧画面出得更快
    connection.subscribeVideo({ streamId: streams.video });
    connection.subscribeAudio({ streamId: streams.audio });
    connection.requestKeyFrame({ streamId: streams.video });

    // onCommand / onStreamMessage 是赋值，再赋一次会覆盖，所以连上后只挂这一次
    connection.onCommand = (message) => this.emit('command', message);
    connection.onStreamMessage = (message) => this.emit('streamMessage', message);
    connection.on('connectionStateChange', onConnectionState);

    this.#setState({ phase: Phase.PLAYING });
  }

  stop() {
    this.#seq += 1;
    this.#teardown();
    this.#setState({ phase: Phase.IDLE, talking: false, error: null });
  }

  // 对讲就是操作 audioInput：申请麦克风 → 开始采集 → attach 后才真正发给设备
  async startTalkback() {
    if (this.state.phase !== Phase.PLAYING || this.state.talking) return;

    const seq = this.#seq;
    const audioInput = this.#audioInput;
    this.#setState({ talking: true });
    try {
      await audioInput.start();
      // 等麦克风授权期间已经停止了播放或对讲，刚打开的麦克风要关掉
      if (seq !== this.#seq || !this.state.talking) {
        audioInput.stop();
        return;
      }
      await audioInput.attach();
    } catch (reason) {
      if (seq === this.#seq) this.#setState({ talking: false });
      throw toError(reason);
    }
  }

  async stopTalkback() {
    if (!this.state.talking) return;

    const audioInput = this.#audioInput;
    this.#setState({ talking: false });
    await audioInput.detach();
    await audioInput.stop();
  }

  // 页面卸载时调用。之后这个会话不能再用
  dispose() {
    this.stop();
    this.removeAllListeners();
  }

  // 连接中途断开时进入 FAILED。SDK 会自动尝试恢复，恢复后回到 PLAYING
  #onConnectionStateChange(seq, state) {
    if (seq !== this.#seq) return;
    if (state === 'failed') this.#setState({ phase: Phase.FAILED, error: new Error('连接已断开') });
    if (state === 'connected') this.#setState({ phase: Phase.PLAYING, error: null });
  }

  // 释放顺序：先停对讲，再停本地播放，最后断开连接。disconnect 不会自动做前两步
  #teardown() {
    const connection = this.#connection;
    if (!connection) return;

    const videoOutput = this.#videoOutput;
    const audioOutput = this.#audioOutput;
    const audioInput = this.#audioInput;
    const onConnectionState = this.#onConnectionState;
    this.#connection = null;
    this.#videoOutput = null;
    this.#audioOutput = null;
    this.#audioInput = null;
    this.#onConnectionState = null;

    connection.off('connectionStateChange', onConnectionState);
    // SDK 收到消息时直接调用，不能置成 null
    connection.onCommand = () => {};
    connection.onStreamMessage = () => {};

    audioInput.detach();
    audioInput.stop();
    videoOutput.detach();
    audioOutput.detach();
    connection.disconnect();
  }

  #setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }
}
