import type { Request, Response } from 'express';
import type { Actor } from '../middleware/auth';
import {
  enforcePlaqueScanLimit,
  enforceSignupPolicy,
  enforceUsageLimits,
} from '../lib/usage-limits';
import { requireActor } from './guards';

type UsageLimitOptions = Omit<
  Parameters<typeof enforceUsageLimits>[0],
  'res' | 'actor'
>;

type AdminActionGuardsOptions = {
  req: Request;
  res: Response;
  requireSignup?: boolean;
  usage?: UsageLimitOptions;
  plaqueScanLimit?: boolean;
};

type OptionalAudioGenerationOptions = {
  logLabel: string;
  logContext?: Record<string, unknown>;
  generate: () => Promise<string>;
  persist: (audioUrl: string) => Promise<void>;
};

export async function enforceAdminActionGuards({
  req,
  res,
  requireSignup = false,
  usage,
  plaqueScanLimit = false,
}: AdminActionGuardsOptions): Promise<Actor | null> {
  const actor = requireActor(req);

  if (requireSignup) {
    const signupAllowed = await enforceSignupPolicy({ actor, res });
    if (!signupAllowed) {
      return null;
    }
  }

  if (usage) {
    const limitsAllowed = await enforceUsageLimits({
      res,
      actor,
      ...usage,
    });
    if (!limitsAllowed) {
      return null;
    }
  }

  if (plaqueScanLimit) {
    const scanAllowed = await enforcePlaqueScanLimit({ actor, res });
    if (!scanAllowed) {
      return null;
    }
  }

  return actor;
}

export async function withOptionalAudioGeneration({
  logLabel,
  logContext,
  generate,
  persist,
}: OptionalAudioGenerationOptions): Promise<{
  audioUrl: string | null;
  errorMessage: string | null;
}> {
  try {
    const audioUrl = await generate();
    await persist(audioUrl);
    return { audioUrl, errorMessage: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(logLabel, {
      ...(logContext ?? {}),
      error: errorMessage,
    });
    return { audioUrl: null, errorMessage };
  }
}
