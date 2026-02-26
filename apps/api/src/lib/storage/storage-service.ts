import { writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import {
  ensureStorageDirectories,
  getAudioDir,
  getImageDir,
} from './storage-path';

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw new Error('filename is required');
  }
  return basename(trimmed);
}

function ensureExt(fileName: string, ext: string): string {
  return fileName.toLowerCase().endsWith(ext) ? fileName : `${fileName}${ext}`;
}

export async function storeAudio(
  buffer: Buffer,
  filename: string
): Promise<string> {
  ensureStorageDirectories();

  const safeName = ensureExt(sanitizeFileName(filename), '.mp3');
  const storagePath = join(getAudioDir(), safeName);
  await writeFile(storagePath, buffer);
  return `/uploads/audio/${safeName}`;
}

export async function storeImage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  ensureStorageDirectories();

  const safeName = sanitizeFileName(filename);
  const withExt = extname(safeName) ? safeName : `${safeName}.jpg`;
  const storagePath = join(getImageDir(), withExt);
  await writeFile(storagePath, buffer);
  return `/uploads/images/${withExt}`;
}
