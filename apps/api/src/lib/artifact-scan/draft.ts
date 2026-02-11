import OpenAI from 'openai';
import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from '@google/generative-ai';
import type { ArtifactDraft } from '@repo/types';
import { recordApiCall } from '../telemetry/api-call-tracker';
import { assertTextAllowedForLlm } from '../llm/moderation';

const DRAFT_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    localTitle: { type: SchemaType.STRING },
    localTitleLanguage: { type: SchemaType.STRING },
    englishTitle: { type: SchemaType.STRING },
    knowledgeText: { type: SchemaType.STRING },
    museumConfidence: { type: SchemaType.NUMBER },
  },
  required: [
    'localTitle',
    'localTitleLanguage',
    'englishTitle',
    'knowledgeText',
    'museumConfidence',
  ],
};

function buildDraftPrompt(rawText: string, museumName: string): string {
  return [
    'Extract artifact details from this museum plaque OCR text.',
    `Museum: ${museumName}`,
    '',
    'Requirements:',
    '- localTitle must be a short object name only (2-8 words when possible).',
    '- localTitle must NOT include wall labels/catalog prefixes like "A.", "B.", "C.", "D.".',
    '- localTitle must NOT include long role descriptions, dates, materials, or collection notes.',
    '- localTitleLanguage must be a BCP-47 locale tag like it-IT, en-US, fr-FR, de-DE.',
    '- If plaque text includes both local language and English, localTitle should use the non-English local language text.',
    '- englishTitle must be a natural English title.',
    '- knowledgeText must be an English summary for visitor Q&A context.',
    '- knowledgeText should be factual, concise, and 2-4 sentences.',
    '- museumConfidence must be a number from 0 to 100 for confidence this artifact belongs to this museum.',
    '- Return only JSON that matches the schema.',
    '',
    'OCR text:',
    rawText,
  ].join('\n');
}

function normalizeLanguageTag(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'und';

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('it')) return 'it-IT';
  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('fr')) return 'fr-FR';
  if (lower.startsWith('de')) return 'de-DE';
  if (lower.startsWith('es')) return 'es-ES';

  const parts = trimmed.split('-').filter(Boolean);
  if (parts.length === 1 && /^[a-z]{2,3}$/i.test(parts[0])) {
    return parts[0].toLowerCase();
  }
  if (
    parts.length >= 2 &&
    /^[a-z]{2,3}$/i.test(parts[0]) &&
    /^[a-z]{2}|[A-Z]{2}$/i.test(parts[1])
  ) {
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }
  return trimmed;
}

function cleanLocalTitle(title: string): string {
  return title
    .replace(/^[A-Z]\.\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeDraft(parsed: any, rawText: string): ArtifactDraft {
  const fallbackTitle = cleanLocalTitle(
    rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 2) ?? 'Untitled artefact'
  );

  const localTitle =
    typeof parsed?.localTitle === 'string' && parsed.localTitle.trim()
      ? cleanLocalTitle(parsed.localTitle)
      : fallbackTitle;

  const localTitleLanguage =
    typeof parsed?.localTitleLanguage === 'string' &&
    /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/i.test(parsed.localTitleLanguage.trim())
      ? normalizeLanguageTag(parsed.localTitleLanguage)
      : 'und';

  const englishTitle =
    typeof parsed?.englishTitle === 'string' && parsed.englishTitle.trim()
      ? parsed.englishTitle.trim()
      : localTitle;

  const knowledgeText =
    typeof parsed?.knowledgeText === 'string' && parsed.knowledgeText.trim()
      ? parsed.knowledgeText.trim()
      : 'An English description is not available yet for this artefact.';

  const museumConfidence =
    typeof parsed?.museumConfidence === 'number' &&
    Number.isFinite(parsed.museumConfidence)
      ? Math.max(0, Math.min(100, parsed.museumConfidence))
      : 90;

  return {
    localTitle,
    localTitleLanguage,
    englishTitle,
    knowledgeText,
    museumConfidence,
  };
}

async function extractWithOpenAI(
  rawText: string,
  museumName: string
): Promise<ArtifactDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = process.env.OPENAI_MODEL_ARTIFACT_SCAN || 'gpt-5-nano';
  const client = new OpenAI({ apiKey });
  const start = Date.now();
  const prompt = buildDraftPrompt(rawText, museumName);
  await assertTextAllowedForLlm(prompt, 'artifact-scan-draft-openai');

  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'system',
        content:
          'Return a single JSON object only. Keep values grounded in plaque text and avoid speculation.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    reasoning: { effort: 'minimal' },
    text: {
      format: {
        type: 'json_schema',
        name: 'artifact_scan_draft',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            localTitle: { type: 'string' },
            localTitleLanguage: { type: 'string' },
            englishTitle: { type: 'string' },
            knowledgeText: { type: 'string' },
            museumConfidence: { type: 'number' },
          },
          required: [
            'localTitle',
            'localTitleLanguage',
            'englishTitle',
            'knowledgeText',
            'museumConfidence',
          ],
        },
      },
    },
  });

  const text =
    typeof response.output_text === 'string' && response.output_text.trim()
      ? response.output_text.trim()
      : '';

  if (!text) throw new Error('OpenAI returned empty draft payload');

  const parsed = JSON.parse(text);

  recordApiCall({
    service: 'OpenAI',
    endpoint: 'responses.create',
    durationMs: Date.now() - start,
    status: 'success',
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    model,
  });

  return sanitizeDraft(parsed, rawText);
}

async function extractWithGemini(
  rawText: string,
  museumName: string
): Promise<ArtifactDraft> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const modelName =
    process.env.GEMINI_MODEL_ARTIFACT_SCAN || 'gemini-2.5-flash';
  const client = new GoogleGenerativeAI(apiKey);
  const prompt = buildDraftPrompt(rawText, museumName);
  await assertTextAllowedForLlm(prompt, 'artifact-scan-draft-google');
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: DRAFT_SCHEMA,
    },
    systemInstruction:
      'Return only valid JSON and stay grounded in plaque text. Use concise English for knowledgeText.',
  });

  const start = Date.now();
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = JSON.parse(raw);

  recordApiCall({
    service: 'Gemini',
    endpoint: 'generateContent',
    durationMs: Date.now() - start,
    status: 'success',
    inputTokens: result.response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
    model: modelName,
  });

  return sanitizeDraft(parsed, rawText);
}

export async function extractArtifactDraft(
  rawText: string,
  museumName: string
): Promise<ArtifactDraft> {
  const provider = (process.env.SCAN_LLM_PROVIDER || 'openai').toLowerCase();

  if (provider === 'google' || provider === 'gemini') {
    return extractWithGemini(rawText, museumName);
  }

  return extractWithOpenAI(rawText, museumName);
}
