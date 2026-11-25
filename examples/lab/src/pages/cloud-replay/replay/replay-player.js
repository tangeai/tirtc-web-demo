import {
  TiCloudStorageVideoOutput,
  TiCloudStorageAudioOutput,
  TiCloudStorageErrorCode as ErrorCode,
} from '@/libs/tirtc';
import Emitter from '@/utils/emitter.js';
import { formatTime } from './date-utils.js';

// 一次云存回放：播放、跳转、暂停、倍速。
// 不建连，也不查列表。页面把客户端的 storage 和时间范围传进来。
//
// 用法：
//   const player = new ReplayPlayer({ view: canvas });
//   player.on('change', (state) => ...);
//   player.play(client.storage, { startTimeMs, endTimeMs, videoChannelId, audioChannelId });
//   audioChannelId 为 null 时不播放声音。
//
// SDK 的云存接口不抛异常，失败时返回非 0 错误码，这里统一转成 state.status 的一行文字。

// 与 SDK 一致的七档倍速，非 1 倍速时 SDK 会静音
export const SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4, 8];

export const initialPlayerState = Object.freeze({
  status: '', // 播放、跳转、倍速的结果，一行文字
  speed: 1,
  range: null, // 本次播放的绝对时间区间 { startTimeMs, endTimeMs }；没在播放时为 null，播完保留
  currentTimeMs: 0, // 当前播放到的绝对时间
});

export class ReplayPlayer extends Emitter {
  state = initialPlayerState;

  #storage = null;
  #replay = null;
  // 上次挂上的通道。storage 或通道变了就换一个 replay，再重新 attach
  #channels = null;
  // 视频和音频输出整个播放器只建一次
  #videoOutput;
  #audioOutput;

  // view：渲染画面的 canvas 元素
  constructor({ view }) {
    super();
    this.#videoOutput = new TiCloudStorageVideoOutput({ view });
    this.#audioOutput = new TiCloudStorageAudioOutput();
  }

  // storage 或通道和上次不同，或还没有 replay 时，先 #mount。空的 storage 表示还没查询。
  // audioChannelId 为 null 时只出画面。
  play(storage, { startTimeMs, endTimeMs, videoChannelId, audioChannelId = null }) {
    const channelsChanged = !this.#sameChannels(videoChannelId, audioChannelId);
    if (this.#storage !== storage || !this.#replay || channelsChanged) {
      if (!this.#mount(storage, videoChannelId, audioChannelId)) return this.#setState({ status: '请先查询' });
    }

    const code = this.#replay.play(startTimeMs, endTimeMs);
    if (code !== ErrorCode.OK) return this.#setState({ status: `播放失败：${code}` });

    this.#setState({
      // status: `播放 ${formatTime(startTimeMs)} - ${formatTime(endTimeMs)}`,
      status: '',
      range: { startTimeMs, endTimeMs },
      currentTimeMs: startTimeMs,
    });
  }

  // 跳到区间内的绝对时间，timeMs 必须落在 [start, end) 里。
  // 播完后 SDK 已经结束本次播放，seek 会失败，这时用同一个区间从 timeMs 重新 play。
  seek(timeMs) {
    const { range } = this.state;
    if (!this.#replay || !range) return;

    let code = this.#replay.seek(timeMs);
    if (code !== ErrorCode.OK) code = this.#replay.play(range.startTimeMs, range.endTimeMs, timeMs);
    if (code !== ErrorCode.OK) return this.#setState({ status: `跳转失败：${code}` });
    // 不等 SDK 的下一次时间回调，先把进度拨过去
    this.#setState({ currentTimeMs: timeMs });
  }

  pause() {
    this.#replay?.pause();
  }

  resume() {
    this.#replay?.resume();
  }

  stop() {
    this.#replay?.stop();
    this.#setState({ range: null, currentTimeMs: 0 });
  }

  // 播放前后都可以切。没有 replay 时先记下，第一次播放时生效
  setSpeed(speed) {
    if (this.#replay) {
      const code = this.#replay.setSpeed(speed);
      if (code !== ErrorCode.OK) return this.#setState({ status: `设置倍速失败：${code}` });
    }
    this.#setState({ speed });
  }

  // 页面卸载时调用。之后不能再用
  dispose() {
    this.#replay?.dispose();
    this.#replay = null;
    this.#storage = null;
    this.#channels = null;
    this.removeAllListeners();
    this.#videoOutput.dispose();
    this.#audioOutput.dispose();
  }

  // 拆掉旧 replay，用这个 storage 和通道重新挂上输出。storage 为空或创建失败时返回 false
  #mount(storage, videoChannelId, audioChannelId) {
    this.#replay?.dispose();
    this.#replay = null;
    this.#storage = null;
    this.#channels = null;
    if (!storage) return false;

    const replay = storage.createReplay();
    if (!replay) return false;

    replay.setSpeed(this.state.speed);
    replay.onTimeChanged = (timeMs) => this.#setState({ currentTimeMs: timeMs });
    // 最后一帧常略早于区间终点，界面直接停在终点
    replay.onCompleted = () => this.#setState({ status: '播放完成', currentTimeMs: this.state.range?.endTimeMs ?? 0 });
    replay.onError = (code) => this.#setState({ status: `播放失败：${code}`, range: null, currentTimeMs: 0 });

    this.#videoOutput.attach(replay, videoChannelId);
    // 换通道要拆掉上一路。音频留空就只出画面，不能把 null 传给 attach，否则会当成通道 0。
    if (audioChannelId == null) this.#audioOutput.detach();
    else this.#audioOutput.attach(replay, audioChannelId);
    this.#storage = storage;
    this.#channels = { videoChannelId, audioChannelId };
    this.#replay = replay;
    return true;
  }

  #sameChannels(videoChannelId, audioChannelId) {
    const prev = this.#channels;
    return prev?.videoChannelId === videoChannelId && prev?.audioChannelId === audioChannelId;
  }

  #setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }
}
