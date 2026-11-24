import { TiCloudStorageErrorCode as ErrorCode } from '@/libs/tirtc';
import Emitter from '@/utils/emitter.js';
import { browserTimeZone, dateRangeError, dayRangeMs } from './date-utils.js';

// 一次录像查询：打开客户端 → 查哪些天有录像 → 查某一天的录像段。
// 不创建 TiCloudStorage，也不管播放和导出。
//
// 用法：
//   const query = new Query(client);
//   query.on('change', (state) => ...);  // 状态变了就通知，页面整体替换显示
//   query.query({ appId, token, endpoint, startDate, endDate });
//
// SDK 的云存接口不抛异常，失败时返回非 0 错误码，这里统一转成 state.status 的一行文字。

export const initialQueryState = Object.freeze({
  status: '', // 查询结果，一行文字
  days: [], // [{ date: 'YYYY-MM-DD', hasRecording }]，按日期升序
  selectedDate: '',
  recordings: [], // 选中那天的录像段 [{ startTimeMs, endTimeMs }]
});

export class Query extends Emitter {
  state = initialQueryState;

  #client;
  // 每次查询加一。查询是异步的，回来时编号变了说明用户又发起了新查询，结果作废
  #seq = 0;
  #timeZoneId = browserTimeZone();

  constructor(client) {
    super();
    this.#client = client;
  }

  // 查出范围内哪些天有录像，并打开最近有录像的那一天。
  // 输入不合法时返回 false，查询没有开始。
  query({ appId, token, endpoint, startDate, endDate }) {
    const inputError = queryInputError({ appId, token, startDate, endDate });
    if (inputError) {
      this.#setState({ status: inputError });
      return false;
    }

    this.#run({ appId, token, endpoint, startDate, endDate });
    return true;
  }

  // 切换到范围内的另一天。只查这一天的录像段，不重新初始化
  async selectDate(date) {
    if (!this.#client.storage) return;
    const seq = ++this.#seq;
    await this.#loadDay(seq, date);
  }

  // 页面卸载时调用。之后不能再用。客户端由页面释放
  dispose() {
    this.#seq += 1;
    this.removeAllListeners();
  }

  async #run({ appId, token, endpoint, startDate, endDate }) {
    const seq = ++this.#seq;
    this.#setState({ status: '查询中...', days: [], selectedDate: '', recordings: [] });

    const code = await this.#client.open({ appId, token, endpoint });
    if (seq !== this.#seq) return;
    if (code !== ErrorCode.OK) return this.#setState({ status: `初始化失败：${code}` });

    const result = await this.#client.storage.listRecordingDays(startDate, endDate, this.#timeZoneId);
    if (seq !== this.#seq) return;
    if (result.code !== ErrorCode.OK) return this.#setState({ status: `日期查询失败：${result.code}` });

    this.#setState({ days: result.days });
    const latest = [...result.days].reverse().find((day) => day.hasRecording);
    if (!latest) return this.#setState({ status: '这段时间没有录像' });
    await this.#loadDay(seq, latest.date);
  }

  async #loadDay(seq, date) {
    this.#setState({ status: '查询中...', selectedDate: date, recordings: [] });
    if (!this.state.days.find((day) => day.date === date)?.hasRecording) {
      return this.#setState({ status: '这一天没有录像' });
    }

    const { dayStartMs, nextDayStartMs } = dayRangeMs(date);
    const { code, recordings } = await this.#client.storage.listRecordings(dayStartMs, nextDayStartMs);
    if (seq !== this.#seq) return;
    if (code !== ErrorCode.OK) return this.#setState({ status: `查询失败：${code}` });
    this.#setState({ status: `共 ${recordings.length} 段录像`, recordings });
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
