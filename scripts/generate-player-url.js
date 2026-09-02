#!/usr/bin/env node

/*
Usage:

ACCESS_KEY_ID=<ak> \
SECRET_KEY_ID=<sk> \
TIRTC_UID=<uid> \
DEVICE_ID=<device_id> \
TIRTC_APP_ID=<app_id> \
npm run generate:player-url
*/

import { createToken, UsageError, requireEnv } from './generate-connect-token.js';

const playerBaseUrl = 'http://localhost:3000/web-native/device-player.html';

function printUsage() {
  console.error('Usage:');
  console.error(
    '  ACCESS_KEY_ID=<ak> SECRET_KEY_ID=<sk> TIRTC_UID=<uid> DEVICE_ID=<device_uuid> TIRTC_APP_ID=<app_id> [TOKEN_TTL=300] [TOKEN_NONCE=<nonce>] node scripts/generate-player-url-v2.js',
  );
}

function buildPlayerUrl({ deviceId, appId, token }) {
  const url = new URL(playerBaseUrl);
  url.searchParams.set('device_id', deviceId);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('token', token);
  return url.toString();
}

function main() {
  const deviceId = requireEnv('DEVICE_ID');
  const appId = requireEnv('TIRTC_APP_ID');
  const token = createToken();

  console.log(
    buildPlayerUrl({
      deviceId,
      appId,
      token,
    }),
  );
}

try {
  main();
} catch (error) {
  if (error instanceof UsageError) {
    console.error(error.message);
    printUsage();
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
