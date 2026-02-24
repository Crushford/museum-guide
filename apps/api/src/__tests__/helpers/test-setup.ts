/**
 * Vitest global setup file — registered in vitest.config.ts as `setupFiles`.
 *
 * All vi.mock() calls here apply to every test file automatically.
 * The global beforeEach calls vi.resetAllMocks() so each test starts clean,
 * then re-applies sensible defaults so tests only set up what they care about.
 *
 * What test files need to do:
 *   - Import { app } from '../server' and { prisma } from '@repo/db'
 *   - Import { asUser, adminAuth } from './helpers/test-setup' for auth
 *   - Use vi.mocked(someImportedFn) to override specific mock behaviour
 */

import { vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted variables — must exist before vi.mock() factory functions run.
// Private to this file; test files interact via exported helpers below.
// ---------------------------------------------------------------------------

const { _mockVerifyIdToken } = vi.hoisted(() => ({
  _mockVerifyIdToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Stable token fixtures — exported for tests that assert on response bodies
// ---------------------------------------------------------------------------

export const ADMIN_TOKEN = {
  uid: 'admin-uid',
  email: 'admin@test.com',
  name: 'Test Admin',
  admin: true,
};

export const USER_TOKEN = {
  uid: 'user-123',
  email: 'user@test.com',
  name: 'Test User',
  admin: false,
};

// ---------------------------------------------------------------------------
// Auth helpers — exported for test files
// ---------------------------------------------------------------------------

/** Authorization header for requests that should be authenticated as admin. */
export const adminAuth = () => ({ Authorization: 'Bearer admin-token' });

/**
 * Configures the Firebase mock to return a non-admin token for the next call,
 * then returns the matching Authorization header.
 *
 *   const res = await request(app).post('/rooms').set(asUser()).send({...});
 *   expect(res.status).toBe(403);
 */
export function asUser(): { Authorization: string } {
  _mockVerifyIdToken.mockResolvedValueOnce(USER_TOKEN);
  return { Authorization: 'Bearer user-token' };
}

// ---------------------------------------------------------------------------
// Module mocks — paths relative to THIS file (../../ reaches apps/api/src/)
// ---------------------------------------------------------------------------

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  cert: vi.fn().mockReturnValue({}),
  getApps: vi.fn().mockReturnValue([]),
  applicationDefault: vi.fn().mockReturnValue({}),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn().mockReturnValue({ verifyIdToken: _mockVerifyIdToken }),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    museum: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    room: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    artifact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    content: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    artifactQuestion: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    artifactQuestionVote: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    artifactQuestionListenEvent: {
      create: vi.fn(),
    },
    apiCall: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    $on: vi.fn(),
  },
}));

vi.mock('../../lib/telemetry/langfuse', () => ({ initLangfuse: vi.fn() }));
vi.mock('../../lib/telemetry/api-call-tracker', () => ({
  recordApiCall: vi.fn(),
}));

vi.mock('../../lib/usage-limits', () => ({
  enforceUsageLimits: vi.fn(),
  enforceSignupPolicy: vi.fn(),
  getUserUsageForToday: vi.fn(),
  enforcePlaqueScanLimit: vi.fn(),
  sendBlocked: vi.fn(),
}));

vi.mock('../../lib/usage-limit-constants', () => ({
  GLOBAL_DAILY_LIMITS: {
    llmCalls: 100,
    wikiCalls: 100,
    museumCreates: 10,
    artifactCreates: 10,
    dbOps: 1000,
  },
}));

vi.mock('../../lib/wikidata', () => ({
  searchWikidata: vi.fn(),
  fetchWikidataEntity: vi.fn(),
  queryWikidata: vi.fn(),
  buildMuseumQuery: vi.fn(),
  buildNearbyMuseumsQuery: vi.fn(),
  buildArtifactsQuery: vi.fn(),
  extractQId: vi.fn(),
  searchWikidataLocations: vi.fn(),
  fetchWikipediaSummary: vi.fn(),
  fetchWikipediaSummaryWithTranslation: vi.fn(),
  parseArtifactResults: vi.fn(),
}));

vi.mock('../../lib/llm', () => ({ createProvider: vi.fn() }));

vi.mock('../../lib/llm/generate-content', () => ({
  generateIntroduction: vi.fn(),
  SpendLimitError: class SpendLimitError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'SpendLimitError';
    }
  },
}));

vi.mock('../../lib/llm/prompt-templates', () => ({
  buildIntroductionPrompt: vi.fn(),
  buildMuseumGuideSystemPrompt: vi.fn(),
  buildQuestionAnswerPrompt: vi.fn(),
}));

vi.mock('../../lib/llm/cost-tracker', () => ({
  checkDailySpendLimit: vi.fn(),
  checkSpendLimit: vi.fn(),
  getMonthlySpendEur: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock('../../lib/llm/moderation', () => ({
  moderateTextForLlm: vi.fn(),
  assertTextAllowedForLlm: vi.fn(),
}));

vi.mock('../../lib/llm/types', () => ({
  sanitizeSensitiveTopics: vi.fn((v: unknown) => (Array.isArray(v) ? v : [])),
  sanitizeSubjectTags: vi.fn((v: unknown) => (Array.isArray(v) ? v : [])),
}));

vi.mock('../../lib/audio', () => ({
  generateAudioForArtifactQuestion: vi.fn(),
  generateAudioForContent: vi.fn(),
  parseTtsProvider: vi.fn(),
  getDefaultTtsProvider: vi.fn(),
}));

vi.mock('../../lib/artifact-scan', () => ({
  extractTextFromImage: vi.fn(),
  parseOcrProvider: vi.fn(),
  getDefaultOcrProvider: vi.fn(),
  searchDuplicatesFromRawText: vi.fn(),
  extractArtifactDraft: vi.fn(),
  searchDuplicatesFromDraft: vi.fn(),
  createArtifactAndAssets: vi.fn(),
  buildArtifactDisplayTitle: vi.fn(),
}));

vi.mock('../../lib/slug', () => ({
  generateSlug: vi.fn(),
}));

vi.mock('../../lib/artifact-slug', () => ({
  buildUniqueArtifactSlug: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { stream: vi.fn() },
  })),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContentStream: vi.fn().mockResolvedValue({
        stream: (async function* () {})(),
        response: Promise.resolve({ usageMetadata: {} }),
      }),
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Re-apply default implementations after vi.resetAllMocks()
// ---------------------------------------------------------------------------

import { prisma } from '@repo/db';
import {
  enforceUsageLimits,
  enforceSignupPolicy,
  getUserUsageForToday,
  enforcePlaqueScanLimit,
  sendBlocked,
} from '../../lib/usage-limits';
import {
  moderateTextForLlm,
  assertTextAllowedForLlm,
} from '../../lib/llm/moderation';
import {
  sanitizeSensitiveTopics,
  sanitizeSubjectTags,
} from '../../lib/llm/types';
import { createProvider } from '../../lib/llm';
import { generateIntroduction } from '../../lib/llm/generate-content';
import {
  getMonthlySpendEur,
  recordUsage,
  checkDailySpendLimit,
  checkSpendLimit,
} from '../../lib/llm/cost-tracker';
import {
  buildIntroductionPrompt,
  buildMuseumGuideSystemPrompt,
  buildQuestionAnswerPrompt,
} from '../../lib/llm/prompt-templates';
import {
  generateAudioForArtifactQuestion,
  generateAudioForContent,
  parseTtsProvider,
  getDefaultTtsProvider,
} from '../../lib/audio';
import {
  extractTextFromImage,
  searchDuplicatesFromRawText,
  extractArtifactDraft,
  searchDuplicatesFromDraft,
  createArtifactAndAssets,
  buildArtifactDisplayTitle,
  parseOcrProvider,
  getDefaultOcrProvider,
} from '../../lib/artifact-scan';
import { generateSlug } from '../../lib/slug';
import { buildUniqueArtifactSlug } from '../../lib/artifact-slug';
import {
  searchWikidata,
  fetchWikidataEntity,
  queryWikidata,
  searchWikidataLocations,
  fetchWikipediaSummary,
  fetchWikipediaSummaryWithTranslation,
  parseArtifactResults,
  buildMuseumQuery,
  buildNearbyMuseumsQuery,
  buildArtifactsQuery,
  extractQId,
} from '../../lib/wikidata';

beforeEach(() => {
  vi.resetAllMocks();

  // Auth
  _mockVerifyIdToken.mockResolvedValue(ADMIN_TOKEN);

  // sendBlocked must always send a response or protected-route requests hang
  vi.mocked(sendBlocked).mockImplementation(
    (res: any, status: number, _code: string, msg: string) => {
      res.status(status).json({ error: msg });
    }
  );

  // Usage / signup gates
  vi.mocked(enforceUsageLimits).mockResolvedValue(true);
  vi.mocked(enforceSignupPolicy).mockResolvedValue(true);
  vi.mocked(enforcePlaqueScanLimit).mockResolvedValue(true);
  vi.mocked(getUserUsageForToday).mockResolvedValue({
    llmCalls: 0,
    wikiCalls: 0,
    museumCreates: 0,
    artifactCreates: 0,
  } as any);

  // Moderation
  vi.mocked(moderateTextForLlm).mockResolvedValue({
    blocked: false,
    categories: [],
    source: 'mock',
  });
  vi.mocked(assertTextAllowedForLlm).mockResolvedValue(undefined);

  // LLM type helpers
  vi.mocked(sanitizeSensitiveTopics).mockImplementation((v: unknown) =>
    Array.isArray(v) ? v : []
  );
  vi.mocked(sanitizeSubjectTags).mockImplementation((v: unknown) =>
    Array.isArray(v) ? v : []
  );

  // LLM provider
  vi.mocked(createProvider).mockReturnValue({
    generate: vi.fn().mockResolvedValue({
      text: 'Generated introduction text',
      provider: 'google',
      model: 'gemini-2.5-flash',
      suggestedQuestions: [],
    }),
  } as any);
  vi.mocked(generateIntroduction).mockResolvedValue({
    text: 'Introduction',
    audioUrl: null,
  } as any);
  vi.mocked(getMonthlySpendEur).mockResolvedValue([] as any);
  vi.mocked(recordUsage).mockResolvedValue(undefined);
  vi.mocked(checkDailySpendLimit).mockResolvedValue({ allowed: true } as any);
  vi.mocked(checkSpendLimit).mockResolvedValue({ allowed: true } as any);

  // Prompt templates
  vi.mocked(buildIntroductionPrompt).mockReturnValue('test prompt');
  vi.mocked(buildMuseumGuideSystemPrompt).mockReturnValue('system prompt');
  vi.mocked(buildQuestionAnswerPrompt).mockReturnValue('question prompt');

  // Audio
  vi.mocked(generateAudioForArtifactQuestion).mockResolvedValue(
    '/audio/test.mp3'
  );
  vi.mocked(generateAudioForContent).mockResolvedValue('/audio/content.mp3');
  vi.mocked(parseTtsProvider).mockReturnValue('elevenlabs' as any);
  vi.mocked(getDefaultTtsProvider).mockReturnValue('elevenlabs' as any);

  // Artifact scan
  vi.mocked(extractTextFromImage).mockResolvedValue({
    rawText: 'Extracted text',
    languageHints: [],
    confidence: 0.95,
    blocks: [],
  } as any);
  vi.mocked(searchDuplicatesFromRawText).mockResolvedValue({
    outcome: 'no_duplicates',
    candidates: [],
    thresholds: {},
  } as any);
  vi.mocked(extractArtifactDraft).mockResolvedValue({
    localTitle: 'Test Artifact',
    englishTitle: 'Test Artifact',
    knowledgeText: 'Test knowledge',
  } as any);
  vi.mocked(searchDuplicatesFromDraft).mockResolvedValue({
    outcome: 'no_duplicates',
    candidates: [],
    thresholds: {},
  } as any);
  vi.mocked(createArtifactAndAssets).mockResolvedValue({
    id: 1,
    slug: 'test-artifact',
    displayTitle: 'Test Artifact',
  } as any);
  vi.mocked(buildArtifactDisplayTitle).mockReturnValue('Test Artifact');
  vi.mocked(parseOcrProvider).mockReturnValue('google' as any);
  vi.mocked(getDefaultOcrProvider).mockReturnValue('google' as any);

  // Slug
  vi.mocked(generateSlug).mockReturnValue('test-slug');
  vi.mocked(buildUniqueArtifactSlug).mockResolvedValue('test-artifact-slug');

  // Wikidata
  vi.mocked(searchWikidata).mockResolvedValue([]);
  vi.mocked(fetchWikidataEntity).mockResolvedValue(null);
  vi.mocked(queryWikidata).mockResolvedValue([]);
  vi.mocked(searchWikidataLocations).mockResolvedValue([]);
  vi.mocked(fetchWikipediaSummary).mockResolvedValue(null);
  vi.mocked(fetchWikipediaSummaryWithTranslation).mockResolvedValue(null);
  vi.mocked(parseArtifactResults).mockReturnValue([]);
  vi.mocked(buildMuseumQuery).mockReturnValue('');
  vi.mocked(buildNearbyMuseumsQuery).mockReturnValue('');
  vi.mocked(buildArtifactsQuery).mockReturnValue('');
  vi.mocked(extractQId).mockReturnValue(null);

  // Prisma — sensible defaults so tests that don't care about DB shape don't 500
  vi.mocked(prisma.museum.findMany).mockResolvedValue([]);
  vi.mocked(prisma.museum.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.museum.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.museum.count).mockResolvedValue(0);
  vi.mocked(prisma.room.findMany).mockResolvedValue([]);
  vi.mocked(prisma.room.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.room.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.artifact.findMany).mockResolvedValue([]);
  vi.mocked(prisma.artifact.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.artifact.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.content.findMany).mockResolvedValue([]);
  vi.mocked(prisma.content.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.artifactQuestion.findMany).mockResolvedValue([]);
  vi.mocked(prisma.artifactQuestion.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.artifactQuestion.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.artifactQuestionVote.findMany).mockResolvedValue([]);
  vi.mocked(prisma.artifactQuestionVote.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.artifactQuestionVote.count).mockResolvedValue(0);
  vi.mocked(prisma.apiCall.findMany).mockResolvedValue([]);
  vi.mocked(prisma.apiCall.count).mockResolvedValue(0);
});
