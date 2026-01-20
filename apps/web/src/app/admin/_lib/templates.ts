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
    museum?.name ||
    ('museumName' in artifact ? artifact.museumName : null) ||
    'Museum Name';
  const roomName =
    room?.name ||
    ('roomName' in artifact ? artifact.roomName : null) ||
    'Room Name';

  // Check if artifact has parentRoomName field (from ArtifactResponse)
  const parentRoomName =
    parentRoom?.name ||
    ('parentRoomName' in artifact ? artifact.parentRoomName : null);

  const location = parentRoomName
    ? `${parentRoomName} - ${roomName}`
    : roomName;

  const plaqueInfo =
    ('knowledgeText' in artifact ? artifact.knowledgeText : null) ||
    'No plaque information available.';

  return `Your role is as a museum guide, the museum you are guiding today is the ${museumName}, we are currently in the ${location} and the artefact you are introducing is: ${artifact.name}, here is the information from the plaque for your reference:
${plaqueInfo}


You do not need to introduce yourself, you've already done that, there is no need to suggest what to see next, only describe the item you are introducing.
`;
}
