import type { Prisma } from '@repo/db';

// Re-export Prisma types for convenience
export type { Prisma } from '@repo/db';

// API Response Types
// These types represent the shape of data returned by the API endpoints,
// which may include computed/flattened fields from relations

// GET /museums - Returns full museum objects
export type MuseumResponse = Prisma.MuseumGetPayload<{}>;

// Convenience type for Museum (matches MuseumResponse)
export type Museum = MuseumResponse;

// GET /admin/rooms - Returns rooms with museum relation included
export type RoomResponse = Prisma.RoomGetPayload<{
  include: {
    museum: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

// Base Room type from Prisma (use this when you don't need relations)
export type Room = Prisma.RoomGetPayload<{}>;

// GET /admin/artifacts - Returns artifacts with room and museum info flattened
// Note: This is a custom response type that includes flattened room and museum names
export type ArtifactResponse = {
  id: number;
  name: string;
  slug: string;
  roomId: number | null;
  roomName: string | null;
  museumId: number;
  museumName: string | null;
  rawPlaqueText: string | null;
  furtherReading: string[];
  parentRoomId: number | null;
  parentRoomName: string | null;
};

// Base Artifact type from Prisma (use this when you don't need flattened fields)
export type Artifact = Prisma.ArtifactGetPayload<{}>;

// Artifact scan pipeline contracts (shared between API and web)
export type ScanStage =
  | 'ocr'
  | 'duplicates_raw'
  | 'draft'
  | 'duplicates_draft'
  | 'persist';

export interface OcrBlock {
  text: string;
  confidence?: number;
  boundingPoly?: unknown;
}

export type OcrProviderName = 'google-vision' | 'ocr-space';

export interface OcrResult {
  rawText: string;
  languageHints: string[];
  confidence: number | null;
  blocks: OcrBlock[];
  provider: OcrProviderName;
}

export interface ArtifactDraft {
  localTitle: string;
  localTitleLanguage: string;
  englishTitle: string;
  knowledgeText: string;
  museumConfidence: number;
}

export interface ArtifactCandidate {
  artifactId: number;
  slug: string;
  localTitle: string;
  englishTitle: string | null;
  score: number;
  reasons: string[];
}

export type DuplicateOutcome =
  | 'single_strong_match'
  | 'multiple_candidates'
  | 'no_match';

export interface DuplicateSearchResult {
  outcome: DuplicateOutcome;
  candidates: ArtifactCandidate[];
  thresholds: {
    strong: number;
    plausible: number;
    gap: number;
  };
}

// Wikidata search types (shared between API and web)

export interface WikidataSearchResult {
  qid: string;
  label: string;
  description?: string;
}

export interface WikidataSearchResponse {
  query: string;
  results: WikidataSearchResult[];
}

export interface LocationSearchResponse {
  query: string;
  location: {
    qid: string;
    label: string;
    description?: string;
  } | null;
  museums: { qid: string; label: string }[];
}

export interface MuseumSelectResponse {
  created: boolean;
  museum: {
    id: number;
    qid: string;
    slug: string;
    name: string;
  };
}

export interface NearbyMuseumResult {
  qid: string;
  label: string;
  description?: string;
  distanceKm: number;
  coordinates?: { lat: number; lng: number };
}

export interface NearbyMuseumSearchResponse {
  center: { lat: number; lng: number };
  radiusKm: number;
  results: NearbyMuseumResult[];
}

// Wikipedia summary as returned by the API to the client
export type WikipediaSummary = {
  extract: string;
  title: string;
  translated?: boolean;
  originalLanguage?: string;
  originalExtract?: string;
};

// LLM cost tracking
export type SpendRow = {
  provider: string;
  totalEur: number;
};
