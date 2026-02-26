import { randomUUID } from 'crypto';
import { decodeBase64Image } from './ocr';
import { storeImage } from '../storage/storage-service';

export interface StoredImage {
  imageUrl: string;
}

export interface PlaqueImageStorage {
  saveImage(params: {
    imageBase64: string;
    museumId: number;
    artifactId?: number;
  }): Promise<StoredImage>;
}

class LocalDiskPlaqueImageStorage implements PlaqueImageStorage {
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

    const imageUrl = await storeImage(buffer, fileName);

    return {
      imageUrl,
    };
  }
}

export function createPlaqueImageStorage(): PlaqueImageStorage {
  return new LocalDiskPlaqueImageStorage();
}
