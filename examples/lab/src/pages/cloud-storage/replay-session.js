import {
  TiCloudStorage,
  TiCloudStorageVideoOutput,
  TiCloudStorageAudioOutput,
  TiCloudStorageErrorCode as ErrorCode,
} from '@/libs/tirtc';
import Emitter from '@/utils/emitter.js';
import { browserTimeZone, dateRangeError, dayRangeMs, formatTime } from './date-utils.js';

// 一次云存回放会话：初始化 → 查哪些天有录像 → 查某一天的录像段 → 播放 / 跳转 / 倍速 / 导出。
//
// 用法：
//   const session = new ReplaySession({ view: canvas });
//   session.on('change', (state) => ...);  // 状态变了就通知，页面整体替换显示
//   await session.query({ appId, token, endpoint, startDate, endDate });
//   session.play(session.state.recordings[0]);
//
// SDK 的云存接口不抛异常，失败时返回非 0 错误码，这里统一转成 state.status 的一行文字。

// 与 SDK 一致的七档倍速，非 1 倍速时 SDK 会静音
export const SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4, 8];

// MP4 整个在浏览器内存里生成，示例只导出每段的前 60 秒
export const EXPORT_MAX_MS = 60 * 1000;

// 设备只有一路画面和一路声音时，通道号都是 0
const VIDEO_CHANNEL_ID = 0;
const AUDIO_CHANNEL_ID = 0;

export const initialReplayState = Object.freeze({
  status: '', // 查询、播放的结果，一行文字
  ready: false, // 查询成功过，可以按天查、播放、导出
  days: [], // [{ date: 'YYYY-MM-DD', hasRecording }]，按日期升序
  selectedDate: '',
  recordings: [], // 选中那天的录像段 [{ startTimeMs, endTimeMs }]
  speed: 1,
  range: null, // 本次播放的绝对时间区间 { startTimeMs, endTimeMs }；没在播放时为 null，播完保留
  currentTimeMs: 0, // 当前播放到的绝对时间
  exporting: false,
  exportStatus: '',
});

export class ReplaySession extends Emitter {
  state = initialReplayState;

  #cloudStorage = null;
  #replay = null;
  #exportTask = null;
  // 每次查询加一。查询是异步的，回来时编号变了说明用户又发起了新查询，结果作废
  #querySeq = 0;
  #timeZoneId = browserTimeZone();

  // 视频和音频输出整个会话只建一次，每次换 replay 时重新 attach
  #videoOutput;
  #audioOutput;

  // view：渲染画面的 canvas 元素
  constructor({ view }) {
    super();
    this.#videoOutput = new TiCloudStorageVideoOutput({ view });
    this.#audioOutput = new TiCloudStorageAudioOutput();
  }

  // ---------- 查询 ----------

  // 用新的凭证重新初始化，查出范围内哪些天有录像，并打开最近有录像的那一天。
  // 改了 App ID、Token、服务地址或日期范围，都要重新调用。
  async query({ appId, token, endpoint, startDate, endDate }) {
    const inputError = queryInputError({ appId, token, startDate, endDate });
    if (inputError) return this.#setState({ status: inputError });

    const seq = ++this.#querySeq;
    this.#reset();
    this.#setState({ status: '查询中...' });

    const code = await TiCloudStorage.init({ appId, endpoint });
    if (seq !== this.#querySeq) return;
    if (code !== ErrorCode.OK) return this.#setState({ status: `初始化失败：${code}` });

    this.#cloudStorage = new TiCloudStorage(token);
    this.#mountReplay();

    const result = await this.#cloudStorage.listRecordingDays(startDate, endDate, this.#timeZoneId);
    if (seq !== this.#querySeq) return;
    if (result.code !== ErrorCode.OK) return this.#setState({ status: `日期查询失败：${result.code}` });

    this.#setState({ ready: true, days: result.days });
    const latest = [...result.days].reverse().find((day) => day.hasRecording);
    if (!latest) return this.#setState({ status: '这段时间没有录像' });
    await this.#loadDay(seq, latest.date);
  }

  // 切换到范围内的另一天。只查这一天的录像段，不重新初始化
  async selectDate(date) {
    if (!this.state.ready) return;
    const seq = ++this.#querySeq;
    this.stop();
    await this.#loadDay(seq, date);
  }

  async #loadDay(seq, date) {
    this.#setState({ status: '查询中...', selectedDate: date, recordings: [] });
    if (!this.state.days.find((day) => day.date === date)?.hasRecording) {
      return this.#setState({ status: '这一天没有录像' });
    }

    const { dayStartMs, nextDayStartMs } = dayRangeMs(date);
    const { code, recordings } = await this.#cloudStorage.listRecordings(dayStartMs, nextDayStartMs);
    if (seq !== this.#querySeq) return;
    if (code !== ErrorCode.OK) return this.#setState({ status: `查询失败：${code}` });
    this.#setState({ status: `共 ${recordings.length} 段录像`, recordings });
  }

  // ---------- 播放 ----------

  play({ startTimeMs, endTimeMs }) {
    if (!this.#replay) return;
    const code = this.#replay.play(startTimeMs, endTimeMs);
    if (code !== ErrorCode.OK) return this.#setState({ status: `播放失败：${code}` });

    this.#setState({
      status: `播放 ${formatTime(startTimeMs)} - ${formatTime(endTimeMs)}`,
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

  // 播放前后都可以切，没有 replay 时先记下，下次查询后生效
  setSpeed(speed) {
    if (this.#replay) {
      const code = this.#replay.setSpeed(speed);
      if (code !== ErrorCode.OK) return this.#setState({ status: `设置倍速失败：${code}` });
    }
    this.#setState({ speed });
  }

  // 一个 replay 对应一组凭证。视频、音频输出都挂到它上面，画面和声音由 SDK 同步
  #mountReplay() {
    const replay = this.#cloudStorage.createReplay();
    replay.setSpeed(this.state.speed);
    replay.onTimeChanged = (timeMs) => this.#setState({ currentTimeMs: timeMs });
    // 最后一帧常略早于区间终点，界面直接停在终点
    replay.onCompleted = () => this.#setState({ status: '播放完成', currentTimeMs: this.state.range?.endTimeMs ?? 0 });
    replay.onError = (code) => this.#setState({ status: `播放失败：${code}`, range: null, currentTimeMs: 0 });

    this.#videoOutput.attach(replay, VIDEO_CHANNEL_ID);
    this.#audioOutput.attach(replay, AUDIO_CHANNEL_ID);
    this.#replay = replay;
  }

  // ---------- 导出 ----------

  // 导出 range 的前 60 秒并下载。同一时间只能有一个导出任务，与回放互不影响
  async exportRange({ startTimeMs, endTimeMs }) {
    if (!this.#cloudStorage || this.#exportTask) return;

    const end = Math.min(endTimeMs, startTimeMs + EXPORT_MAX_MS);
    const { code, task } = this.#cloudStorage.exportRecording(
      { startTimeMs, endTimeMs: end, videoChannelId: VIDEO_CHANNEL_ID, audioChannelId: AUDIO_CHANNEL_ID },
      (progress) => this.#setState({ exportStatus: `导出中 ${Math.round(progress * 100)}%` }),
    );
    if (code !== ErrorCode.OK) return this.#setState({ exportStatus: `导出失败：${code}` });

    this.#exportTask = task;
    this.#setState({ exporting: true, exportStatus: '导出中 0%' });

    // code 为 0 只表示已开始，结果要等 task.result
    const result = await task.result;
    // 期间重新查询或离开页面，任务已被取消，不再更新界面
    if (this.#exportTask !== task) return;
    this.#exportTask = null;
    this.#setState({ exporting: false, exportStatus: this.#saveExportResult(result, startTimeMs) });
  }

  // 成功时下载文件，返回要显示的结果文字
  #saveExportResult({ code, file }, startTimeMs) {
    if (code === ErrorCode.CANCELLED) return '已取消导出';
    if (code !== ErrorCode.OK) return `导出失败：${code}`;

    downloadMp4(file.blob, startTimeMs);
    return `导出完成，时长 ${(file.durationMs / 1000).toFixed(1)} 秒`;
  }

  cancelExport() {
    this.#exportTask?.cancel();
  }

  // ---------- 清理 ----------

  // 页面卸载时调用。之后这个会话不能再用
  dispose() {
    this.#querySeq += 1;
    this.removeAllListeners();
    this.#reset();
    this.#videoOutput.dispose();
    this.#audioOutput.dispose();
  }

  // 换凭证前清掉上一次的导出、回放和查询结果；倍速保留
  #reset() {
    const task = this.#exportTask;
    this.#exportTask = null;
    task?.cancel();

    this.#replay?.dispose();
    this.#replay = null;
    this.#cloudStorage?.dispose();
    this.#cloudStorage = null;

    this.#setState({ ...initialReplayState, speed: this.state.speed });
  }

  #setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }
}

function queryInputError({ appId, token, startDate, endDate }) {
  if (!appId) return '请填写 App ID';
  if (!token) return '请填写 Token';
  return dateRangeError(startDate, endDate);
}

// 结果是内存里的 Blob，用 <a download> 存到本地
function downloadMp4(blob, startTimeMs) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `recording-${new Date(startTimeMs).toLocaleString('sv-SE').replace(/[: ]/g, '-')}.mp4`;
  link.click();
  // 立即释放的话，部分浏览器下载会失败
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
