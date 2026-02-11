import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { decodeBase64Image } from './ocr';

export interface StoredImage {
  imageUrl: string;
  storagePath: string;
}

export interface PlaqueImageStorage {
  saveImage(params: {
    imageBase64: string;
    museumId: number;
    artifactId?: number;
  }): Promise<StoredImage>;
}

class LocalDiskPlaqueImageStorage implements PlaqueImageStorage {
  private uploadsDir = resolve(__dirname, '../../public/uploads/plaque-scans');

  async saveImage(params: {
    imageBase64: string;
    museumId: number;
    artifactId?: number;
  }): Promise<StoredImage> {
    const { buffer, mimeType } = decodeBase64Image(params.imageBase64);
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = [
      'museum',
      params.museumId,
      params.artifactId ? `artifact-${params.artifactId}` : 'draft',
      `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`,
    ].join('-');

    await mkdir(this.uploadsDir, { recursive: true });
    const storagePath = resolve(this.uploadsDir, fileName);
    await writeFile(storagePath, buffer);

    return {
      imageUrl: `/uploads/plaque-scans/${fileName}`,
      storagePath,
    };
  }
}

export function createPlaqueImageStorage(): PlaqueImageStorage {
  return new LocalDiskPlaqueImageStorage();
}
