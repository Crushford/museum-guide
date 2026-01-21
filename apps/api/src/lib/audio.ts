import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';

export type AudioGenerationOptions = {
  text: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?:
    | 'mp3_44100_128'
    | 'mp3_22050_32'
    | 'pcm_16000'
    | 'pcm_22050'
    | 'pcm_24000'
    | 'pcm_44100'
    | 'ulaw_8000';
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
 * Generate audio from text using ElevenLabs API
 * @param options Audio generation options
 * @returns Audio file URL and metadata
 */
export async function generateAudio(
  options: AudioGenerationOptions
): Promise<AudioGenerationResult> {
  const {
    text,
    voiceId = 'JBFqnCBsd6RMkjVDRZzb', // Default voice from ElevenLabs docs
    modelId = 'eleven_multilingual_v2',
    outputFormat = 'mp3_44100_128',
    outputDir,
    fileName,
  } = options;

  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsApiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const startTime = Date.now();
  const elevenlabs = new ElevenLabsClient({
    apiKey: elevenLabsApiKey,
  });

  console.log('[Audio Generation] Calling ElevenLabs API...', {
    voiceId,
    modelId,
    outputFormat,
    textLength: text.length,
  });

  // Generate audio
  const audio = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId,
    outputFormat,
  });

  // Convert audio stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }
  const audioBuffer = Buffer.concat(chunks);

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
