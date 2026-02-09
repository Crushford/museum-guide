export interface LlmGenerateRequest {
  prompt: string;
  systemInstruction?: string;
}

export interface LlmGenerateResult {
  text: string;
  isAdultContent?: boolean;
  sensitiveTopics?: string[];
  subjectTags?: string[];
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

export const TAGGING_INSTRUCTIONS = `Tagging rules:

"isAdultContent" should be true if the narration contains explicit sexual content, detailed sexual descriptions, graphic violence, hate speech, or other material inappropriate for minors.

"sensitiveTopics" is for content warnings and safety filtering.
- Only include tags that relate to safety or maturity.
- Examples: "nudity", "sexual-content", "graphic-violence", "hate-speech", "self-harm", "war", "genocide".
- If nothing sensitive applies, return an empty array.

"subjectTags" is for educational classification and discovery.
- Describe historical, cultural, scientific, or thematic subjects.
- Keep tags short (1–3 words), lowercase, hyphenated if needed.
- Examples: "roman", "ancient-history", "evolutionary-biology", "archaeology", "greek-mythology", "egypt", "world-war-ii", "religion", "colonialism", "natural-history".
- Include 2–6 relevant tags when possible.
- Do not include safety terms here.

If unsure, prefer fewer tags over guessing.`;
