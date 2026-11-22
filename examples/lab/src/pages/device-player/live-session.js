import { TiRtcConn, TiRtcVideoOutput, TiRtcAudioOutput, TiRtcAudioInput } from '@/libs/tirtc';
import Emitter from '@/utils/emitter.js';

// 一次实时直播会话：连接设备、播放音视频、对讲、收发命令。
//
// 用法：
//   const session = new LiveSession({ view: canvas, streams: { audio, video, mic } });
//   session.on('change', (state) => ...);  // 状态变了就通知，页面据此刷新按钮和提示
//   await session.start({ deviceId, token });
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
  // 本次会话的 SDK 对象，只在 #teardown() 里释放
  #res = null;

  // view：渲染画面的 canvas 元素
  // streams：{ audio, video, mic } 三路流号
  // micOptions：对讲音频参数，例如 { sampleRate: 8000 }
  constructor({ view, streams, micOptions = {} }) {
    super();
    this.view = view;
    this.streams = streams;
    this.micOptions = micOptions;
  }

  // 用来发命令和流消息；没在播放时为 null
  get connection() {
    return this.state.phase === Phase.PLAYING ? this.#res.connection : null;
  }

  async start({ deviceId, token }) {
    if (this.state.phase === Phase.CONNECTING || this.state.phase === Phase.PLAYING) return;
    // 上次失败留下的连接先清掉
    this.#teardown();

    const seq = ++this.#seq;
    const { streams } = this;

    // 一条连接上挂视频、音频和对讲，三者都通过 connection 收发数据
    const connection = TiRtcConn();
    const res = {
      connection,
      video: TiRtcVideoOutput({ connection, streamId: streams.video, view: this.view }),
      audio: TiRtcAudioOutput({ connection, streamId: streams.audio }),
      mic: TiRtcAudioInput({ connection, streamId: streams.mic }),
      onConnectionStateChange: ({ state }) => this.#onConnectionStateChange(seq, state),
    };
    // 对讲参数必须在 mic.start() 之前设置，录音中改会抛错
    res.mic.setOptions(this.micOptions);
    this.#res = res;
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
    res.video.attach();
    res.audio.attach();
    // subscribe：向设备要流。requestKeyFrame 让设备马上发关键帧，第一帧画面出得更快
    connection.subscribeVideo({ streamId: streams.video });
    connection.subscribeAudio({ streamId: streams.audio });
    connection.requestKeyFrame({ streamId: streams.video });

    // onCommand / onStreamMessage 是赋值，再赋一次会覆盖，所以连上后只挂这一次
    connection.onCommand = (message) => this.emit('command', message);
    connection.onStreamMessage = (message) => this.emit('streamMessage', message);
    connection.on('connectionStateChange', res.onConnectionStateChange);

    this.#setState({ phase: Phase.PLAYING });
  }

  stop() {
    this.#seq += 1;
    this.#teardown();
    this.#setState({ phase: Phase.IDLE, talking: false, error: null });
  }

  // 开始对讲：申请麦克风 → 开始采集 → attach 后才真正发给设备
  async startTalkback() {
    if (this.state.phase !== Phase.PLAYING || this.state.talking) return;

    const seq = this.#seq;
    const { mic } = this.#res;
    this.#setState({ talking: true });
    try {
      await mic.start();
      // 等麦克风授权期间已经停止了播放或对讲，刚打开的麦克风要关掉
      if (seq !== this.#seq || !this.state.talking) {
        mic.stop();
        return;
      }
      await mic.attach();
    } catch (reason) {
      if (seq === this.#seq) this.#setState({ talking: false });
      throw toError(reason);
    }
  }

  async stopTalkback() {
    if (!this.state.talking) return;

    const { mic } = this.#res;
    this.#setState({ talking: false });
    await mic.detach();
    await mic.stop();
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
    const res = this.#res;
    if (!res) return;
    this.#res = null;

    res.connection.off('connectionStateChange', res.onConnectionStateChange);
    // SDK 收到消息时直接调用，不能置成 null
    res.connection.onCommand = () => {};
    res.connection.onStreamMessage = () => {};

    res.mic.detach();
    res.mic.stop();
    res.video.detach();
    res.audio.detach();
    res.connection.disconnect();
  }

  #setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }
}
