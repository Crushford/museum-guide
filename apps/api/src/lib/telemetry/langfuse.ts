import { Langfuse } from 'langfuse';

let langfuseInstance: Langfuse | null = null;

export function initLangfuse(): void {
  if (process.env.LANGFUSE_ENABLED !== 'true') return;

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    console.warn(
      '[Langfuse] Enabled but missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY. Disabling.'
    );
    return;
  }

  try {
    langfuseInstance = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    });
    console.log('[Langfuse] Initialized');
  } catch (err) {
    console.warn('[Langfuse] Failed to initialize:', err);
    langfuseInstance = null;
  }
}

export function traceGeneration(params: {
  name: string;
  input: string;
  output: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}): void {
  if (!langfuseInstance) return;

  try {
    const trace = langfuseInstance.trace({
      name: params.name,
      metadata: { provider: params.provider, ...params.metadata },
    });

    trace.generation({
      name: params.name,
      model: params.model,
      input: params.input,
      output: params.output,
      usage: {
        promptTokens: params.inputTokens,
        completionTokens: params.outputTokens,
      },
      metadata: {
        provider: params.provider,
        durationMs: params.durationMs,
        ...params.metadata,
      },
    });

    // Flush so events are sent promptly
    langfuseInstance.flush();
  } catch (err) {
    console.warn('[Langfuse] Trace failed:', err);
  }
}

export async function flushLangfuse(): Promise<void> {
  if (!langfuseInstance) return;
  try {
    await langfuseInstance.flush();
  } catch (err) {
    console.warn('[Langfuse] Flush failed:', err);
  }
}
