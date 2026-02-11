import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';

// Full artifact type with all fields (from admin endpoint)
export type FullArtifact = {
  id: number;
  name: string;
  slug?: string;
  knowledgeText: string | null;
  furtherReading?: string[];
  roomId: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

// Artifact with knowledgeText (minimal type for template generation)
export type ArtifactWithKnowledge = {
  id: number;
  name: string;
  knowledgeText: string | null;
  furtherReading?: string[];
  roomId: number;
};

// Introduction template for museum guides (prompt template for LLM calls)
export function generateIntroductionTemplate(
  artifact: FullArtifact | ArtifactResponse | ArtifactWithKnowledge,
  room?: RoomResponse,
  museum?: MuseumResponse,
  parentRoom?: RoomResponse // For nested rooms
): string {
  const museumName =
    museum?.name || ('museumName' in artifact ? artifact.museumName : null);
  const roomName =
    room?.name || ('roomName' in artifact ? artifact.roomName : null);

  const parentRoomName =
    parentRoom?.name ||
    ('parentRoomName' in artifact ? artifact.parentRoomName : null);

  const location =
    parentRoomName && roomName
      ? `${parentRoomName} - ${roomName}`
      : roomName || parentRoomName || null;

  const plaqueInfo =
    'knowledgeText' in artifact ? artifact.knowledgeText : null;

  const museumSummary = museum?.wikipediaSummary || null;

  const lines: string[] = [`Artifact: ${artifact.name}`];

  if (museumName) {
    lines.push(`Museum: ${museumName}`);
  }

  if (location) {
    lines.push(`Room: ${location}`);
  }

  if (museumSummary) {
    lines.push(`Museum summary (Wikipedia): ${museumSummary}`);
  }

  if (plaqueInfo) {
    lines.push(`Plaque text: ${plaqueInfo}`);
  }

  return (
    'Write a concise spoken introduction for the artifact described below. ' +
    'Aim for 260–320 words (about 2 minutes). ' +
    'Start immediately with the artifact; no greetings, no self-introductions, and do not say "welcome". ' +
    'Do not mention being a guide, and do not include stage directions or gestures.\n\n' +
    `Context:\n${lines.map((line) => `- ${line}`).join('\n')}`
  );
}
