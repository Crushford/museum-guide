import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { writeFile } from 'fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'path';
import { recordApiCall } from './telemetry/api-call-tracker';

export type TtsProviderName = 'google-tts' | 'inworld';

const DEFAULT_TTS_PROVIDER: TtsProviderName = 'inworld';
const INWORLD_MODEL_ID = 'inworld-tts-1.5-mini';
const INWORLD_VOICE_ID = 'Craig';
const INWORLD_MAX_TEXT_CHARS = 2000;

export type AudioGenerationOptions = {
  text: string;
  voiceName?: string;
  languageCode?: string;
  outputDir?: string;
  fileName?: string;
  provider?: TtsProviderName;
};

export type AudioGenerationResult = {
  audioUrl: string;
  filePath: string;
  fileSize: number;
  duration: number;
};

function saveAudioFile(params: {
  audioBuffer: Buffer;
  outputDir?: string;
  fileName?: string;
  startTime: number;
}): AudioGenerationResult {
  const finalOutputDir =
    params.outputDir || resolve(__dirname, '../../public/audio');
  const finalFileName = params.fileName || `audio-${Date.now()}.mp3`;
  const filePath = resolve(finalOutputDir, finalFileName);
  const duration = Date.now() - params.startTime;
  const audioUrl = `/audio/${finalFileName}`;

  return {
    audioUrl,
    filePath,
    fileSize: params.audioBuffer.length,
    duration,
  };
}

export function parseTtsProvider(
  value: unknown,
  fallback: TtsProviderName = DEFAULT_TTS_PROVIDER
): TtsProviderName {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (
    normalized === 'google' ||
    normalized === 'google-tts' ||
    normalized === 'gcp'
  ) {
    return 'google-tts';
  }
  if (
    normalized === 'inworld' ||
    normalized === 'inworld-ai' ||
    normalized === 'inworld.ai'
  ) {
    return 'inworld';
  }
  return fallback;
}

export function getDefaultTtsProvider(): TtsProviderName {
  return parseTtsProvider(process.env.SCAN_TTS_PROVIDER, DEFAULT_TTS_PROVIDER);
}

async function generateAudioWithGoogle(
  options: AudioGenerationOptions
): Promise<AudioGenerationResult> {
  const {
    text,
    voiceName = 'en-AU-Standard-B',
    languageCode = 'en-AU',
    outputDir,
    fileName,
  } = options;
  const startTime = Date.now();

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const defaultCredentialsPath = homeDir
    ? `${homeDir}/.config/gcloud/application_default_credentials.json`
    : null;

  console.log('[Audio Generation] Credential detection:', {
    hasEnvVar: !!credentialsPath,
    envVarPath: credentialsPath || 'not set',
    defaultPath: defaultCredentialsPath,
    defaultPathExists: defaultCredentialsPath
      ? existsSync(defaultCredentialsPath)
      : false,
  });

  const client = new TextToSpeechClient();
  const request = {
    input: { text },
    voice: {
      name: voiceName,
      languageCode,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      sampleRateHertz: 24000,
    },
  };

  const ttsStart = Date.now();
  let response;
  try {
    [response] = await client.synthesizeSpeech(request);
    recordApiCall({
      service: 'Google TTS',
      endpoint: 'synthesizeSpeech',
      durationMs: Date.now() - ttsStart,
      status: 'success',
      metadata: { textLength: text.length, voiceName, provider: 'google-tts' },
    });
  } catch (error) {
    recordApiCall({
      service: 'Google TTS',
      endpoint: 'synthesizeSpeech',
      durationMs: Date.now() - ttsStart,
      status: 'error',
      metadata: { textLength: text.length, voiceName, provider: 'google-tts' },
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error) {
      if (
        error.message.includes('Could not load the default credentials') ||
        error.message.includes('authentication') ||
        error.message.includes('credentials')
      ) {
        throw new Error(
          `Google Cloud authentication failed: ${error.message}\n\n` +
            `Make sure you have authenticated with: gcloud auth application-default login\n` +
            `Or set GOOGLE_APPLICATION_CREDENTIALS to your service account key file path.`
        );
      }
      throw error;
    }
    throw error;
  }

  if (!response.audioContent) {
    throw new Error('No audio content returned from Google Cloud TTS');
  }

  const audioBuffer = Buffer.from(response.audioContent);
  const saved = saveAudioFile({ audioBuffer, outputDir, fileName, startTime });
  await writeFile(saved.filePath, audioBuffer);
  return saved;
}

function getInworldBasicCredential(): string | null {
  const direct = process.env.INWORLD_TTS_BASIC_AUTH?.trim();
  if (direct) return direct.replace(/^Basic\s+/i, '').trim();
  const runtime = process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL?.trim();
  if (runtime) return runtime.replace(/^Basic\s+/i, '').trim();
  return null;
}

async function generateAudioWithInworld(
  options: AudioGenerationOptions
): Promise<AudioGenerationResult> {
  const { text, outputDir, fileName } = options;
  const startTime = Date.now();
  const credential = getInworldBasicCredential();
  if (!credential) {
    throw new Error(
      'INWORLD_TTS_BASIC_AUTH (or INWORLD_RUNTIME_BASE64_CREDENTIAL) not configured'
    );
  }

  const modelId = INWORLD_MODEL_ID;
  const voiceId = INWORLD_VOICE_ID;
  const truncatedText =
    text.length > INWORLD_MAX_TEXT_CHARS
      ? text.slice(0, INWORLD_MAX_TEXT_CHARS)
      : text;
  const wasTruncated = truncatedText.length !== text.length;
  if (wasTruncated) {
    console.warn('[Inworld TTS] Input text truncated', {
      originalLength: text.length,
      truncatedLength: truncatedText.length,
      limit: INWORLD_MAX_TEXT_CHARS,
      modelId,
      voiceId,
    });
  }

  const endpoint = 'https://api.inworld.ai/tts/v1/voice';
  console.log('[Inworld TTS] Starting request', {
    endpoint,
    textLength: truncatedText.length,
    originalTextLength: text.length,
    wasTruncated,
    modelId,
    voiceId,
    hasCredential: Boolean(credential),
  });
  const reqStart = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credential}`,
    },
    body: JSON.stringify({
      text: truncatedText,
      voiceId,
      modelId,
      audioConfig: {
        audioEncoding: 'MP3',
        sampleRateHertz: 24000,
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    console.error('[Inworld TTS] Request failed', {
      status: response.status,
      durationMs: Date.now() - reqStart,
      bodyPreview: payload.slice(0, 500),
      modelId,
      voiceId,
    });
    recordApiCall({
      service: 'Inworld TTS',
      endpoint: '/tts/v1/voice',
      durationMs: Date.now() - reqStart,
      status: 'error',
      statusCode: response.status,
      error: payload || `Inworld TTS failed (${response.status})`,
      metadata: {
        textLength: truncatedText.length,
        originalTextLength: text.length,
        wasTruncated,
        voiceId,
        modelId,
        provider: 'inworld',
      },
    });
    throw new Error(
      `Inworld TTS request failed (${response.status}). ${payload || 'Check Inworld credentials and model/voice IDs.'}`
    );
  }

  const payload = (await response.json()) as {
    audioContent?: string;
    usage?: { processedCharactersCount?: number; modelId?: string };
    message?: string;
  };

  console.log('[Inworld TTS] Response received', {
    status: response.status,
    durationMs: Date.now() - reqStart,
    hasAudioContent: Boolean(payload.audioContent),
    textLength: truncatedText.length,
    originalTextLength: text.length,
    wasTruncated,
    processedCharactersCount: payload.usage?.processedCharactersCount ?? null,
    responseModelId: payload.usage?.modelId ?? null,
    modelId,
    voiceId,
  });

  if (!payload.audioContent) {
    console.error('[Inworld TTS] Missing audio content', {
      message: payload.message ?? null,
      modelId,
      voiceId,
    });
    throw new Error(
      payload.message || 'Inworld TTS did not return audioContent'
    );
  }

  const audioBuffer = Buffer.from(payload.audioContent, 'base64');
  const saved = saveAudioFile({ audioBuffer, outputDir, fileName, startTime });
  await writeFile(saved.filePath, audioBuffer);

  recordApiCall({
    service: 'Inworld TTS',
    endpoint: '/tts/v1/voice',
    durationMs: Date.now() - reqStart,
    status: 'success',
    statusCode: response.status,
    metadata: {
      textLength: truncatedText.length,
      originalTextLength: text.length,
      wasTruncated,
      voiceId,
      modelId: payload.usage?.modelId || modelId,
      processedCharactersCount: payload.usage?.processedCharactersCount ?? null,
      provider: 'inworld',
    },
  });

  return saved;
}

export async function generateAudio(
  options: AudioGenerationOptions
): Promise<AudioGenerationResult> {
  const provider = parseTtsProvider(options.provider, getDefaultTtsProvider());
  if (provider === 'google-tts') {
    return generateAudioWithGoogle({ ...options, provider });
  }
  return generateAudioWithInworld({ ...options, provider });
}

export async function generateAudioForContent(
  contentId: number,
  text: string,
  options?: Omit<AudioGenerationOptions, 'text' | 'fileName'>
): Promise<string> {
  const result = await generateAudio({
    text,
    fileName: `content-${contentId}.mp3`,
    ...options,
  });
  return result.audioUrl;
}

export async function generateAudioForArtifactQuestion(
  questionId: number,
  text: string,
  options?: Omit<AudioGenerationOptions, 'text' | 'fileName'>
): Promise<string> {
  const result = await generateAudio({
    text,
    fileName: `artifact-question-${questionId}.mp3`,
    ...options,
  });
  return result.audioUrl;
}
