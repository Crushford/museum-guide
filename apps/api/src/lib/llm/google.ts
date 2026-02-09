import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from '@google/generative-ai';
import {
  TAGGING_INSTRUCTIONS,
  type LlmProvider,
  type LlmGenerateRequest,
  type LlmGenerateResult,
} from './types';

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    text: { type: SchemaType.STRING },
    isAdultContent: { type: SchemaType.BOOLEAN },
    sensitiveTopics: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    subjectTags: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ['text', 'isAdultContent', 'sensitiveTopics', 'subjectTags'],
};

export class GoogleLlmProvider implements LlmProvider {
  readonly name = 'google';
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName = 'gemini-2.5-flash') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
    const start = Date.now();

    const systemInstruction = [request.systemInstruction, TAGGING_INSTRUCTIONS]
      .filter(Boolean)
      .join('\n\n');

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemInstruction || undefined,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const result = await model.generateContent(request.prompt);
    const response = result.response;
    const raw = response.text();
    const durationMs = Date.now() - start;
    const usage = response.usageMetadata;

    let parsed: {
      text?: string;
      isAdultContent?: boolean;
      sensitiveTopics?: string[];
      subjectTags?: string[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // If JSON parsing fails, treat the entire response as plain text
      return {
        text: raw,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        model: this.modelName,
        provider: this.name,
        durationMs,
      };
    }

    return {
      text: parsed.text ?? raw,
      isAdultContent: parsed.isAdultContent ?? false,
      sensitiveTopics: parsed.sensitiveTopics ?? [],
      subjectTags: parsed.subjectTags ?? [],
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      model: this.modelName,
      provider: this.name,
      durationMs,
    };
  }
}
