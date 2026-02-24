import OpenAI from 'openai';
import { recordApiCall } from '../telemetry/api-call-tracker';
import { env } from '../../config/env';

const OPENAI_MODERATION_MODEL = 'omni-moderation-latest';
const OPENAI_MODERATIONS_ENDPOINT = 'moderations.create';
const OPENAI_RESPONSES_ENDPOINT = 'responses.create';
const MODERATION_FALLBACK_SCHEMA_NAME = 'pre_llm_moderation';

const DEFAULT_BLOCKED_CATEGORIES = [
  'sexual',
  'sexual/minors',
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'illicit',
  'illicit/violent',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'violence',
  'violence/graphic',
];

function getBlockedCategories(): Set<string> {
  const configured = env.OPENAI_MODERATION_BLOCK_CATEGORIES;
  if (!configured || configured.trim().length === 0) {
    return new Set(DEFAULT_BLOCKED_CATEGORIES);
  }

  const categories = configured
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean);
  return new Set(
    categories.length > 0 ? categories : DEFAULT_BLOCKED_CATEGORIES
  );
}

function extractOpenAIText(response: any): string {
  if (
    typeof response?.output_text === 'string' &&
    response.output_text.trim()
  ) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === 'string') chunks.push(c.text);
    }
  }
  return chunks.join('').trim();
}

function filterBlockedCategories(categories: string[]): string[] {
  const blocked = getBlockedCategories();
  return categories.filter((category) => blocked.has(category));
}

export class ModerationBlockedError extends Error {
  categories: string[];
  constructor(categories: string[]) {
    super(`LLM input blocked by moderation: ${categories.join(', ')}`);
    this.name = 'ModerationBlockedError';
    this.categories = categories;
  }
}

export async function moderateTextForLlm(
  text: string,
  purpose: string
): Promise<{ blocked: boolean; categories: string[]; source: string }> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    if (env.OPENAI_MODERATION_ALLOW_UNAVAILABLE) {
      return { blocked: false, categories: [], source: 'unavailable' };
    }
    throw new Error('OPENAI_API_KEY missing for moderation checks');
  }

  const client = new OpenAI({ apiKey });
  const moderationStart = Date.now();

  try {
    const moderation = await client.moderations.create({
      model: OPENAI_MODERATION_MODEL,
      input: text,
    });

    const first = moderation.results?.[0];
    const flaggedCategories = Object.entries(
      (first?.categories ?? {}) as unknown as Record<string, boolean | null>
    )
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);
    const blockedCategories = filterBlockedCategories(flaggedCategories);

    recordApiCall({
      service: 'OpenAI',
      endpoint: OPENAI_MODERATIONS_ENDPOINT,
      durationMs: Date.now() - moderationStart,
      status: 'success',
      model: OPENAI_MODERATION_MODEL,
      metadata: {
        purpose,
        flaggedCategories,
        blockedCategories,
      },
    });

    return {
      blocked: blockedCategories.length > 0,
      categories: blockedCategories,
      source: 'moderations',
    };
  } catch (error) {
    recordApiCall({
      service: 'OpenAI',
      endpoint: OPENAI_MODERATIONS_ENDPOINT,
      durationMs: Date.now() - moderationStart,
      status: 'error',
      model: OPENAI_MODERATION_MODEL,
      error: error instanceof Error ? error.message : String(error),
      metadata: { purpose },
    });
  }

  const fallbackModel =
    env.OPENAI_MODEL_MODERATION_FALLBACK ||
    env.OPENAI_MODEL_QA ||
    env.OPENAI_MODEL_INTRODUCTION ||
    'gpt-5-nano';
  const fallbackStart = Date.now();

  try {
    const response = await client.responses.create({
      model: fallbackModel,
      input: [
        {
          role: 'system',
          content: [
            'Classify whether this text should be blocked before sending to an LLM.',
            `Blocked categories: ${Array.from(getBlockedCategories()).join(', ')}.`,
            'Return only JSON with blocked:boolean and categories:string[].',
          ].join('\n'),
        },
        {
          role: 'user',
          content: text,
        },
      ],
      max_output_tokens: 200,
      reasoning: { effort: 'minimal' },
      text: {
        format: {
          type: 'json_schema',
          name: MODERATION_FALLBACK_SCHEMA_NAME,
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              blocked: { type: 'boolean' },
              categories: { type: 'array', items: { type: 'string' } },
            },
            required: ['blocked', 'categories'],
          },
        },
      },
    });

    const raw = extractOpenAIText(response);
    if (!raw) throw new Error('Moderation fallback returned empty response');

    const parsed = JSON.parse(raw) as {
      blocked: boolean;
      categories: string[];
    };
    const blockedCategories = filterBlockedCategories(
      Array.isArray(parsed.categories)
        ? parsed.categories
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    );

    recordApiCall({
      service: 'OpenAI',
      endpoint: OPENAI_RESPONSES_ENDPOINT,
      durationMs: Date.now() - fallbackStart,
      status: 'success',
      model: fallbackModel,
      metadata: {
        purpose,
        mode: 'moderation-fallback',
        blockedCategories,
      },
    });

    return {
      blocked: parsed.blocked === true || blockedCategories.length > 0,
      categories: blockedCategories,
      source: 'fallback',
    };
  } catch (error) {
    recordApiCall({
      service: 'OpenAI',
      endpoint: OPENAI_RESPONSES_ENDPOINT,
      durationMs: Date.now() - fallbackStart,
      status: 'error',
      model: fallbackModel,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        purpose,
        mode: 'moderation-fallback',
      },
    });

    if (env.OPENAI_MODERATION_ALLOW_UNAVAILABLE) {
      return { blocked: false, categories: [], source: 'unavailable' };
    }
    throw new Error(
      `Moderation checks unavailable (endpoint + fallback failed): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function assertTextAllowedForLlm(
  text: string,
  purpose: string
): Promise<void> {
  const normalized = text.trim();
  if (!normalized) return;

  const moderation = await moderateTextForLlm(normalized, purpose);
  if (moderation.blocked) {
    throw new ModerationBlockedError(moderation.categories);
  }
}
