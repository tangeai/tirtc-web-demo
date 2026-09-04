// 静态引入 vendor 下的 SDK；wasm 由 SDK 内 new URL('./xxx.wasm', import.meta.url) 解析
import {
  TiRtc,
  TiRtcInitOptions,
  TiRtcConn,
  TiRtcVideoOutput,
  TiRtcAudioOutput,
  TiRtcAudioInput,
} from '@/vendor/tirtc/tirtc.es.min.js';

// 设备流约定：音频下行 10、视频下行 11、对讲上行 14、自定义流消息 3
const AUDIO_STREAM_ID = 10;
const VIDEO_STREAM_ID = 11;
const AUDIO_INPUT_STREAM_ID = 14;
const STREAM_MESSAGE_ID = 3;
const AUDIO_SAMPLE_RATE = 8000;

const GET_DEVICE_STATUS_COMMAND_ID = 0x10000;
const GET_DEVICE_STATUS_RESULT_COMMAND_ID = 0x10002;

function decodeBinaryText(data) {
  if (!data) return '';
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  return '';
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

  // 需等 wasm 下载完成，才能安全创建视频输出
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

    const connection = new TiRtcConn();
    const audioOutput = TiRtcAudioOutput({ connection, streamId: AUDIO_STREAM_ID });
    const videoOutput = TiRtcVideoOutput({ connection, streamId: VIDEO_STREAM_ID });
    const audioInput = new TiRtcAudioInput({ connection, streamId: AUDIO_INPUT_STREAM_ID });
    audioInput.setOptions({ sampleRate: AUDIO_SAMPLE_RATE });

    this.connection = connection;
    this.audioOutput = audioOutput;
    this.videoOutput = videoOutput;
    this.audioInput = audioInput;

    connection
      .connect({ deviceId, token })
      .then(() => {
        audioOutput.attach();
        videoOutput.attach();
        connection.subscribeAudio({ streamId: AUDIO_STREAM_ID });
        connection.subscribeVideo({ streamId: VIDEO_STREAM_ID });
        connection.requestKeyFrame({ streamId: VIDEO_STREAM_ID });
        this.mountListeners();
      })
      .catch((error) => {
        this.isPlaying = false;
        this.onError(error);
        console.log('failed to connect device: ', error);
      });
  }

  stop() {
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
    if (!audioInput) return;

    audioInput.start().then(() => {
      audioInput.attach().catch((error) => {
        this.onError(error);
        console.log(error);
      });
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
        this.onError(error);
        this.onToast(`发送命令失败: ${error}`, 'error');
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
        this.onError(error);
        this.onToast(`发送流消息失败: ${error}`, 'error');
      });
    this.onToast('已发送流消息');
  }

  mountListeners() {
    const { connection } = this;
    if (!connection) return;

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

export { readUrlParams, initTiRtc, SamplePlayer };
