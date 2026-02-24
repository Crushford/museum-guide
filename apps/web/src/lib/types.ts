import type {
  Artifact as PrismaArtifact,
  Museum as PrismaMuseum,
  Prisma,
  Room as PrismaRoom,
} from '@repo/types';

export type { WikipediaSummary, SpendRow } from '@repo/types';

type JsonDate<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? JsonDate<U>[]
    : T extends object
      ? { [K in keyof T]: JsonDate<T[K]> }
      : T;

type MaybeFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Museum = MaybeFields<
  Pick<
    PrismaMuseum,
    'id' | 'name' | 'slug' | 'knowledgeText' | 'furtherReading'
  >,
  'slug' | 'knowledgeText' | 'furtherReading'
>;

export type Room = MaybeFields<
  Pick<
    PrismaRoom,
    | 'id'
    | 'name'
    | 'slug'
    | 'museumId'
    | 'parentRoomId'
    | 'knowledgeText'
    | 'furtherReading'
  > & { parentId?: number | null },
  'slug' | 'museumId' | 'parentRoomId' | 'knowledgeText' | 'furtherReading'
>;

export type Artifact = MaybeFields<
  Pick<
    PrismaArtifact,
    | 'id'
    | 'slug'
    | 'roomId'
    | 'museumId'
    | 'localTitle'
    | 'localTitleLanguage'
    | 'englishTitle'
    | 'rawPlaqueText'
    | 'knowledgeTextEn'
    | 'furtherReading'
    | 'wikimediaImageUrl'
    | 'wikipediaUrl'
  > & { name: string },
  | 'slug'
  | 'roomId'
  | 'museumId'
  | 'localTitle'
  | 'localTitleLanguage'
  | 'englishTitle'
  | 'rawPlaqueText'
  | 'knowledgeTextEn'
  | 'furtherReading'
  | 'wikimediaImageUrl'
  | 'wikipediaUrl'
>;

export type ContentItem = JsonDate<
  Prisma.ContentGetPayload<Prisma.ContentDefaultArgs>
>;

type ArtifactQuestionBase = JsonDate<
  Prisma.ArtifactQuestionGetPayload<Prisma.ArtifactQuestionDefaultArgs>
>;
export type ArtifactQuestion = Omit<ArtifactQuestionBase, 'askedByUsername'> & {
  askedByUsername: string | null;
  listenCount: number;
  currentUserVote?: number;
};

export type SimilarArtifactQuestionMatch = {
  id: number;
  questionText: string;
  answerText: string | null;
  similarity: number;
  upvotes: number;
  downvotes: number;
};

export type AskResponse = {
  requiresConfirmation: boolean;
  previewOnly?: boolean;
  originalQuestion?: string;
  correctedQuestion?: string;
  hasCorrections?: boolean;
  similarQuestion?: SimilarArtifactQuestionMatch;
  question?: ArtifactQuestion;
};

export type ContentRow = {
  id: number;
  type: string | null;
  text: string;
  createdAt: string;
  museumId: number | null;
  roomId: number | null;
  artifactId: number | null;
  audioUrl: string | null;
};

export type RoomDraft = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export type RoomCreateInput = RoomDraft & {
  museumId?: number;
  parentRoomId?: number;
};

export type MuseumInput = {
  name: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export type ArtifactImportData = {
  name: string;
  parentId?: number;
  parentName?: string;
  knowledgeText?: string;
  furtherReading?: string[];
};

export type ArtifactCreateInput = ArtifactImportData & {
  type: 'ARTIFACT';
  museumId?: number;
  museumName?: string;
  newRoomParentType?: 'museum' | 'room';
  newRoomParentRoomId?: number;
};
