import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_UPLOAD_DIR = '/data/uploads';
const LOCAL_FALLBACK_UPLOAD_DIR = '/tmp/museum-guide-uploads';

function getConfiguredUploadDir(): string | null {
  const configured = process.env.UPLOAD_DIR?.trim();
  return configured ? configured : null;
}

function isProductionLikeRuntime(): boolean {
  return process.env.NODE_ENV?.trim().toLowerCase() === 'production';
}

export function getUploadDir(): string {
  const configured = getConfiguredUploadDir();
  if (configured) return configured;

  // Railway mounts /data in production. On local macOS/dev machines, /data often
  // does not exist (and root is read-only), so fall back to a writable temp dir.
  if (!existsSync('/data') && !isProductionLikeRuntime()) {
    return LOCAL_FALLBACK_UPLOAD_DIR;
  }

  return DEFAULT_UPLOAD_DIR;
}

export function getAudioDir(): string {
  return join(getUploadDir(), 'audio');
}

export function getImageDir(): string {
  return join(getUploadDir(), 'images');
}

export function ensureStorageDirectories(): void {
  for (const dir of [getUploadDir(), getAudioDir(), getImageDir()]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function verifyStorageWritable(): void {
  ensureStorageDirectories();

  for (const dir of [getUploadDir(), getAudioDir(), getImageDir()]) {
    accessSync(dir, fsConstants.W_OK);
  }

  const probePath = join(getUploadDir(), `.storage-check-${randomUUID()}.tmp`);
  writeFileSync(probePath, 'ok');
  unlinkSync(probePath);
}
