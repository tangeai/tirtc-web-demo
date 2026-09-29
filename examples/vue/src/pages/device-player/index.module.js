import { TiRtc, TiRtcInitOptions, TiRtcConn, TiRtcVideoOutput, TiRtcAudioOutput, TiRtcAudioInput } from 'tirtc-web';

// 设备播放示例：initialize → 等 wasm → 建连 → attach + 订阅 → 对讲 / 命令 / 流消息。
// 页面必须有 <canvas id="canvas">，当前公开 API 只认这个固定 id，且不要加边框或内边距。

// ---------- 1. 和设备侧约定的 streamId / 命令号，不是随便填 ----------
const AUDIO_STREAM_ID = 10;
const VIDEO_STREAM_ID = 11;
const AUDIO_INPUT_STREAM_ID = 14;
const STREAM_MESSAGE_ID = 3;
const AUDIO_SAMPLE_RATE = 8000;

const GET_DEVICE_STATUS_COMMAND_ID = 0x10000;
const GET_DEVICE_STATUS_RESULT_COMMAND_ID = 0x10002;

// ---------- 2. 小工具 ----------
// 命令 / 流消息的 data 是 ArrayBuffer
function decodeBinaryText(data) {
  if (!data) return '';
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  return '';
}

// connect 失败时 SDK 可能 reject { message, state }，不是 Error
function formatError(error) {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return String(error);
}

function readUrlParams() {
  const search = new URLSearchParams(window.location.search);
  return {
    deviceId: search.get('device_id') || '',
    appId: search.get('app_id') || '',
    token: search.get('token') || '',
  };
}

function initTiRtc(appId) {
  TiRtc.initialize(TiRtcInitOptions({ appId }));
}

// ---------- 3. 播放器样例 ----------
class SamplePlayer {
  constructor({ onToast, onError } = {}) {
    this.isPlaying = false;
    this.connection = null;
    this.audioOutput = null;
    this.videoOutput = null;
    this.audioInput = null;
    this.onToast = onToast || (() => {});
    this.onError = onError || ((error) => console.error(error));
  }

  // 视频解码依赖 wasm，没就绪就创建视频输出可能失败
  ready() {
    return TiRtc.videoOutputReady();
  }

  play({ deviceId = '', token = '' }) {
    if (this.isPlaying) return;
    if (!deviceId) {
      this.onToast('请输入设备ID');
      return;
    }

    this.isPlaying = true;

    // 一条连接上挂播放和对讲；三者都是工厂函数
    const connection = new TiRtcConn();
    const audioOutput = TiRtcAudioOutput({ connection, streamId: AUDIO_STREAM_ID });
    const videoOutput = TiRtcVideoOutput({ connection, streamId: VIDEO_STREAM_ID });
    const audioInput = TiRtcAudioInput({ connection, streamId: AUDIO_INPUT_STREAM_ID });

    // 录音中改配置会抛错，必须在 start() 之前
    audioInput.setOptions({ sampleRate: AUDIO_SAMPLE_RATE });

    this.connection = connection;
    this.audioOutput = audioOutput;
    this.videoOutput = videoOutput;
    this.audioInput = audioInput;

    connection
      .connect({ deviceId, token })
      .then(() => {
        // attach：本机开始解码、出声、画画面
        audioOutput.attach();
        videoOutput.attach();

        // subscribe：才是向设备要流；requestKeyFrame 让第一帧尽快出来
        connection.subscribeAudio({ streamId: AUDIO_STREAM_ID });
        connection.subscribeVideo({ streamId: VIDEO_STREAM_ID });
        connection.requestKeyFrame({ streamId: VIDEO_STREAM_ID });

        // 连上再挂，才能收到设备主动推过来的命令 / 流消息
        this.mountListeners();
      })
      .catch((error) => {
        this.isPlaying = false;
        this.onError(formatError(error));
        console.log('failed to connect device: ', error);
      });
  }

  stop() {
    // disconnect 只断连，不会自动 detach 播放或停对讲
    if (this.connection) this.connection.disconnect();
    if (this.audioOutput) this.audioOutput.detach();
    if (this.videoOutput) this.videoOutput.detach();
    this.stopTalkback();

    this.connection = null;
    this.audioOutput = null;
    this.videoOutput = null;
    this.audioInput = null;
    this.isPlaying = false;
  }

  startTalkback() {
    const { audioInput } = this;
    if (!audioInput) {
      this.onToast('请先播放');
      return;
    }

    // start 会申请麦克风；attach 之后才往设备送音频
    audioInput
      .start()
      .then(() => audioInput.attach())
      .catch((error) => {
        this.onError(formatError(error));
        console.log(error);
      });
  }

  stopTalkback() {
    if (this.audioInput) this.audioInput.stop();
  }

  sendStatusCommand() {
    const { connection } = this;
    if (!connection) {
      this.onToast('请先播放');
      return;
    }

    const payload = new TextEncoder().encode('status?');
    connection
      .sendCommand({
        commandId: GET_DEVICE_STATUS_COMMAND_ID,
        data: payload,
      })
      .catch((error) => {
        this.onError(formatError(error));
        this.onToast(`发送命令失败: ${formatError(error)}`, 'error');
      });
    this.onToast('已发送设备状态请求');
  }

  sendHelloStreamMessage() {
    const { connection } = this;
    if (!connection) {
      this.onToast('请先播放');
      return;
    }

    const timestampMs = Date.now() >>> 0;
    const payload = new TextEncoder().encode('hello');
    connection
      .sendStreamMessage({
        streamId: STREAM_MESSAGE_ID,
        timestampMs,
        data: payload,
      })
      .catch((error) => {
        this.onError(formatError(error));
        this.onToast(`发送流消息失败: ${formatError(error)}`, 'error');
      });
    this.onToast('已发送流消息');
  }

  mountListeners() {
    const { connection } = this;
    if (!connection) return;

    // 赋值会覆盖，连上后挂一次即可，不要每次发送再挂
    connection.onCommand = ({ commandId, data }) => {
      const payloadText = decodeBinaryText(data);
      if (commandId === GET_DEVICE_STATUS_RESULT_COMMAND_ID) {
        this.onToast(`设备状态响应: ${payloadText}`, 'success');
        return;
      }
      console.log(`received command 0x${commandId.toString(16)} payload=${payloadText}`);
    };

    connection.onStreamMessage = ({ streamId, timestampMs, data }) => {
      const payloadText = decodeBinaryText(data);
      if (payloadText) {
        this.onToast(`收到设备流消息: ${payloadText}`, 'success');
      }
      console.log(
        `received stream message stream_id=0x${streamId.toString(16)} timestamp_ms=${timestampMs} payload=${payloadText}`,
      );
    };
  }
}

export { readUrlParams, initTiRtc, SamplePlayer, formatError };
