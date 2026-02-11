import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { writeFile } from 'fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'path';
import { recordApiCall } from './telemetry/api-call-tracker';

export type AudioGenerationOptions = {
  text: string;
  voiceName?: string;
  languageCode?: string;
  outputDir?: string;
  fileName?: string;
};

export type AudioGenerationResult = {
  audioUrl: string;
  filePath: string;
  fileSize: number;
  duration: number;
};

/**
 * Generate audio from text using Google Cloud Text-to-Speech API
 * @param options Audio generation options
 * @returns Audio file URL and metadata
 */
export async function generateAudio(
  options: AudioGenerationOptions
): Promise<AudioGenerationResult> {
  const {
    text,
    voiceName = 'en-AU-Standard-B', // Australian English, Standard voice B
    languageCode = 'en-AU',
    outputDir,
    fileName,
  } = options;

  const startTime = Date.now();

  // Initialize Google Cloud Text-to-Speech client
  // Uses GOOGLE_APPLICATION_CREDENTIALS env var or default application credentials
  // Default credentials are automatically detected from:
  // 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
  // 2. gcloud auth application-default login credentials
  // 3. Google Cloud environment (if running on GCP)

  // Log credential detection for debugging
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

  console.log('[Audio Generation] Initializing Google Cloud TTS client...', {
    hasCredentialsEnv: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    voiceName,
    languageCode,
    textLength: text.length,
  });

  // Construct the request
  const request = {
    input: { text },
    voice: {
      name: voiceName,
      languageCode: languageCode,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      sampleRateHertz: 24000,
    },
  };

  // Generate audio
  let response;
  const ttsStart = Date.now();
  try {
    [response] = await client.synthesizeSpeech(request);
    recordApiCall({
      service: 'Google TTS',
      endpoint: 'synthesizeSpeech',
      durationMs: Date.now() - ttsStart,
      status: 'success',
      metadata: { textLength: text.length, voiceName },
    });
  } catch (error) {
    recordApiCall({
      service: 'Google TTS',
      endpoint: 'synthesizeSpeech',
      durationMs: Date.now() - ttsStart,
      status: 'error',
      metadata: { textLength: text.length, voiceName },
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('[Audio Generation] Google Cloud TTS API error:', error);
    // Provide helpful error messages for common credential issues
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

  // Convert audio content to buffer
  const audioBuffer = Buffer.from(response.audioContent);

  // Determine output directory and filename
  const finalOutputDir = outputDir || resolve(__dirname, '../../public/audio');
  const finalFileName = fileName || `audio-${Date.now()}.mp3`;
  const filePath = resolve(finalOutputDir, finalFileName);

  // Save audio file
  await writeFile(filePath, audioBuffer);

  const duration = Date.now() - startTime;
  const audioUrl = `/audio/${finalFileName}`;

  console.log('[Audio Generation] Audio generated and saved:', {
    audioUrl,
    filePath,
    fileSize: `${(audioBuffer.length / 1024).toFixed(2)}KB`,
    duration: `${duration}ms`,
  });

  return {
    audioUrl,
    filePath,
    fileSize: audioBuffer.length,
    duration,
  };
}

/**
 * Generate audio for content and return the URL
 * This is a convenience wrapper that uses content ID for filename
 */
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
