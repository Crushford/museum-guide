import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';

export interface ApiCallParams {
  service: string;
  endpoint: string;
  durationMs: number;
  status: 'success' | 'error';
  statusCode?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  costEur?: number;
  contentId?: number;
  artifactId?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Fire-and-forget: record an API call to the database.
 * Never blocks or throws — errors are logged to console.
 */
export function recordApiCall(params: ApiCallParams): void {
  prisma.apiCall
    .create({
      data: {
        service: params.service,
        endpoint: params.endpoint,
        durationMs: params.durationMs,
        status: params.status,
        statusCode: params.statusCode ?? null,
        inputTokens: params.inputTokens ?? null,
        outputTokens: params.outputTokens ?? null,
        model: params.model ?? null,
        costEur: params.costEur ?? null,
        contentId: params.contentId ?? null,
        artifactId: params.artifactId ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
        error: params.error ?? null,
      },
    })
    .catch((err) => {
      console.error('[api-call-tracker] Failed to record API call:', err);
    });
}

/**
 * Synchronous variant for flows that need to enrich an existing row later.
 * Returns the created ApiCall id, or null if logging fails.
 */
export async function recordApiCallSync(
  params: ApiCallParams
): Promise<number | null> {
  try {
    const row = await prisma.apiCall.create({
      data: {
        service: params.service,
        endpoint: params.endpoint,
        durationMs: params.durationMs,
        status: params.status,
        statusCode: params.statusCode ?? null,
        inputTokens: params.inputTokens ?? null,
        outputTokens: params.outputTokens ?? null,
        model: params.model ?? null,
        costEur: params.costEur ?? null,
        contentId: params.contentId ?? null,
        artifactId: params.artifactId ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
        error: params.error ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error('[api-call-tracker] Failed to record API call:', err);
    return null;
  }
}

/**
 * Wrap an async function, timing it and recording the result.
 * Re-throws on error so callers still handle failures normally.
 */
export async function trackApiCall<T>(
  params: {
    service: string;
    endpoint: string;
    metadata?: Record<string, unknown>;
  },
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordApiCall({
      ...params,
      durationMs: Date.now() - start,
      status: 'success',
    });
    return result;
  } catch (err) {
    recordApiCall({
      ...params,
      durationMs: Date.now() - start,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
