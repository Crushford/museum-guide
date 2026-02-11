export interface LlmGenerateRequest {
  prompt: string;
  systemInstruction?: string;
}

export interface LlmGenerateResult {
  text: string;
  isAdultContent?: boolean;
  sensitiveTopics?: string[];
  subjectTags?: string[];
  suggestedQuestions?: string[];
  apiCallId?: number | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  durationMs: number;
}

export interface LlmProvider {
  readonly name: string;
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResult>;
}

export const ALLOWED_SENSITIVE_TOPICS = [
  'adult-content',
  'nudity',
  'sexual-content',
  'graphic-violence',
  'war',
  'genocide',
  'self-harm',
  'hate-speech',
] as const;

export const ALLOWED_SUBJECT_TAGS = [
  'portraiture',
  'biography',
  'leadership',
  'ancient-history',
  'medieval-history',
  'modern-history',
  'religion',
  'mythology',
  'politics',
  'warfare',
  'science',
  'technology',
  'archaeology',
  'material-culture',
  'trade',
  'colonialism',
  'migration',
  'empire',
  'daily-life',
  'art-technique',
  'symbolism',
] as const;

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

export function sanitizeSensitiveTopics(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const allowed = new Set<string>(ALLOWED_SENSITIVE_TOPICS);
  return [
    ...new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map(normalizeTag)
        .filter((tag) => allowed.has(tag))
    ),
  ];
}

export function sanitizeSubjectTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const allowed = new Set<string>(ALLOWED_SUBJECT_TAGS);
  return [
    ...new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map(normalizeTag)
        .filter((tag) => allowed.has(tag))
    ),
  ];
}

export const TAGGING_INSTRUCTIONS = `Tagging rules:

"isAdultContent" should be true if the narration contains explicit sexual content, detailed sexual descriptions, graphic violence, hate speech, or other material inappropriate for minors.

"sensitiveTopics" is for content warnings and safety filtering.
- Only include tags from this list: ${ALLOWED_SENSITIVE_TOPICS.join(', ')}.
- If nothing sensitive applies, return an empty array.

"subjectTags" is for educational classification and discovery.
- Use only this list: ${ALLOWED_SUBJECT_TAGS.join(', ')}.
- Include 2-5 relevant tags when possible.
- Do not include safety terms here.

"suggestedQuestions" should provide 3-5 short, visitor-friendly prompt ideas.
- Keep each suggestion to 1 sentence and <= 140 characters.
- Write suggestions as interesting prompts a visitor might tap.

If unsure, prefer fewer tags over guessing.`;
