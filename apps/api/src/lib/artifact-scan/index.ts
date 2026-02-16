export {
  extractTextFromImage,
  parseOcrProvider,
  getDefaultOcrProvider,
} from './ocr';
export {
  searchDuplicatesFromRawText,
  searchDuplicatesFromDraft,
} from './duplicates';
export { extractArtifactDraft } from './draft';
export { createArtifactAndAssets } from './persist';
export { buildArtifactDisplayTitle } from './display-title';
export type {
  OcrResult,
  ArtifactDraft,
  DuplicateSearchResult,
} from '@repo/types';
