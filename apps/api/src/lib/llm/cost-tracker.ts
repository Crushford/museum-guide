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
  contentId?: number | null;
  artifactId?: number | null;
}): Promise<void> {
  const costEur = estimateCostEur(
    params.model,
    params.inputTokens,
    params.outputTokens
  );
  await prisma.llmUsage.create({
    data: {
      provider: params.provider,
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

  const where: { createdAt: { gte: Date }; provider?: string } = {
    createdAt: { gte: startOfMonth },
  };
  if (provider) where.provider = provider;

  const results = await prisma.llmUsage.groupBy({
    by: ['provider'],
    where,
    _sum: { costEur: true },
  });

  return results.map((r) => ({
    provider: r.provider,
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
