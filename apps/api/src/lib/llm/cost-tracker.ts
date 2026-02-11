import { prisma } from '@repo/db';

// Cost per 1M tokens in EUR (conservative estimates)
const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
};

const FALLBACK_COST = { input: 1.0, output: 3.0 };

export function estimateCostEur(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = COST_TABLE[model] ?? FALLBACK_COST;
  return (
    (inputTokens / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output
  );
}

export async function recordUsage(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  apiCallId?: number | null;
  contentId?: number | null;
  artifactId?: number | null;
}): Promise<void> {
  const costEur = estimateCostEur(
    params.model,
    params.inputTokens,
    params.outputTokens
  );

  if (params.apiCallId) {
    try {
      await prisma.apiCall.update({
        where: { id: params.apiCallId },
        data: {
          model: params.model,
          inputTokens: params.inputTokens,
          outputTokens: params.outputTokens,
          costEur,
          contentId: params.contentId ?? null,
          artifactId: params.artifactId ?? null,
        },
      });
      return;
    } catch {
      // Fall through to create a dedicated usage row.
    }
  }

  const fallbackService =
    params.provider === 'openai'
      ? 'OpenAI'
      : params.provider === 'google'
        ? 'Gemini'
        : params.provider;

  await prisma.apiCall.create({
    data: {
      service: fallbackService,
      endpoint: 'llm.generate',
      durationMs: params.durationMs ?? 0,
      status: 'success',
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costEur,
      contentId: params.contentId ?? null,
      artifactId: params.artifactId ?? null,
    },
  });
}

export async function getMonthlySpendEur(
  provider?: string
): Promise<{ provider: string; totalEur: number }[]> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const where: {
    createdAt: { gte: Date };
    costEur: { not: null };
    service?: string;
  } = {
    createdAt: { gte: startOfMonth },
    costEur: { not: null },
  };
  if (provider) {
    where.service =
      provider === 'openai'
        ? 'OpenAI'
        : provider === 'google'
          ? 'Gemini'
          : provider;
  }

  const results = await prisma.apiCall.groupBy({
    by: ['service'],
    where,
    _sum: { costEur: true },
  });

  return results.map((r) => ({
    provider:
      r.service === 'OpenAI'
        ? 'openai'
        : r.service === 'Gemini'
          ? 'google'
          : r.service,
    totalEur: r._sum.costEur ?? 0,
  }));
}

export async function checkSpendLimit(provider: string): Promise<{
  allowed: boolean;
  currentSpendEur: number;
  limitEur: number | null;
}> {
  const envKey = `${provider.toUpperCase()}_MAX_EUR_PER_MONTH`;
  const limitStr = process.env[envKey];
  const limitEur = limitStr ? parseFloat(limitStr) : null;

  if (limitEur === null || isNaN(limitEur)) {
    return { allowed: true, currentSpendEur: 0, limitEur: null };
  }

  const spendData = await getMonthlySpendEur(provider);
  const currentSpendEur = spendData[0]?.totalEur ?? 0;

  return {
    allowed: currentSpendEur < limitEur,
    currentSpendEur,
    limitEur,
  };
}

export async function getDailySpendEur(
  provider?: string
): Promise<{ provider: string; totalEur: number }[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const where: {
    createdAt: { gte: Date };
    costEur: { not: null };
    service?: string;
  } = {
    createdAt: { gte: startOfDay },
    costEur: { not: null },
  };
  if (provider) {
    where.service =
      provider === 'openai'
        ? 'OpenAI'
        : provider === 'google'
          ? 'Gemini'
          : provider;
  }

  const results = await prisma.apiCall.groupBy({
    by: ['service'],
    where,
    _sum: { costEur: true },
  });

  return results.map((r) => ({
    provider:
      r.service === 'OpenAI'
        ? 'openai'
        : r.service === 'Gemini'
          ? 'google'
          : r.service,
    totalEur: r._sum.costEur ?? 0,
  }));
}

export async function checkDailySpendLimit(provider: string): Promise<{
  allowed: boolean;
  currentSpendEur: number;
  limitEur: number | null;
}> {
  const envKey = `${provider.toUpperCase()}_MAX_EUR_PER_DAY`;
  const limitStr = process.env[envKey];
  const limitEur = limitStr ? parseFloat(limitStr) : null;

  if (limitEur === null || isNaN(limitEur)) {
    return { allowed: true, currentSpendEur: 0, limitEur: null };
  }

  const spendData = await getDailySpendEur(provider);
  const currentSpendEur = spendData[0]?.totalEur ?? 0;

  return {
    allowed: currentSpendEur < limitEur,
    currentSpendEur,
    limitEur,
  };
}
