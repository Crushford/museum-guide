import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load environment variables from the same locations used previously.
dotenv.config({ path: resolve(__dirname, '../../../../.env') });
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config({ path: resolve(__dirname, '../../../web/.env.local') });

const logLevels = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

const normalizedString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const lowercasedString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

function parseTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

function parsePresentFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return value.trim().length > 0;
}

function parseCsvString(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const nullableNonNegativeNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}, z.number().nonnegative().nullable());

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  VITEST: z.preprocess((value) => parsePresentFlag(value), z.boolean()),
  LOG_LEVEL: z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
  }, z.enum(logLevels).optional()),

  PORT: z.coerce.number().int().positive().catch(3001),
  DB_QUERY_BILLING_LOGS: z.preprocess(
    (value) => (typeof value === 'string' ? value !== '0' : true),
    z.boolean()
  ),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).catch(0),

  FRONTEND_URL: normalizedString,
  FRONTEND_URLS: normalizedString,

  AUTH_VERIFY_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .catch(60_000),
  AUTH_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().catch(180),

  GEMINI_API_KEY: normalizedString,
  GEMINI_MODEL_ARTIFACT_SCAN: normalizedString,
  OPENAI_API_KEY: normalizedString,
  OPENAI_MODEL_ARTIFACT_SCAN: normalizedString,
  OPENAI_MODEL_INTRODUCTION: normalizedString,
  OPENAI_MODEL_QA: normalizedString,
  OPENAI_MODEL_MODERATION_FALLBACK: normalizedString,
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().catch(1000),
  OPENAI_MAX_EUR_PER_MONTH: nullableNonNegativeNumber,
  OPENAI_MAX_EUR_PER_DAY: nullableNonNegativeNumber,
  OPENAI_MODERATION_BLOCK_CATEGORIES: normalizedString,
  OPENAI_MODERATION_ALLOW_UNAVAILABLE: z.preprocess(
    (value) => parseTruthyFlag(value),
    z.boolean()
  ),

  SCAN_LLM_PROVIDER: lowercasedString,
  SCAN_OCR_PROVIDER: lowercasedString,
  SCAN_TTS_PROVIDER: lowercasedString,
  GOOGLE_MAX_EUR_PER_MONTH: nullableNonNegativeNumber,
  GOOGLE_MAX_EUR_PER_DAY: nullableNonNegativeNumber,

  LANGFUSE_ENABLED: z.preprocess(
    (value) => parseTruthyFlag(value),
    z.boolean()
  ),
  LANGFUSE_PUBLIC_KEY: normalizedString,
  LANGFUSE_SECRET_KEY: normalizedString,
  LANGFUSE_BASE_URL: normalizedString,

  FIREBASE_PROJECT_ID: normalizedString,
  FIREBASE_CLIENT_EMAIL: normalizedString,
  FIREBASE_PRIVATE_KEY: z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.replace(/\\n/g, '\n') : undefined;
  }, z.string().optional()),
  GOOGLE_CLOUD_PROJECT: normalizedString,
  GCLOUD_PROJECT: normalizedString,

  GOOGLE_CLOUD_QUOTA_PROJECT: normalizedString,
  GOOGLE_APPLICATION_CREDENTIALS: normalizedString,

  OCR_SPACE_API_KEY: normalizedString,
  OCR_SPACE_LANGUAGE: normalizedString,
  OCR_SPACE_ENGINE: normalizedString,
  OCR_SPACE_OCR_COST_USD: z.coerce.number().nonnegative().catch(0),
  USD_TO_EUR_RATE: z.coerce.number().positive().catch(0.92),

  INWORLD_TTS_BASIC_AUTH: normalizedString,
  INWORLD_RUNTIME_BASE64_CREDENTIAL: normalizedString,

  DEBUG_USAGE_LIMITS: z.preprocess(
    (value) => parseTruthyFlag(value),
    z.boolean()
  ),
  SIGNUP_ALLOWLIST: normalizedString,
  SIGNUP_MODE: lowercasedString,
  SIGNUP_CAP: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  }, z.number().int().positive().nullable()),
});

export const env = envSchema.parse(process.env);

export function parseCsvEnv(value: string | undefined): string[] {
  return parseCsvString(value);
}
