// 和设备侧约定的流号、命令号。这些值由设备固件决定，不是随便填的，换设备前先和设备侧确认。

export const STREAMS = {
  audio: 10, // 设备 → 浏览器：音频
  video: 11, // 设备 → 浏览器：视频
  mic: 14, // 浏览器 → 设备：对讲音频
};

// 对讲音频采样率，要和设备支持的一致
export const MIC_SAMPLE_RATE = 8000;

// 流消息走的流号
export const MESSAGE_STREAM_ID = 3;

export const COMMAND = {
  GET_DEVICE_STATUS: 0x10000,
  GET_DEVICE_STATUS_RESULT: 0x10002, // 设备对 GET_DEVICE_STATUS 的应答
};

// 命令和流消息的 data 都是 ArrayBuffer，示例里约定内容是 UTF-8 文本
export function textOf(data) {
  return data instanceof ArrayBuffer ? new TextDecoder().decode(data) : '';
}

export function hex(value) {
  return `0x${value.toString(16)}`;
}

// 查询设备状态。返回的 Promise 只表示已发出；结果由设备回一条 GET_DEVICE_STATUS_RESULT 命令
export function requestDeviceStatus(connection) {
  return connection.sendCommand({
    commandId: COMMAND.GET_DEVICE_STATUS,
    data: new TextEncoder().encode('status?'),
  });
}

// 发一条流消息。timestampMs 是 uint32，用当前毫秒时间戳截断即可
export function sendHelloMessage(connection) {
  return connection.sendStreamMessage({
    streamId: MESSAGE_STREAM_ID,
    timestampMs: Date.now() >>> 0,
    data: new TextEncoder().encode('hello'),
  });
}
