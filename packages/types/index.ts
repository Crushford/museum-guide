import type { Prisma } from '@repo/db';

// Re-export Prisma types for convenience
export type { Prisma } from '@repo/db';

// API Response Types
// These types represent the shape of data returned by the API endpoints,
// which may include computed/flattened fields from relations

// GET /museums - Returns full museum objects, but frontend typically only uses id and name
export type MuseumResponse = Prisma.MuseumGetPayload<{}>;

// GET /admin/rooms - Returns rooms with museum name flattened
export type RoomResponse = {
  id: number;
  name: string;
  museumId: number | null;
  museumName: string | null;
  updatedAt: Date;
};

// GET /admin/artifacts - Returns artifacts with room and museum info flattened
export type ArtifactResponse = {
  id: number;
  name: string;
  roomId: number;
  roomName: string | null;
  museumId: number | null;
  museumName: string | null;
};
