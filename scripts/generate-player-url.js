import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const endpoint = 'http://ep-test-tirtc.tange365.com';
const openapiEndpoint = 'http://api-test-tirtc.tange365.com';
const playerBaseUrl = 'http://localhost:3000/web-native/device-player.html';

function getOptions() {
  const remoteId = process.argv[2]?.trim();

  if (!remoteId) {
    console.error('Usage: node scripts/generate-player-url.js <remoteId>');
    process.exit(1);
  }

  return { remoteId };
}

function parsePayloadJson(output) {
  const match = output.match(/Payload JSON:\s*([\s\S]*?)\n\s*QR Code ASCII:/);

  if (!match) return null;

  return JSON.parse(match[1].trim());
}

function parseField(output, fieldName) {
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`^\\s*${escapedFieldName}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() || '';
}

function parseToken(output) {
  const match = output.match(/Token:\s*([\s\S]*?)\n\s*Payload JSON:/);
  return match?.[1]?.trim() || '';
}

function extractPlayerParams(output) {
  const payload = parsePayloadJson(output);

  if (payload?.app_id && payload?.remote_id && payload?.token) {
    return {
      appId: payload.app_id,
      remoteId: payload.remote_id,
      token: payload.token,
    };
  }

  const appId = parseField(output, 'app_id');
  const remoteId = parseField(output, 'remote_id');
  const token = parseToken(output);

  if (appId && remoteId && token) {
    return { appId, remoteId, token };
  }

  throw new Error('Failed to extract app_id, remote_id or token from CLI output.');
}

function buildPlayerUrl({ appId, remoteId, token }) {
  const url = new URL(playerBaseUrl);
  url.searchParams.set('device_id', remoteId);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('token', token);
  return url.toString();
}

function buildCliArgs(remoteId) {
  const args = ['token', 'issue', remoteId];

  if (endpoint) args.push('--endpoint', endpoint);
  if (openapiEndpoint) args.push('--openapi-endpoint', openapiEndpoint);

  return args;
}

async function main() {
  const { remoteId } = getOptions();
  const { stdout, stderr } = await execFileAsync(
    'tirtc-devtools-cli',
    buildCliArgs(remoteId),
  );

  const output = `${stdout}\n${stderr}`.trim();
  const playerUrl = buildPlayerUrl(extractPlayerParams(output));

  console.log(playerUrl);
}

main().catch((error) => {
  if (/missing required access_key_id/i.test(error.message)) {
    console.error(
      'Missing access key. Set TIRTC_ACCESS_KEY_ID / TIRTC_DEVICE_SECRET_KEY / TIRTC_APP_ID first.',
    );
    process.exit(1);
  }

  console.error(error.message);
  process.exit(1);
});
