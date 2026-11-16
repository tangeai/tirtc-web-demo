import { TiCloudStorage, TiCloudStorageVideoOutput, TiCloudStorageAudioOutput } from '@/libs/tirtc';

// 云存回放示例：init → 查当月有录像的日期 → 查选中那天 → 播放 / 导出。
// 时区只用浏览器时区，保证 listRecordingDays 的自然日和 listRecordings 的本地 00:00 是同一天。

const EXPORT_MAX_MS = 60 * 1000;
const EXPORT_HINT = '点录像段右侧的「导出」，下载该段前 60 秒的 MP4';
const SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4, 8];

function readUrlParams() {
  const search = new URLSearchParams(window.location.search);
  return {
    appId: search.get('app_id') || '',
    token: search.get('token') || '',
    endpoint: search.get('endpoint') || '',
    date: search.get('date') || new Date().toLocaleDateString('sv-SE'),
  };
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}

// 选中日期所在月份。起止都包含，单月不会超过 31 天
function monthRange(dateValue) {
  const [year, month] = dateValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (value) => String(value).padStart(2, '0');
  return { startDate: `${year}-${pad(month)}-01`, endDate: `${year}-${pad(month)}-${pad(lastDay)}` };
}

// 当地时间当天 00:00 到次日 00:00
function dayRangeMs(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return {
    dayStartMs: new Date(year, month - 1, day).getTime(),
    nextDayStartMs: new Date(year, month - 1, day + 1).getTime(),
  };
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
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
    this.loadedMonth = '';
    this.speed = 1;
    this.timeZoneId = browserTimeZone();
    this.videoOutput = new TiCloudStorageVideoOutput({ view });
    this.audioOutput = new TiCloudStorageAudioOutput();
  }

  snapshot(ok, recordings = []) {
    return {
      ok,
      ready: Boolean(this.cloudStorage),
      days: this.days,
      recordings,
      month: this.loadedMonth,
    };
  }

  // 点「查询」才 init。改日期不会重新初始化，改 App ID / Token / 服务地址后需要再点一次查询。
  async query({ appId, token, endpoint, date, speed }) {
    this.resetExport();
    this.onExportStatus(EXPORT_HINT);
    this.replay?.dispose();
    this.replay = null;
    this.cloudStorage = null;
    this.days = [];
    this.loadedMonth = '';
    this.onStatus('查询中...');

    const code = await TiCloudStorage.init({ appId, endpoint });
    if (code !== 0) {
      this.onStatus(`初始化失败：${code}`);
      return this.snapshot(false);
    }

    this.cloudStorage = new TiCloudStorage(token);
    this.mountReplay(speed);
    return this.loadMonth(date);
  }

  mountReplay(speed) {
    this.replay?.dispose();
    this.replay = this.cloudStorage.createReplay();
    if (!this.replay) return;

    this.replay.setSpeed(Number(speed ?? this.speed));
    this.speed = this.replay.speed;
    this.replay.onTimeChanged = (timeMs) => this.onTime(formatTime(timeMs));
    this.replay.onCompleted = () => this.onStatus('播放完成');
    this.replay.onError = (errorCode) => this.onStatus(`播放失败：${errorCode}`);
    this.videoOutput.attach(this.replay, 0);
    this.audioOutput.attach(this.replay, 0);
  }

  // 换月再查 listRecordingDays；同一个月只更新选中那天的录像段
  async selectDate(date) {
    if (!this.cloudStorage) {
      this.onStatus('请先查询');
      return this.snapshot(false);
    }

    this.onStatus('查询中...');
    this.replay?.stop();
    if (date.slice(0, 7) !== this.loadedMonth) return this.loadMonth(date);
    return this.loadDay(date);
  }

  async loadMonth(date) {
    const { startDate, endDate } = monthRange(date);
    const { code, days } = await this.cloudStorage.listRecordingDays(startDate, endDate, this.timeZoneId);
    if (code !== 0) {
      this.days = [];
      this.loadedMonth = '';
      this.onStatus(`日期查询失败：${code}`);
      return this.snapshot(false);
    }

    this.days = days;
    this.loadedMonth = date.slice(0, 7);
    return this.loadDay(date);
  }

  async loadDay(date) {
    const selected = this.days.find((day) => day.date === date);
    if (!selected?.hasRecording) {
      this.onStatus('这一天没有录像');
      return this.snapshot(true);
    }

    const { dayStartMs, nextDayStartMs } = dayRangeMs(date);
    const { code, recordings } = await this.cloudStorage.listRecordings(dayStartMs, nextDayStartMs);
    if (code !== 0) {
      this.onStatus(`查询失败：${code}`);
      return this.snapshot(false);
    }

    this.onStatus(`共 ${recordings.length} 段录像`);
    return this.snapshot(true, recordings);
  }

  play(range) {
    if (!this.replay) {
      this.onStatus('请先查询');
      return;
    }

    const code = this.replay.play(range.startTimeMs, range.endTimeMs);
    const label = `${formatTime(range.startTimeMs)} - ${formatTime(range.endTimeMs)}`;
    this.onStatus(code === 0 ? `播放 ${label}` : `播放失败：${code}`);
  }

  pause() {
    this.replay?.pause();
  }

  resume() {
    this.replay?.resume();
  }

  stop() {
    this.replay?.stop();
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

export { SPEEDS, EXPORT_HINT, readUrlParams, formatTime, SampleCloudStorage };
