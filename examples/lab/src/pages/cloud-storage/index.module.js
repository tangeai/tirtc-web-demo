import dayjs from 'dayjs';
import { TiCloudStorage, TiCloudStorageVideoOutput, TiCloudStorageAudioOutput } from '@/libs/tirtc';

// 云存回放示例：init → 查所选范围内有录像的日期 → 查选中那天 → 播放 / 导出。
// 时区只用浏览器时区，保证 listRecordingDays 的自然日和 listRecordings 的本地 00:00 是同一天。
// listRecordingDays 一次最多 31 天。录像段仍按天查：listRecordings 一次最长 10 天，列表也是按天展示。

const EXPORT_MAX_MS = 60 * 1000;
const EXPORT_TIP = `下载该段前 ${EXPORT_MAX_MS / 1000} 秒`;
const SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4, 8];
const MAX_QUERY_DAYS = 31;

// YYYY-MM-DD 按浏览器本地零点解析。直接 dayjs('YYYY-MM-DD') 会当成 UTC 零点，西时区会偏到前一天。
function parseDay(dateValue) {
  const [year, month, day] = String(dateValue ?? '')
    .split('-')
    .map(Number);
  if (!year || !month || !day) return dayjs(Number.NaN);
  return dayjs(new Date(year, month - 1, day));
}

function formatDay(value) {
  return value.format('YYYY-MM-DD');
}

function isDayString(value) {
  const parsed = parseDay(value);
  return parsed.isValid() && formatDay(parsed) === value;
}

// 含今天。最近 7 天是今天往前 6 天，不是往前 7 天。
function recentDays(count) {
  const end = dayjs().startOf('day');
  const start = end.subtract(count - 1, 'day');
  return { startDate: formatDay(start), endDate: formatDay(end) };
}

// Naive UI 的 shortcuts 要时间戳，不是日期字符串。
function recentDayTimestamps(count) {
  const end = dayjs().startOf('day');
  const start = end.subtract(count - 1, 'day');
  return [start.valueOf(), end.valueOf()];
}

// 起止都包含。超过 31 天不发请求，和云存服务端一致。
function dateRangeError(startDate, endDate) {
  if (!isDayString(startDate) || !isDayString(endDate)) return '请选择日期';
  const days = parseDay(endDate).diff(parseDay(startDate), 'day') + 1;
  if (days < 1) return '请选择日期';
  if (days > MAX_QUERY_DAYS) return '一次最多查询 31 天';
  return '';
}

function readUrlParams() {
  const search = new URLSearchParams(window.location.search);
  const { startDate, endDate } = recentDays(7);
  return {
    appId: search.get('app_id') || '',
    token: search.get('token') || '',
    endpoint: search.get('endpoint') || '',
    startDate,
    endDate,
  };
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}

// 当地时间当天 00:00 到次日 00:00
function dayRangeMs(dateValue) {
  const start = parseDay(dateValue);
  return {
    dayStartMs: start.valueOf(),
    nextDayStartMs: start.add(1, 'day').valueOf(),
  };
}

function formatTime(ms) {
  return dayjs(ms).format('HH:mm:ss');
}

// 不足 1 小时是「分:秒」，分不补零，例如 3:15。满 1 小时再带上小时，例如 1:02:05。
function formatDuration(startMs, endMs) {
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  return `${minutes}:${seconds}`;
}

function downloadMp4(blob, startTimeMs) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `recording-${new Date(startTimeMs).toLocaleString('sv-SE').replace(/[: ]/g, '-')}.mp4`;
  link.click();
  // 立即释放的话，部分浏览器下载会失败
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class SampleCloudStorage {
  constructor({ view, onStatus, onTime, onExportStatus, onExporting } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onTime = onTime || (() => {});
    this.onExportStatus = onExportStatus || (() => {});
    this.onExporting = onExporting || (() => {});
    this.cloudStorage = null;
    this.replay = null;
    this.exportTask = null;
    this.days = [];
    this.speed = 1;
    // 本次播放的绝对时间区间。进度和跳转都用它。手动停止、出错、重新查询后清空；播完保留。
    this.range = null;
    this.timeZoneId = browserTimeZone();
    this.videoOutput = new TiCloudStorageVideoOutput({ view });
    this.audioOutput = new TiCloudStorageAudioOutput();
  }

  snapshot(ok, recordings = [], selectedDate = '') {
    return {
      ok,
      ready: Boolean(this.cloudStorage),
      days: this.days,
      recordings,
      selectedDate,
    };
  }

  // 点「查询」才 init。改日期范围也要再点查询；只点某一天不会重新初始化。
  // 改 App ID / Token / 服务地址后同样需要再点一次查询。
  async query({ appId, token, endpoint, startDate, endDate, speed }) {
    const rangeError = dateRangeError(startDate, endDate);
    if (rangeError) {
      this.onStatus(rangeError);
      return this.snapshot(false);
    }

    this.resetExport();
    this.onExportStatus('');
    this.clearPlayback();
    this.replay?.dispose();
    this.replay = null;
    this.cloudStorage = null;
    this.days = [];
    this.onStatus('查询中...');

    const code = await TiCloudStorage.init({ appId, endpoint });
    if (code !== 0) {
      this.onStatus(`初始化失败：${code}`);
      return this.snapshot(false);
    }

    this.cloudStorage = new TiCloudStorage(token);
    this.mountReplay(speed);
    return this.loadRange(startDate, endDate);
  }

  mountReplay(speed) {
    this.replay?.dispose();
    this.replay = this.cloudStorage.createReplay();
    if (!this.replay) return;

    this.replay.setSpeed(Number(speed ?? this.speed));
    this.speed = this.replay.speed;
    this.replay.onTimeChanged = (timeMs) => this.notifyTime(timeMs);
    // SDK 在回调前已经清掉 session，最后一帧也常略早于终点，所以界面停在区间终点。
    this.replay.onCompleted = () => {
      this.onStatus('播放完成');
      this.notifyTime(this.range?.endTimeMs);
    };
    this.replay.onError = (errorCode) => {
      this.onStatus(`播放失败：${errorCode}`);
      this.clearPlayback();
    };
    this.videoOutput.attach(this.replay, 0);
    this.audioOutput.attach(this.replay, 0);
  }

  // 日期按钮只重查这一天。范围已经在点「查询」时拉过，这里不再 listRecordingDays，也不重新 init。
  async selectDate(date) {
    if (!this.cloudStorage) {
      this.onStatus('请先查询');
      return this.snapshot(false);
    }

    this.onStatus('查询中...');
    this.stop();
    return this.loadDay(date);
  }

  async loadRange(startDate, endDate) {
    const { code, days } = await this.cloudStorage.listRecordingDays(startDate, endDate, this.timeZoneId);
    if (code !== 0) {
      this.days = [];
      this.onStatus(`日期查询失败：${code}`);
      return this.snapshot(false);
    }

    this.days = days;
    // 范围内有录像时，先打开最近的一天。其它天用日期按钮切换。
    const latest = [...days].reverse().find((day) => day.hasRecording);
    if (!latest) {
      this.onStatus('这段时间没有录像');
      return this.snapshot(true);
    }
    return this.loadDay(latest.date);
  }

  async loadDay(date) {
    const selected = this.days.find((day) => day.date === date);
    if (!selected?.hasRecording) {
      this.onStatus('这一天没有录像');
      return this.snapshot(true, [], date);
    }

    const { dayStartMs, nextDayStartMs } = dayRangeMs(date);
    const { code, recordings } = await this.cloudStorage.listRecordings(dayStartMs, nextDayStartMs);
    if (code !== 0) {
      this.onStatus(`查询失败：${code}`);
      return this.snapshot(false, [], date);
    }

    this.onStatus(`共 ${recordings.length} 段录像`);
    return this.snapshot(true, recordings, date);
  }

  play(range) {
    if (!this.replay) {
      this.onStatus('请先查询');
      return;
    }

    const { startTimeMs, endTimeMs } = range;
    const code = this.replay.play(startTimeMs, endTimeMs);
    const label = `${formatTime(startTimeMs)} - ${formatTime(endTimeMs)}`;
    if (code !== 0) {
      this.onStatus(`播放失败：${code}`);
      return;
    }

    this.range = { startTimeMs, endTimeMs };
    this.notifyTime(startTimeMs);
    this.onStatus(`播放 ${label}`);
  }

  // 跳到绝对时间，并立刻把界面拨过去。timeMs 必须落在 [start, end) 里。
  // 播完后 session 已经没了，replay.seek 会失败，这时用记住的区间重新 play。
  seek(timeMs) {
    if (!this.replay || !this.range) {
      this.onStatus('请先播放');
      return;
    }

    const { startTimeMs, endTimeMs } = this.range;
    let code = this.replay.seek(timeMs);
    if (code !== 0) code = this.replay.play(startTimeMs, endTimeMs, timeMs);
    if (code !== 0) {
      this.onStatus(`跳转失败：${code}`);
      return;
    }

    this.notifyTime(timeMs);
  }

  pause() {
    this.replay?.pause();
  }

  resume() {
    this.replay?.resume();
  }

  stop() {
    this.replay?.stop();
    this.clearPlayback();
  }

  // 每次都交出当时的完整播放状态。没有区间或没有时间，就是还没在播。
  notifyTime(timeMs) {
    const range = this.range;
    if (!range || !Number.isFinite(timeMs)) {
      this.onTime({ text: '--:--:--', currentTimeMs: 0, startTimeMs: 0, endTimeMs: 0 });
      return;
    }

    this.onTime({
      text: formatTime(timeMs),
      currentTimeMs: timeMs,
      startTimeMs: range.startTimeMs,
      endTimeMs: range.endTimeMs,
    });
  }

  clearPlayback() {
    this.range = null;
    this.notifyTime();
  }

  // 倍速 0.125 ~ 8 七档，播放前后都可以切。失败时回退到当前速度。
  setSpeed(speed) {
    const value = Number(speed);
    if (!this.replay) {
      this.speed = value;
      return value;
    }

    const code = this.replay.setSpeed(value);
    if (code !== 0) {
      this.onStatus(`设置倍速失败：${code}`);
      return this.replay.speed;
    }

    this.speed = this.replay.speed;
    return this.speed;
  }

  // MP4 整个在浏览器内存里生成，示例只导出每段的前 60 秒
  async exportRange(range) {
    if (!this.cloudStorage) {
      this.onExportStatus('请先查询');
      return;
    }
    if (this.exportTask) {
      this.onExportStatus('上一个导出还没结束');
      return;
    }

    const startTimeMs = range.startTimeMs;
    const endTimeMs = Math.min(range.endTimeMs, startTimeMs + EXPORT_MAX_MS);
    const { code, task } = this.cloudStorage.exportRecording(
      { startTimeMs, endTimeMs, videoChannelId: 0, audioChannelId: 0 },
      (progress) => this.onExportStatus(`导出中 ${Math.round(progress * 100)}%`),
    );
    if (code !== 0) {
      this.onExportStatus(`导出失败：${code}`);
      return;
    }

    this.exportTask = task;
    this.onExporting(true);
    this.onExportStatus('导出中 0%');

    const { code: resultCode, file } = await task.result;
    if (this.exportTask !== task) return;

    this.exportTask = null;
    this.onExporting(false);
    if (resultCode !== 0) {
      this.onExportStatus(resultCode === 6115 ? '已取消导出' : `导出失败：${resultCode}`);
      return;
    }

    downloadMp4(file.blob, startTimeMs);
    this.onExportStatus(`导出完成，时长 ${(file.durationMs / 1000).toFixed(1)} 秒`);
  }

  cancelExport() {
    this.exportTask?.cancel();
  }

  resetExport() {
    const task = this.exportTask;
    this.exportTask = null;
    this.onExporting(false);
    task?.cancel();
  }

  dispose() {
    this.onStatus = () => {};
    this.onTime = () => {};
    this.onExportStatus = () => {};
    this.onExporting = () => {};
    this.resetExport();
    this.replay?.dispose();
    this.replay = null;
    this.videoOutput.dispose();
    this.audioOutput.dispose();
    this.cloudStorage?.dispose();
    this.cloudStorage = null;
  }
}

export {
  SPEEDS,
  EXPORT_TIP,
  readUrlParams,
  formatTime,
  formatDuration,
  recentDayTimestamps,
  dateRangeError,
  SampleCloudStorage,
};
