import dayjs from 'dayjs';

// 云存示例的日期和时间工具，全部按浏览器本地时区计算。
// listRecordingDays 按时区切自然日，listRecordings 用本地 00:00 起算，两者必须是同一个时区，否则会差一天。

export const MAX_QUERY_DAYS = 31;

// YYYY-MM-DD 按浏览器本地零点解析。直接 dayjs('YYYY-MM-DD') 会当成 UTC 零点，西时区会偏到前一天。
export function parseDay(dateValue) {
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
export function recentDays(count) {
  const end = dayjs().startOf('day');
  const start = end.subtract(count - 1, 'day');
  return { startDate: formatDay(start), endDate: formatDay(end) };
}

// Naive UI 的 shortcuts 要时间戳，不是日期字符串。
export function recentDayTimestamps(count) {
  const end = dayjs().startOf('day');
  const start = end.subtract(count - 1, 'day');
  return [start.valueOf(), end.valueOf()];
}

// 起止都包含。超过 31 天不发请求，和云存服务端一致。
export function dateRangeError(startDate, endDate) {
  if (!isDayString(startDate) || !isDayString(endDate)) return '请选择日期';
  const days = parseDay(endDate).diff(parseDay(startDate), 'day') + 1;
  if (days < 1) return '请选择日期';
  if (days > MAX_QUERY_DAYS) return `一次最多查询 ${MAX_QUERY_DAYS} 天`;
  return '';
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}

// 当地时间当天 00:00 到次日 00:00
export function dayRangeMs(dateValue) {
  const start = parseDay(dateValue);
  return {
    dayStartMs: start.valueOf(),
    nextDayStartMs: start.add(1, 'day').valueOf(),
  };
}

export function formatTime(ms) {
  return dayjs(ms).format('HH:mm:ss');
}

// 不足 1 小时是「分:秒」，分不补零，例如 3:15。满 1 小时再带上小时，例如 1:02:05。
export function formatDuration(startMs, endMs) {
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  return `${minutes}:${seconds}`;
}
