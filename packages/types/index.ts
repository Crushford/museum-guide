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
  roomId: number;
  roomName: string | null;
  museumId: number | null;
  museumName: string | null;
  knowledgeText: string | null;
  furtherReading: string[];
  parentRoomId: number | null;
  parentRoomName: string | null;
};

// Base Artifact type from Prisma (use this when you don't need flattened fields)
export type Artifact = Prisma.ArtifactGetPayload<{}>;
