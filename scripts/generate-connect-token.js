#!/usr/bin/env node

import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const usageLine =
  '  ACCESS_KEY_ID=<ak> SECRET_KEY_ID=<sk> TIRTC_UID=<uid> DEVICE_ID=<device_uuid> [TOKEN_TTL=300] [TOKEN_NONCE=<nonce>] node scripts/generate-connect-token.js';

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

export function printUsage() {
  console.error('Usage:');
  console.error(usageLine);
}

export function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new UsageError(`Error: env ${name} is required`);
  }

  return value;
}

function getNowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function getTtlSeconds() {
  const rawValue = process.env.TOKEN_TTL?.trim();

  if (!rawValue) {
    return 300;
  }

  const ttl = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new UsageError('Error: TOKEN_TTL must be a positive integer');
  }

  return ttl;
}

export function getNonce(nowSeconds) {
  const rawValue = process.env.TOKEN_NONCE?.trim();
  return rawValue || `connect-${nowSeconds}-${process.pid}`;
}

export function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

export function buildPayload({ accessKeyId, uid, deviceId, nowSeconds, ttlSeconds, nonce }) {
  return {
    sub: uid,
    scope: `connect:device://${deviceId}`,
    iss: accessKeyId,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    nonce,
  };
}

export function signPayload(payloadBase64, secretKeyId) {
  return createHmac('sha256', secretKeyId).update(payloadBase64).digest('base64url');
}

export function createToken() {
  const accessKeyId = requireEnv('ACCESS_KEY_ID');
  const secretKeyId = requireEnv('SECRET_KEY_ID');
  const uid = requireEnv('TIRTC_UID');
  const deviceId = requireEnv('DEVICE_ID');
  const nowSeconds = getNowSeconds();
  const ttlSeconds = getTtlSeconds();
  const nonce = getNonce(nowSeconds);

  const payload = buildPayload({
    accessKeyId,
    uid,
    deviceId,
    nowSeconds,
    ttlSeconds,
    nonce,
  });
  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadBase64, secretKeyId);

  return `v1.${payloadBase64}.${signature}`;
}

function main() {
  console.log(createToken());
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
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
}
