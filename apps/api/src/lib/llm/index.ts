import { GoogleLlmProvider } from './google';
import { OpenAILlmProvider } from './openai';
import type { LlmProvider } from './types';
import { env } from '../../config/env';

export type {
  LlmProvider,
  LlmGenerateRequest,
  LlmGenerateResult,
} from './types';

export function createProvider(name: 'google' | 'openai'): LlmProvider {
  switch (name) {
    case 'google': {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
      return new GoogleLlmProvider(apiKey);
    }
    case 'openai': {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
      return new OpenAILlmProvider(apiKey);
    }
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}
