import { TiCloudStorageErrorCode as ErrorCode } from '@/libs/tirtc';
import Emitter from '@/utils/emitter.js';

// 把一段时间的录像导出成 MP4 并下载。与回放互不影响，同一时间只能有一个任务。
// 不建连。页面把客户端的 storage 和时间范围传进来。
//
// 用法：
//   const exporter = new Exporter();
//   exporter.on('change', (state) => ...);
//   await exporter.start(client.storage, { startTimeMs, endTimeMs, videoChannelId, audioChannelId });
//   audioChannelId 为 null 时只导出画面。
//
// SDK 的云存接口不抛异常，失败时返回非 0 错误码，这里统一转成 state.status 的一行文字。

// MP4 整个在浏览器内存里生成，示例只导出每段的前 60 秒
export const EXPORT_MAX_MS = 60 * 1000;

export const initialExportState = Object.freeze({
  exporting: false,
  status: '',
});

export class Exporter extends Emitter {
  state = initialExportState;

  #task = null;

  // 导出 range 的前 60 秒并下载。storage 为空表示还没查询。
  // audioChannelId 为 null 时只导出画面。
  async start(storage, { startTimeMs, endTimeMs, videoChannelId, audioChannelId = null }) {
    if (!storage) return this.#setState({ status: '请先查询' });
    if (this.#task) return;

    const end = Math.min(endTimeMs, startTimeMs + EXPORT_MAX_MS);
    const options = { startTimeMs, endTimeMs: end, videoChannelId };
    // SDK 把 null 当成非法通道。不传 audioChannelId 才是只导出画面。
    if (audioChannelId != null) options.audioChannelId = audioChannelId;
    const { code, task } = storage.exportRecording(options, (progress) =>
      this.#setState({ status: `导出中 ${Math.round(progress * 100)}%` }),
    );
    if (code !== ErrorCode.OK) return this.#setState({ status: `导出失败：${code}` });

    this.#task = task;
    this.#setState({ exporting: true, status: '导出中 0%' });

    // code 为 0 只表示已开始，结果要等 task.result
    const result = await task.result;
    // 取消或离开页面后不再更新界面
    if (this.#task !== task) return;
    this.#task = null;
    this.#setState({ exporting: false, status: saveExportResult(result, startTimeMs) });
  }

  cancel() {
    this.#task?.cancel();
  }

  // 页面卸载时调用。之后不能再用
  dispose() {
    const task = this.#task;
    this.#task = null;
    task?.cancel();
    this.removeAllListeners();
  }

  #setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }
}

// 成功时下载文件，返回要显示的结果文字
function saveExportResult({ code, file }, startTimeMs) {
  if (code === ErrorCode.CANCELLED) return '已取消导出';
  if (code !== ErrorCode.OK) return `导出失败：${code}`;

  downloadMp4(file.blob, startTimeMs);
  return `导出完成，时长 ${(file.durationMs / 1000).toFixed(1)} 秒`;
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
