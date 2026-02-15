import type { Response } from 'express';
import { prisma } from '@repo/db';
import type { Actor } from '../middleware/auth';
import {
  GLOBAL_DAILY_LIMITS,
  USER_DAILY_LIMITS,
} from './usage-limit-constants';
const db = prisma as any;
let didWarnMissingUsageSchema = false;
const DEBUG_USAGE_LIMITS = process.env.DEBUG_USAGE_LIMITS === '1';

export type BlockedCode =
  | 'LIMIT_GLOBAL_DAILY'
  | 'LIMIT_USER_DAILY'
  | 'SIGNUP_WAITLIST'
  | 'AUTH_REQUIRED';

type LimitKey =
  | 'llmCalls'
  | 'wikiCalls'
  | 'dbOps'
  | 'museumCreates'
  | 'artifactCreates';

type UserLimitKey = Exclude<LimitKey, 'dbOps'>;

type LimitCounters = Partial<Record<LimitKey, number>>;
type UserLimitCounters = Partial<Record<UserLimitKey, number>>;

type LimitCaps = Partial<Record<LimitKey, number>>;
type UserLimitCaps = Partial<Record<UserLimitKey, number>>;

type UserUsageSummary = {
  llmCalls: number;
  wikiCalls: number;
  museumCreates: number;
  artifactCreates: number;
};

type UserLimitSummary = {
  llmCalls: number | null;
  wikiCalls: number | null;
  museumCreates: number | null;
  artifactCreates: number | null;
};

const GLOBAL_KEYS: LimitKey[] = [
  'llmCalls',
  'wikiCalls',
  'dbOps',
  'museumCreates',
  'artifactCreates',
];

const USER_KEYS: UserLimitKey[] = [
  'llmCalls',
  'wikiCalls',
  'museumCreates',
  'artifactCreates',
];

function parsePositiveInt(envName: string): number | null {
  const raw = process.env[envName];
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function getGlobalCaps(): LimitCaps {
  return {
    llmCalls: GLOBAL_DAILY_LIMITS.llmCalls ?? undefined,
    wikiCalls: GLOBAL_DAILY_LIMITS.wikiCalls ?? undefined,
    dbOps: GLOBAL_DAILY_LIMITS.dbOps ?? undefined,
    museumCreates: GLOBAL_DAILY_LIMITS.museumCreates ?? undefined,
    artifactCreates: GLOBAL_DAILY_LIMITS.artifactCreates ?? undefined,
  };
}

function getUserCaps(): UserLimitCaps {
  return {
    llmCalls: USER_DAILY_LIMITS.llmCalls ?? undefined,
    wikiCalls: USER_DAILY_LIMITS.wikiCalls ?? undefined,
    museumCreates: USER_DAILY_LIMITS.museumCreates ?? undefined,
    artifactCreates: USER_DAILY_LIMITS.artifactCreates ?? undefined,
  };
}

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNextResetAtIso(): string {
  const now = new Date();
  const reset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return reset.toISOString();
}

function usageSchemaAvailable(): boolean {
  return Boolean(
    db?.appUser &&
    db?.dailyUserUsage &&
    db?.dailyGlobalUsage &&
    db?.$transaction
  );
}

function isMissingUsageSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as { code?: string; message?: string };
  if (err.code === 'P2021' || err.code === 'P2022') {
    return true;
  }

  const message = (err.message || '').toLowerCase();
  return (
    message.includes('dailyglobalusage') ||
    message.includes('dailyuserusage') ||
    message.includes('appuser') ||
    message.includes('does not exist') ||
    message.includes('undefined')
  );
}

function warnMissingUsageSchema(context: string, error?: unknown) {
  if (didWarnMissingUsageSchema) {
    return;
  }

  didWarnMissingUsageSchema = true;
  console.warn(
    `[usage-limits] Skipping usage/signup enforcement in ${context}. New Prisma tables are not available yet. Run your Prisma migration to enable limits.`,
    error
  );
}

function debugUsageLog(message: string, payload?: unknown) {
  if (!DEBUG_USAGE_LIMITS) {
    return;
  }
  console.log(`[usage-limits:debug] ${message}`, payload ?? '');
}

function hasAnyCounters(counters: LimitCounters | UserLimitCounters): boolean {
  return Object.values(counters).some((value) => (value ?? 0) > 0);
}

function buildUserUsageSummary(row: {
  llmCalls: number;
  wikiCalls: number;
  museumCreates: number;
  artifactCreates: number;
}): UserUsageSummary {
  return {
    llmCalls: row.llmCalls,
    wikiCalls: row.wikiCalls,
    museumCreates: row.museumCreates,
    artifactCreates: row.artifactCreates,
  };
}

function buildUserLimitSummary(caps: UserLimitCaps): UserLimitSummary {
  return {
    llmCalls: caps.llmCalls ?? null,
    wikiCalls: caps.wikiCalls ?? null,
    museumCreates: caps.museumCreates ?? null,
    artifactCreates: caps.artifactCreates ?? null,
  };
}

export function sendBlocked(
  res: Response,
  status: number,
  code: BlockedCode,
  message: string,
  options?: {
    usage?: {
      user: UserUsageSummary;
      limits: UserLimitSummary;
    };
  }
) {
  res.status(status).json({
    error: {
      code,
      message,
      resetAt: getNextResetAtIso(),
      ...(options?.usage ? { usage: options.usage } : {}),
    },
  });
}

function globalLimitExceeded(
  row: {
    llmCalls: number;
    wikiCalls: number;
    dbOps: number;
    museumCreates: number;
    artifactCreates: number;
  },
  increments: LimitCounters,
  caps: LimitCaps
): boolean {
  return GLOBAL_KEYS.some((key) => {
    const cap = caps[key];
    if (!cap) return false;
    const next = row[key] + (increments[key] ?? 0);
    return next > cap;
  });
}

function userLimitExceeded(
  row: {
    llmCalls: number;
    wikiCalls: number;
    museumCreates: number;
    artifactCreates: number;
  },
  increments: UserLimitCounters,
  caps: UserLimitCaps
): boolean {
  return USER_KEYS.some((key) => {
    const cap = caps[key];
    if (!cap) return false;
    const next = row[key] + (increments[key] ?? 0);
    return next > cap;
  });
}

function buildGlobalIncrementData(increments: LimitCounters) {
  const data: Record<string, { increment: number }> = {};
  for (const [key, value] of Object.entries(increments)) {
    if ((value ?? 0) > 0) {
      data[key] = { increment: value as number };
    }
  }
  return data;
}

function buildUserIncrementData(increments: UserLimitCounters) {
  const data: Record<string, { increment: number }> = {};
  for (const [key, value] of Object.entries(increments)) {
    if ((value ?? 0) > 0) {
      data[key] = { increment: value as number };
    }
  }
  return data;
}

export async function enforceUsageLimits(options: {
  res: Response;
  actor?: Actor;
  globalIncrements?: LimitCounters;
  userIncrements?: UserLimitCounters;
}): Promise<boolean> {
  const globalIncrements = options.globalIncrements ?? {};
  const userIncrements = options.userIncrements ?? {};

  if (!hasAnyCounters(globalIncrements) && !hasAnyCounters(userIncrements)) {
    debugUsageLog('No counters supplied, skipping enforcement.');
    return true;
  }

  const globalCaps = getGlobalCaps();
  const userCaps = getUserCaps();
  const dateKey = getTodayDateKey();

  if (hasAnyCounters(userIncrements) && options.actor?.uid) {
    const usageFromLogs = await deriveUsageFromApiLogs(
      options.actor.uid,
      dateKey
    );
    if (userLimitExceeded(usageFromLogs, userIncrements, userCaps)) {
      sendBlocked(
        options.res,
        429,
        'LIMIT_USER_DAILY',
        'You have reached your daily usage limit.',
        {
          usage: {
            user: usageFromLogs,
            limits: buildUserLimitSummary(userCaps),
          },
        }
      );
      return false;
    }
  }

  if (!usageSchemaAvailable()) {
    warnMissingUsageSchema('enforceUsageLimits:client-check');
    debugUsageLog('Schema unavailable at client check.', {
      actorUid: options.actor?.uid ?? null,
      globalIncrements,
      userIncrements,
    });
    return true;
  }

  debugUsageLog('Starting enforcement transaction.', {
    actorUid: options.actor?.uid ?? null,
    dateKey,
    globalIncrements,
    userIncrements,
    globalCaps,
    userCaps,
  });

  let result:
    | { blocked: 'global' }
    | { blocked: 'user'; usage: UserUsageSummary; limits: UserLimitSummary }
    | { blocked: null };

  try {
    result = await db.$transaction(async (tx: any) => {
      if (hasAnyCounters(globalIncrements)) {
        const globalUsage = await tx.dailyGlobalUsage.upsert({
          where: { dateKey },
          update: {},
          create: { dateKey },
        });

        if (globalLimitExceeded(globalUsage, globalIncrements, globalCaps)) {
          return { blocked: 'global' as const };
        }
      }

      if (hasAnyCounters(userIncrements) && options.actor?.uid) {
        const userUsage = await tx.dailyUserUsage.upsert({
          where: {
            dateKey_userUid: {
              dateKey,
              userUid: options.actor.uid,
            },
          },
          update: {},
          create: {
            dateKey,
            userUid: options.actor.uid,
          },
        });

        if (userLimitExceeded(userUsage, userIncrements, userCaps)) {
          return {
            blocked: 'user' as const,
            usage: buildUserUsageSummary(userUsage),
            limits: buildUserLimitSummary(userCaps),
          };
        }
      }

      if (hasAnyCounters(globalIncrements)) {
        await tx.dailyGlobalUsage.update({
          where: { dateKey },
          data: buildGlobalIncrementData(globalIncrements),
        });
      }

      if (hasAnyCounters(userIncrements) && options.actor?.uid) {
        await tx.dailyUserUsage.update({
          where: {
            dateKey_userUid: {
              dateKey,
              userUid: options.actor.uid,
            },
          },
          data: buildUserIncrementData(userIncrements),
        });
      }

      return { blocked: null };
    });
  } catch (error) {
    if (isMissingUsageSchemaError(error)) {
      warnMissingUsageSchema('enforceUsageLimits:transaction', error);
      debugUsageLog('Schema unavailable during transaction.', {
        actorUid: options.actor?.uid ?? null,
        error,
      });
      return true;
    }
    throw error;
  }

  debugUsageLog('Enforcement transaction result.', result);

  if (result.blocked === 'global') {
    sendBlocked(
      options.res,
      429,
      'LIMIT_GLOBAL_DAILY',
      'Daily prototype limit reached. Please try again tomorrow.'
    );
    return false;
  }

  if (result.blocked === 'user') {
    sendBlocked(
      options.res,
      429,
      'LIMIT_USER_DAILY',
      'You have reached your daily usage limit.',
      {
        usage: {
          user: result.usage,
          limits: result.limits,
        },
      }
    );
    return false;
  }

  return true;
}

function parseAllowlist(): Set<string> {
  const raw = process.env.SIGNUP_ALLOWLIST || '';
  const values = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(values);
}

function isAllowlisted(actor: Actor, allowlist: Set<string>): boolean {
  if (allowlist.has(actor.uid.toLowerCase())) {
    return true;
  }

  const email = actor.email?.trim().toLowerCase();
  if (email && allowlist.has(email)) {
    return true;
  }

  return false;
}

async function upsertUser(actor: Actor) {
  if (!usageSchemaAvailable()) {
    warnMissingUsageSchema('upsertUser:client-check');
    return;
  }

  await db.appUser.upsert({
    where: { uid: actor.uid },
    update: {
      email: actor.email ?? null,
      displayName: actor.displayName ?? null,
    },
    create: {
      uid: actor.uid,
      email: actor.email ?? null,
      displayName: actor.displayName ?? null,
    },
  });
}

export async function enforceSignupPolicy(options: {
  actor: Actor;
  res: Response;
}): Promise<boolean> {
  const modeRaw = (process.env.SIGNUP_MODE || 'open').trim().toLowerCase();
  const mode =
    modeRaw === 'allowlist' || modeRaw === 'cap' || modeRaw === 'hybrid'
      ? modeRaw
      : 'open';
  const allowlist = parseAllowlist();
  const signupCap = parsePositiveInt('SIGNUP_CAP');

  if (!usageSchemaAvailable()) {
    warnMissingUsageSchema('enforceSignupPolicy:client-check');
    debugUsageLog('Signup policy running without usage schema.', {
      mode,
      actorUid: options.actor.uid,
    });
    if (mode === 'allowlist') {
      if (!isAllowlisted(options.actor, allowlist)) {
        sendBlocked(
          options.res,
          403,
          'SIGNUP_WAITLIST',
          'Signups are limited right now. Join the waitlist to get access.'
        );
        return false;
      }
    }
    return true;
  }

  if (mode === 'open') {
    try {
      await upsertUser(options.actor);
    } catch (error) {
      if (isMissingUsageSchemaError(error)) {
        warnMissingUsageSchema('enforceSignupPolicy:open-upsert', error);
        return true;
      }
      throw error;
    }
    return true;
  }

  if (mode === 'allowlist') {
    if (!isAllowlisted(options.actor, allowlist)) {
      sendBlocked(
        options.res,
        403,
        'SIGNUP_WAITLIST',
        'Signups are limited right now. Join the waitlist to get access.'
      );
      return false;
    }

    try {
      await upsertUser(options.actor);
    } catch (error) {
      if (isMissingUsageSchemaError(error)) {
        warnMissingUsageSchema('enforceSignupPolicy:allowlist-upsert', error);
        return true;
      }
      throw error;
    }
    return true;
  }

  let result: { allowed: boolean };
  try {
    result = await db.$transaction(async (tx: any) => {
      const existing = await tx.appUser.findUnique({
        where: { uid: options.actor.uid },
      });

      if (existing) {
        await tx.appUser.update({
          where: { uid: options.actor.uid },
          data: {
            email: options.actor.email ?? null,
            displayName: options.actor.displayName ?? null,
          },
        });
        return { allowed: true };
      }

      if (mode === 'hybrid' && isAllowlisted(options.actor, allowlist)) {
        await tx.appUser.create({
          data: {
            uid: options.actor.uid,
            email: options.actor.email ?? null,
            displayName: options.actor.displayName ?? null,
          },
        });
        return { allowed: true };
      }

      if (signupCap) {
        const existingCount = await tx.appUser.count();
        if (existingCount >= signupCap) {
          return { allowed: false };
        }
      }

      await tx.appUser.create({
        data: {
          uid: options.actor.uid,
          email: options.actor.email ?? null,
          displayName: options.actor.displayName ?? null,
        },
      });
      return { allowed: true };
    });
  } catch (error) {
    if (isMissingUsageSchemaError(error)) {
      warnMissingUsageSchema('enforceSignupPolicy:transaction', error);
      return true;
    }
    throw error;
  }

  if (!result.allowed) {
    sendBlocked(
      options.res,
      403,
      'SIGNUP_WAITLIST',
      'Signups are limited right now. Join the waitlist to get access.'
    );
    return false;
  }

  return true;
}

function usageFromApiEndpoint(endpoint: string): UserUsageSummary {
  const usage: UserUsageSummary = {
    llmCalls: 0,
    wikiCalls: 0,
    museumCreates: 0,
    artifactCreates: 0,
  };
  const normalized = endpoint.trim();

  // Creation paths
  if (normalized === 'POST /museums') {
    usage.museumCreates += 1;
  }
  if (normalized.startsWith('POST /api/museums/select/')) {
    usage.wikiCalls += 1;
  }
  if (
    normalized.startsWith('POST /museums/') &&
    normalized.endsWith('/scan/create')
  ) {
    usage.artifactCreates += 1;
  }
  if (
    normalized.startsWith('POST /api/museums/') &&
    normalized.endsWith('/hydrate-artifacts')
  ) {
    usage.wikiCalls += 1;
  }

  // LLM paths
  if (
    normalized.startsWith('GET /generate-content/artefact/') ||
    normalized.startsWith('POST /generate-content/artefact/') ||
    normalized.includes('/generate-introduction') ||
    normalized.includes('/questions/ask')
  ) {
    usage.llmCalls += 1;
  }

  // Wikipedia/Wikidata paths
  if (
    normalized.startsWith('GET /wikipedia/summary') ||
    normalized.startsWith('GET /api/museums/search/wikidata') ||
    normalized.startsWith('GET /api/museums/search/location') ||
    normalized.startsWith('GET /api/museums/search/nearby') ||
    normalized.startsWith('GET /api/museums/search')
  ) {
    usage.wikiCalls += 1;
  }

  return usage;
}

function addUsage(a: UserUsageSummary, b: UserUsageSummary): UserUsageSummary {
  return {
    llmCalls: a.llmCalls + b.llmCalls,
    wikiCalls: a.wikiCalls + b.wikiCalls,
    museumCreates: a.museumCreates + b.museumCreates,
    artifactCreates: a.artifactCreates + b.artifactCreates,
  };
}

function maxUsage(a: UserUsageSummary, b: UserUsageSummary): UserUsageSummary {
  return {
    llmCalls: Math.max(a.llmCalls, b.llmCalls),
    wikiCalls: Math.max(a.wikiCalls, b.wikiCalls),
    museumCreates: Math.max(a.museumCreates, b.museumCreates),
    artifactCreates: Math.max(a.artifactCreates, b.artifactCreates),
  };
}

function extractUserUidFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const value = (metadata as Record<string, unknown>).userUid;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function extractUsageDeltaFromMetadata(
  metadata: unknown
): Partial<UserUsageSummary> | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const usageDelta = (metadata as Record<string, unknown>).usageDelta;
  if (!usageDelta || typeof usageDelta !== 'object') {
    return null;
  }

  const delta = usageDelta as Record<string, unknown>;
  const toNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : undefined;

  return {
    llmCalls: toNumber(delta.llmCalls),
    wikiCalls: toNumber(delta.wikiCalls),
    museumCreates: toNumber(delta.museumCreates),
    artifactCreates: toNumber(delta.artifactCreates),
  };
}

function allowArtifactDeltaForEndpoint(endpoint: string): boolean {
  const normalized = endpoint.trim();
  return (
    normalized.startsWith('POST /museums/') &&
    normalized.endsWith('/scan/create')
  );
}

async function deriveUsageFromApiLogs(
  userUid: string,
  dateKey: string
): Promise<UserUsageSummary> {
  const startOfDayUtc = new Date(`${dateKey}T00:00:00.000Z`);
  const rows = await db.apiCall.findMany({
    where: {
      service: 'API',
      createdAt: { gte: startOfDayUtc },
    },
    select: {
      endpoint: true,
      metadata: true,
    },
  });

  let usage: UserUsageSummary = {
    llmCalls: 0,
    wikiCalls: 0,
    museumCreates: 0,
    artifactCreates: 0,
  };

  for (const row of rows) {
    if (extractUserUidFromMetadata(row.metadata) !== userUid) {
      continue;
    }

    const endpointUsage = usageFromApiEndpoint(row.endpoint);
    const deltaUsage = extractUsageDeltaFromMetadata(row.metadata);
    const effectiveUsage: UserUsageSummary = deltaUsage
      ? {
          llmCalls: deltaUsage.llmCalls ?? endpointUsage.llmCalls,
          wikiCalls: deltaUsage.wikiCalls ?? endpointUsage.wikiCalls,
          museumCreates:
            deltaUsage.museumCreates ?? endpointUsage.museumCreates,
          artifactCreates: allowArtifactDeltaForEndpoint(row.endpoint)
            ? (deltaUsage.artifactCreates ?? endpointUsage.artifactCreates)
            : endpointUsage.artifactCreates,
        }
      : endpointUsage;

    usage = addUsage(usage, effectiveUsage);
  }

  return usage;
}

async function countUserPlaqueScansFromApiLogs(
  userUid: string,
  dateKey: string
): Promise<number> {
  const startOfDayUtc = new Date(`${dateKey}T00:00:00.000Z`);
  const rows = await db.apiCall.findMany({
    where: {
      service: 'API',
      createdAt: { gte: startOfDayUtc },
    },
    select: {
      endpoint: true,
      metadata: true,
    },
  });

  let count = 0;
  for (const row of rows) {
    if (extractUserUidFromMetadata(row.metadata) !== userUid) {
      continue;
    }

    const endpoint = row.endpoint.trim();
    if (
      endpoint.startsWith('POST /museums/') &&
      endpoint.endsWith('/scan/ocr')
    ) {
      count += 1;
    }
  }

  return count;
}

export async function enforcePlaqueScanLimit(options: {
  res: Response;
  actor?: Actor;
}): Promise<boolean> {
  const userUid = options.actor?.uid;
  const limit = USER_DAILY_LIMITS.plaqueScans;
  if (!userUid || limit === null) {
    return true;
  }

  const dateKey = getTodayDateKey();
  const used = await countUserPlaqueScansFromApiLogs(userUid, dateKey);
  debugUsageLog('Plaque scan limit check.', { userUid, dateKey, used, limit });

  if (used >= limit) {
    const usage = await getUserUsageForToday(userUid);
    sendBlocked(
      options.res,
      429,
      'LIMIT_USER_DAILY',
      `You have reached your daily plaque scan limit (${limit}).`,
      { usage: { user: usage.usage, limits: usage.limits } }
    );
    return false;
  }

  return true;
}

export async function getUserUsageForToday(userUid: string) {
  const dateKey = getTodayDateKey();
  debugUsageLog('Reading user usage for today.', { userUid, dateKey });
  const limits = buildUserLimitSummary(getUserCaps());

  if (!usageSchemaAvailable()) {
    warnMissingUsageSchema('getUserUsageForToday:client-check');
    debugUsageLog('Schema unavailable during usage read.', {
      userUid,
      dateKey,
    });
    const usageFromLogs = await deriveUsageFromApiLogs(userUid, dateKey);
    debugUsageLog(
      'Derived usage from API logs (schema unavailable).',
      usageFromLogs
    );
    return {
      dateKey,
      resetAt: getNextResetAtIso(),
      usage: usageFromLogs,
      limits,
    };
  }

  try {
    const usage = await db.dailyUserUsage.findUnique({
      where: {
        dateKey_userUid: {
          dateKey,
          userUid,
        },
      },
    });

    const usageSummary: UserUsageSummary = {
      llmCalls: usage?.llmCalls ?? 0,
      wikiCalls: usage?.wikiCalls ?? 0,
      museumCreates: usage?.museumCreates ?? 0,
      artifactCreates: usage?.artifactCreates ?? 0,
    };
    const usageFromLogs = await deriveUsageFromApiLogs(userUid, dateKey);
    const mergedUsage = maxUsage(usageSummary, usageFromLogs);
    // Artifact create quota applies to scanned artefacts only.
    mergedUsage.artifactCreates = usageFromLogs.artifactCreates;
    debugUsageLog('Merged usage from counters + API logs.', {
      counters: usageSummary,
      apiLogs: usageFromLogs,
      merged: mergedUsage,
    });

    return {
      dateKey,
      resetAt: getNextResetAtIso(),
      usage: mergedUsage,
      limits,
    };
  } catch (error) {
    if (isMissingUsageSchemaError(error)) {
      warnMissingUsageSchema('getUserUsageForToday:query', error);
      debugUsageLog('Schema unavailable during usage query.', {
        userUid,
        dateKey,
        error,
      });
      const usageFromLogs = await deriveUsageFromApiLogs(userUid, dateKey);
      return {
        dateKey,
        resetAt: getNextResetAtIso(),
        usage: usageFromLogs,
        limits,
      };
    }
    throw error;
  }
}
