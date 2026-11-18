// 本地 demo：向云存 OpenAPI 申请 APP Access Token，再生成云录像播放链接。
// 签名和 scripts/cloud-record-openapi.js 的 buildSignedTokenRequest 一致。
// SK 只用于本页签名，不会写入播放 URL。带 SK 的生成页 URL 不要发到公网。

const FORM_STORAGE_KEY = 'tirtc-generate-cloud-storage-form';
const TOKEN_PATH = '/openapi/v1/issue-app-access-token';
const ALGORITHM = 'TGV1-HMAC-SHA256';
const SIGNED_HEADERS = 'content-length;content-type;x-tg-algorithm;x-tg-app-id;x-tg-date';
const DEFAULT_ENDPOINT = 'https://api-cloudstorage.tange365.com';
const DEFAULT_DURATION_SECONDS = 3600;
const MIN_DURATION_SECONDS = 900;
const MAX_DURATION_SECONDS = 43200;

const textEncoder = new TextEncoder();

// ---------- 1. 从当前页 URL 读取参数 ----------
function readUrlParams() {
  const search = new URLSearchParams(window.location.search);
  return {
    accessKeyId: search.get('access_key_id') || '',
    secretKeyId: search.get('secret_key_id') || '',
    deviceId: search.get('device_id') || '',
    appId: search.get('app_id') || '',
    endpoint: search.get('endpoint') || '',
    durationSeconds: search.get('duration_seconds') || '',
  };
}

function readSavedForm() {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    return {
      accessKeyId: saved.access_key_id || '',
      secretKeyId: saved.secret_key_id || '',
      deviceId: saved.device_id || '',
      appId: saved.app_id || '',
      endpoint: saved.endpoint || '',
      durationSeconds: saved.duration_seconds || '',
    };
  } catch (error) {
    return {};
  }
}

// URL 参数优先；某个字段 URL 没带，才用上次保存的值。
function getDefaultFormValues() {
  const fromUrl = readUrlParams();
  const fromSaved = readSavedForm();
  return {
    accessKeyId: fromUrl.accessKeyId || fromSaved.accessKeyId || '',
    secretKeyId: fromUrl.secretKeyId || fromSaved.secretKeyId || '',
    deviceId: fromUrl.deviceId || fromSaved.deviceId || '',
    appId: fromUrl.appId || fromSaved.appId || '',
    endpoint: fromUrl.endpoint || fromSaved.endpoint || '',
    durationSeconds: fromUrl.durationSeconds || fromSaved.durationSeconds || String(DEFAULT_DURATION_SECONDS),
  };
}

// 字段名和 URL 参数一致，下次打开直接复用。
function saveForm({ accessKeyId, secretKeyId, deviceId, appId, endpoint, durationSeconds }) {
  localStorage.setItem(
    FORM_STORAGE_KEY,
    JSON.stringify({
      access_key_id: accessKeyId,
      secret_key_id: secretKeyId,
      device_id: deviceId,
      app_id: appId,
      endpoint,
      duration_seconds: String(durationSeconds),
    }),
  );
}

// ---------- 2. 校验服务地址和有效秒数，规则与脚本相同 ----------
// 留空使用正式环境。只接受 http(s) 根地址，避免把路径一起签进别的接口。
function normalizeEndpoint(rawValue) {
  const endpoint = (String(rawValue ?? '').trim() || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  let url;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('服务地址必须是完整的 http 或 https 地址');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('服务地址必须是 http 或 https');
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('服务地址只能是根地址，不能带路径、参数或哈希');
  }

  return endpoint;
}

// 留空默认 3600 秒。云存只接受 900 到 43200 的整数。
function normalizeDuration(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) return DEFAULT_DURATION_SECONDS;

  const durationSeconds = Number.parseInt(text, 10);
  if (!Number.isFinite(durationSeconds) || String(durationSeconds) !== text) {
    throw new Error('有效秒数必须是整数');
  }

  if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`有效秒数必须在 ${MIN_DURATION_SECONDS} 到 ${MAX_DURATION_SECONDS} 之间`);
  }

  return durationSeconds;
}

// ---------- 3. TGV1-HMAC-SHA256，对照 scripts/cloud-record-openapi.js ----------
function formatUtcDate(date) {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatUtcTimestamp(date) {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${formatUtcDate(date)}T${hours}${minutes}${seconds}Z`;
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

// key 第一层是字符串 TGV1+SK，后面三层是上一层 HMAC 的原始字节。
async function hmacSha256(key, message) {
  const keyBytes = typeof key === 'string' ? textEncoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = typeof message === 'string' ? textEncoder.encode(message) : message;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return new Uint8Array(signature);
}

async function buildSignedTokenRequest({ endpoint, bodyBytes, accessKeyId, secretKeyId, appId, now }) {
  const contentLength = String(bodyBytes.length);
  const bodyHash = await sha256Hex(bodyBytes);
  const requestDate = formatUtcDate(now);
  const xTgDate = formatUtcTimestamp(now);
  // 凭证范围用 7 天后的 UTC 日期，和服务端校验窗口一致。
  const credentialScope = `${formatUtcDate(addUtcDays(now, 7))}/tgv1_request`;
  const canonicalHeaders = [
    `content-length:${contentLength}`,
    'content-type:application/json',
    `x-tg-algorithm:${ALGORITHM}`,
    `x-tg-app-id:${appId}`,
    `x-tg-date:${xTgDate}`,
  ].join('\n');
  const canonicalRequest = ['POST', TOKEN_PATH, '', canonicalHeaders, SIGNED_HEADERS, bodyHash].join('\n');
  const stringToSign = [ALGORITHM, xTgDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
  const kDate = await hmacSha256(`TGV1${secretKeyId}`, requestDate);
  const kPath = await hmacSha256(kDate, TOKEN_PATH);
  const kSigning = await hmacSha256(kPath, 'tgv1_request');
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  return {
    url: `${endpoint}${TOKEN_PATH}`,
    body: bodyBytes,
    headers: {
      'Content-Type': 'application/json',
      // Content-Length 已经写进签名。浏览器会按 body 字节数自动带上，这里不能再手写。
      'X-Tg-Algorithm': ALGORITHM,
      'X-Tg-App-Id': appId,
      'X-Tg-Date': xTgDate,
      'X-Tg-Content-Sha256': bodyHash,
      'X-Tg-Signed-Headers': SIGNED_HEADERS,
      Authorization: `${ALGORITHM} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
    },
  };
}

function readResponseError(payload, status) {
  const code = payload?.code || `HTTP ${status}`;
  const message = payload?.message ? ` ${payload.message}` : '';
  const lines = [`${code}${message}`];
  if (payload?.request_id) lines.push(`request_id: ${payload.request_id}`);
  return lines.join('\n');
}

// ---------- 4. 浏览器直接 POST，取出 access_token ----------
async function createToken({ accessKeyId, secretKeyId, deviceId, appId, endpoint, durationSeconds }) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const duration = normalizeDuration(durationSeconds);
  const now = new Date();
  const bodyBytes = textEncoder.encode(
    JSON.stringify({
      device_id: deviceId,
      duration_seconds: duration,
    }),
  );
  const request = await buildSignedTokenRequest({
    endpoint: normalizedEndpoint,
    bodyBytes,
    accessKeyId,
    secretKeyId,
    appId,
    now,
  });

  let response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
  } catch {
    throw new Error('请求云存服务失败');
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`云存服务返回了无法解析的内容（HTTP ${response.status}）`);
  }

  if (!response.ok || payload.code !== 'OK') {
    throw new Error(readResponseError(payload, response.status));
  }

  const token = payload.data?.access_token;
  if (!token) {
    throw new Error(
      readResponseError(
        { ...payload, code: payload.code || 'InvalidResponse', message: 'missing access_token' },
        response.status,
      ),
    );
  }

  return { token, endpoint: normalizedEndpoint, durationSeconds: duration };
}

// ---------- 5. 拼播放链接：只带 app_id / token / endpoint，不带 AK/SK ----------
function buildPlayerUrl({ appId, token, endpoint }) {
  const url = new URL('/cloud-storage', window.location.origin);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('token', token);
  url.searchParams.set('endpoint', endpoint);
  return url.toString();
}

export { getDefaultFormValues, saveForm, createToken, buildPlayerUrl };
