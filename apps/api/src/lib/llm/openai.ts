import OpenAI from 'openai';
import {
  TAGGING_INSTRUCTIONS,
  sanitizeSensitiveTopics,
  sanitizeSubjectTags,
  type LlmProvider,
  type LlmGenerateRequest,
  type LlmGenerateResult,
} from './types';
import { checkDailySpendLimit, checkSpendLimit } from './cost-tracker';
import {
  recordApiCall,
  recordApiCallSync,
} from '../telemetry/api-call-tracker';
import { assertTextAllowedForLlm } from './moderation';

function extractResponseText(res: any): string {
  if (typeof res?.output_text === 'string' && res.output_text.trim()) {
    return res.output_text.trim();
  }

  const chunks: string[] = [];
  const output = Array.isArray(res?.output) ? res.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === 'string') chunks.push(c.text);
    }
  }

  return chunks.join('').trim();
}

export const MUSEUM_GUIDE_JSON_INSTRUCTIONS = `You must return a single valid JSON object and nothing else.

Rules:
- Do not wrap JSON in markdown.
- Do not include any extra keys.
- All strings must be plain text (no HTML).
- The "text" field is the final answer for the current task.
- Do not include greetings, self-introductions, or the word "welcome".
- Do not include stage directions or gestures.

${TAGGING_INSTRUCTIONS}`;

export class OpenAILlmProvider implements LlmProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private modelName: string;
  private maxOutputTokens: number;

  constructor(apiKey: string, modelName?: string) {
    this.client = new OpenAI({ apiKey });
    this.modelName =
      modelName || process.env.OPENAI_MODEL_INTRODUCTION || 'gpt-5-nano';
    this.maxOutputTokens = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 1000);
  }

  async generate(request: LlmGenerateRequest): Promise<
    LlmGenerateResult & {
      isAdultContent: boolean;
      sensitiveTopics: string[];
      subjectTags: string[];
    }
  > {
    const start = Date.now();
    await assertTextAllowedForLlm(request.prompt, 'provider-openai-generate');
    const monthlyLimit = await checkSpendLimit('openai');
    if (!monthlyLimit.allowed) {
      throw new Error(
        `Monthly OpenAI spend limit reached (€${monthlyLimit.currentSpendEur.toFixed(2)} / €${monthlyLimit.limitEur?.toFixed(2)})`
      );
    }
    const dailyLimit = await checkDailySpendLimit('openai');
    if (!dailyLimit.allowed) {
      throw new Error(
        `Daily OpenAI spend limit reached (€${dailyLimit.currentSpendEur.toFixed(2)} / €${dailyLimit.limitEur?.toFixed(2)})`
      );
    }

    const input: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (request.systemInstruction) {
      input.push({ role: 'system', content: request.systemInstruction });
    }

    input.push({
      role: 'system',
      content: MUSEUM_GUIDE_JSON_INSTRUCTIONS,
    });

    input.push({ role: 'user', content: request.prompt });

    let res: any;
    try {
      res = await this.client.responses.create({
        model: this.modelName,
        input,
        max_output_tokens: this.maxOutputTokens,
        reasoning: { effort: 'minimal' },
        text: {
          format: {
            type: 'json_schema',
            name: 'museum_guide_answer',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: 'string' },
                isAdultContent: { type: 'boolean' },
                sensitiveTopics: { type: 'array', items: { type: 'string' } },
                subjectTags: { type: 'array', items: { type: 'string' } },
                suggestedQuestions: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: [
                'text',
                'isAdultContent',
                'sensitiveTopics',
                'subjectTags',
                'suggestedQuestions',
              ],
            },
          },
        },
      });
    } catch (err: any) {
      recordApiCall({
        service: 'OpenAI',
        endpoint: 'responses.create',
        durationMs: Date.now() - start,
        status: 'error',
        statusCode: err?.status,
        metadata: { model: this.modelName },
        error: err?.message,
      });
      console.error(
        '[OpenAI] Request failed:',
        err?.message,
        err?.status,
        err?.code
      );
      throw err;
    }

    const durationMs = Date.now() - start;

    const apiCallId = await recordApiCallSync({
      service: 'OpenAI',
      endpoint: 'responses.create',
      durationMs,
      status: 'success',
      inputTokens: res?.usage?.input_tokens ?? 0,
      outputTokens: res?.usage?.output_tokens ?? 0,
      model: this.modelName,
    });
    const raw = extractResponseText(res);

    if (!raw) {
      throw new Error('[OpenAI] Empty response payload (no JSON text found)');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `[OpenAI] Failed to parse JSON output: ${(e as Error).message}. Raw preview: ${raw.slice(0, 200)}`
      );
    }

    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (!text) {
      throw new Error('[OpenAI] Parsed JSON but "text" was empty');
    }

    const isAdultContent = parsed.isAdultContent === true;

    const sensitiveTopics = sanitizeSensitiveTopics(parsed.sensitiveTopics);
    const subjectTags = sanitizeSubjectTags(parsed.subjectTags);
    const suggestedQuestions = Array.isArray(parsed.suggestedQuestions)
      ? parsed.suggestedQuestions
          .filter((item: unknown): item is string => typeof item === 'string')
          .map((item: string) => item.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    return {
      text,
      isAdultContent,
      sensitiveTopics,
      subjectTags,
      suggestedQuestions,
      apiCallId,
      inputTokens: res?.usage?.input_tokens ?? 0,
      outputTokens: res?.usage?.output_tokens ?? 0,
      model: this.modelName,
      provider: this.name,
      durationMs,
    };
  }
}
