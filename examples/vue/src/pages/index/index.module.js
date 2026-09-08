// 本地 demo：在浏览器里签发 connect token，生成播放页链接。
// SK 只用于本页签名，不会写入播放 URL。带 SK 的生成页 URL 不要发到公网。

const FORM_STORAGE_KEY = 'tirtc-generate-player-form';

// ---------- 1. 从当前页 URL 读取参数 ----------
function readUrlParams() {
  const search = new URLSearchParams(window.location.search);
  return {
    ak: search.get('ak') || '',
    sk: search.get('sk') || '',
    uid: search.get('uid') || '',
    deviceId: search.get('device_id') || '',
    appId: search.get('app_id') || '',
    ttl: search.get('ttl') || '',
  };
}

function readSavedForm() {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    return {
      ak: saved.ak || '',
      sk: saved.sk || '',
      uid: saved.uid || '',
      deviceId: saved.device_id || saved.deviceId || '',
      appId: saved.app_id || saved.appId || '',
      ttl: saved.ttl || '',
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
    ak: fromUrl.ak || fromSaved.ak || '',
    sk: fromUrl.sk || fromSaved.sk || '',
    uid: fromUrl.uid || fromSaved.uid || '',
    deviceId: fromUrl.deviceId || fromSaved.deviceId || '',
    appId: fromUrl.appId || fromSaved.appId || '',
    ttl: fromUrl.ttl || fromSaved.ttl || '300',
  };
}

// 字段名和 URL 参数一致，下次打开直接复用。
function saveForm({ ak, sk, uid, deviceId, appId, ttl }) {
  localStorage.setItem(
    FORM_STORAGE_KEY,
    JSON.stringify({
      ak,
      sk,
      uid,
      device_id: deviceId,
      app_id: appId,
      ttl: String(ttl),
    }),
  );
}

// ---------- 2. Base64URL：和 Node 的 Buffer.toString('base64url') 一致 ----------
function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- 3. HMAC-SHA256，密钥是 SK，签名内容是 payloadBase64 ----------
async function signHmacSha256(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

// ---------- 4. 签发 token：v1.{payloadBase64}.{signature} ----------
async function createToken({ ak, sk, uid, deviceId, ttl }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: uid,
    scope: `connect:device://${deviceId}`,
    iss: ak,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
    nonce: `connect-${nowSeconds}-${crypto.randomUUID()}`,
  };

  const payloadBase64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signHmacSha256(sk, payloadBase64);
  return `v1.${payloadBase64}.${signature}`;
}

// ---------- 5. 拼播放链接：只带 device_id / app_id / token，不带 AK/SK ----------
function buildPlayerUrl({ deviceId, appId, token }) {
  const url = new URL('/device-player', window.location.origin);
  url.searchParams.set('device_id', deviceId);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('token', token);
  return url.toString();
}

export { getDefaultFormValues, saveForm, createToken, buildPlayerUrl };
