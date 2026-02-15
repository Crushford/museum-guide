import type { Response } from 'express';
import { prisma } from '@repo/db';
import type { Actor } from '../middleware/auth';
const db = prisma as any;

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
    llmCalls: parsePositiveInt('GLOBAL_DAILY_LLM_CAP') ?? undefined,
    wikiCalls: parsePositiveInt('GLOBAL_DAILY_WIKI_CAP') ?? undefined,
    dbOps: parsePositiveInt('GLOBAL_DAILY_DB_OPS_CAP') ?? undefined,
    museumCreates: parsePositiveInt('GLOBAL_DAILY_MUSEUM_CREATES_CAP') ?? undefined,
    artifactCreates:
      parsePositiveInt('GLOBAL_DAILY_ARTIFACT_CREATES_CAP') ?? undefined,
  };
}

function getUserCaps(): UserLimitCaps {
  return {
    llmCalls: parsePositiveInt('FREE_DAILY_LLM_CAP') ?? undefined,
    wikiCalls: parsePositiveInt('FREE_DAILY_WIKI_CAP') ?? undefined,
    museumCreates: parsePositiveInt('FREE_DAILY_MUSEUM_CREATES_CAP') ?? undefined,
    artifactCreates:
      parsePositiveInt('FREE_DAILY_ARTIFACT_CREATES_CAP') ?? undefined,
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
    return true;
  }

  const globalCaps = getGlobalCaps();
  const userCaps = getUserCaps();
  const dateKey = getTodayDateKey();

  const result = await db.$transaction(async (tx: any) => {
    if (hasAnyCounters(globalIncrements)) {
      const globalUsage = await tx.dailyGlobalUsage.upsert({
        where: { dateKey },
        update: {},
        create: { dateKey },
      });

      if (globalLimitExceeded(globalUsage, globalIncrements, globalCaps)) {
        return { blocked: 'global' };
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
          blocked: 'user',
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

  if (mode === 'open') {
    await upsertUser(options.actor);
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

    await upsertUser(options.actor);
    return true;
  }

  const result = await db.$transaction(async (tx: any) => {
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

export async function getUserUsageForToday(userUid: string) {
  const dateKey = getTodayDateKey();
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

  return {
    dateKey,
    resetAt: getNextResetAtIso(),
    usage: usageSummary,
    limits: buildUserLimitSummary(getUserCaps()),
  };
}
