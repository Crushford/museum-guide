import { GoogleAuth } from 'google-auth-library';
import type { OcrProviderName, OcrResult } from '@repo/types';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../../config/env';
import { recordApiCall } from '../telemetry/api-call-tracker';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const VISION_OCR_COST_USD = 0.02457252;
const DEFAULT_OCR_PROVIDER: OcrProviderName = 'ocr-space';

export interface DecodedImage {
  buffer: Buffer;
  mimeType: string;
}

export function decodeBase64Image(imageBase64: string): DecodedImage {
  const trimmed = imageBase64.trim();
  const dataUrlMatch = trimmed.match(/^data:(.+);base64,(.+)$/);

  const mimeType = dataUrlMatch?.[1] ?? 'image/jpeg';
  const payload = dataUrlMatch?.[2] ?? trimmed;

  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length) {
    throw new Error('Image payload was empty');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit`);
  }

  return { buffer, mimeType };
}

function resolveQuotaProjectFromAdc(): string | null {
  const envQuota = env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim();
  if (envQuota) return envQuota;

  const cloudSdkConfigDir =
    process.env.CLOUDSDK_CONFIG ||
    (process.env.HOME ? join(process.env.HOME, '.config', 'gcloud') : null);
  if (!cloudSdkConfigDir) return null;

  const adcPath = join(
    cloudSdkConfigDir,
    'application_default_credentials.json'
  );
  if (!existsSync(adcPath)) return null;

  try {
    const raw = readFileSync(adcPath, 'utf8');
    const parsed = JSON.parse(raw) as { quota_project_id?: string };
    return parsed.quota_project_id?.trim() || null;
  } catch {
    return null;
  }
}

export function parseOcrProvider(
  value: unknown,
  fallback: OcrProviderName = DEFAULT_OCR_PROVIDER
): OcrProviderName {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (
    normalized === 'google' ||
    normalized === 'google-vision' ||
    normalized === 'vision'
  ) {
    return 'google-vision';
  }
  if (
    normalized === 'ocr-space' ||
    normalized === 'ocrspace' ||
    normalized === 'ocr_space'
  ) {
    return 'ocr-space';
  }
  return fallback;
}

export function getDefaultOcrProvider(): OcrProviderName {
  return parseOcrProvider(env.SCAN_OCR_PROVIDER, DEFAULT_OCR_PROVIDER);
}

async function extractWithGoogleVision(
  imageBase64: string
): Promise<OcrResult> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const accessToken = await auth.getAccessToken();
  if (!accessToken) {
    throw new Error(
      'Google Cloud authentication failed for Vision API. Run: gcloud auth application-default login'
    );
  }

  const { buffer } = decodeBase64Image(imageBase64);
  const base64Content = buffer.toString('base64');
  const endpoint = 'https://vision.googleapis.com/v1/images:annotate';
  const quotaProject = resolveQuotaProjectFromAdc();
  const usdToEurRate = env.USD_TO_EUR_RATE;
  const visionCostEur = Number.isFinite(usdToEurRate)
    ? VISION_OCR_COST_USD * usdToEurRate
    : undefined;
  const start = Date.now();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(quotaProject ? { 'x-goog-user-project': quotaProject } : {}),
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Content },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  });

  if (!response.ok) {
    recordApiCall({
      service: 'Google Vision',
      endpoint: 'images:annotate',
      durationMs: Date.now() - start,
      status: 'error',
      statusCode: response.status,
      error: `OCR failed (${response.status})`,
      metadata: {
        costUsd: VISION_OCR_COST_USD,
        usdToEurRate: Number.isFinite(usdToEurRate) ? usdToEurRate : null,
      },
    });
    const payload = await response.text().catch(() => '');
    throw new Error(
      `OCR request failed (${response.status}). ${payload || 'Ensure Vision API is enabled and ADC is configured.'}${quotaProject ? '' : ' Quota project not found in ADC; run: gcloud auth application-default set-quota-project <PROJECT_ID>'}`
    );
  }

  const payload = await response.json();
  const result = payload?.responses?.[0];

  if (!result || result.error) {
    const message = result?.error?.message || 'OCR did not return a result';
    throw new Error(message);
  }

  const fullText: string = result.fullTextAnnotation?.text ?? '';
  const pages = result.fullTextAnnotation?.pages ?? [];
  const blocks: Array<{
    text: string;
    confidence?: number;
    boundingPoly?: unknown;
  }> = pages.flatMap((page: any) =>
    (page.blocks ?? []).map((block: any) => ({
      text: (block.paragraphs ?? [])
        .flatMap((p: any) =>
          (p.words ?? []).map((w: any) =>
            (w.symbols ?? []).map((s: any) => s.text).join('')
          )
        )
        .join(' ')
        .trim(),
      confidence:
        typeof block.confidence === 'number' ? block.confidence : undefined,
      boundingPoly: block.boundingBox ?? undefined,
    }))
  );

  const confidenceValues = blocks
    .map((block: { confidence?: number }) => block.confidence)
    .filter(
      (value: number | undefined): value is number => typeof value === 'number'
    );

  const averageConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce(
          (acc: number, value: number) => acc + value,
          0
        ) / confidenceValues.length
      : null;

  const languageHints = pages
    .flatMap((page: any) => page.property?.detectedLanguages ?? [])
    .map((lang: any) => lang.languageCode)
    .filter((lang: unknown): lang is string => typeof lang === 'string');

  recordApiCall({
    service: 'Google Vision',
    endpoint: 'images:annotate',
    durationMs: Date.now() - start,
    status: 'success',
    statusCode: response.status,
    costEur: visionCostEur,
    metadata: {
      textLength: fullText.length,
      blockCount: blocks.length,
      costUsd: VISION_OCR_COST_USD,
      usdToEurRate: Number.isFinite(usdToEurRate) ? usdToEurRate : null,
    },
  });

  return {
    rawText: fullText.trim(),
    languageHints: Array.from(new Set(languageHints)),
    confidence: averageConfidence,
    blocks: blocks.filter((block: { text: string }) => block.text.length > 0),
    provider: 'google-vision',
  };
}

interface OcrSpaceWord {
  WordText?: string;
  Left?: number;
  Top?: number;
  Height?: number;
  Width?: number;
  Confidence?: number;
}

interface OcrSpaceLine {
  LineText?: string;
  Words?: OcrSpaceWord[];
}

interface OcrSpaceParsedResult {
  ParsedText?: string;
  TextOverlay?: {
    Lines?: OcrSpaceLine[];
  };
}

interface OcrSpacePayload {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ParsedResults?: OcrSpaceParsedResult[];
}

function normalizeOcrSpaceErrorMessage(
  message: string | string[] | undefined
): string {
  if (Array.isArray(message)) {
    return message.filter((item) => typeof item === 'string').join('; ');
  }
  return typeof message === 'string' ? message : 'OCR.space processing failed';
}

async function extractWithOcrSpace(imageBase64: string): Promise<OcrResult> {
  const apiKey = env.OCR_SPACE_API_KEY?.trim();
  if (!apiKey) throw new Error('OCR_SPACE_API_KEY not configured');

  const endpoint = 'https://api.ocr.space/parse/image';
  const { buffer, mimeType } = decodeBase64Image(imageBase64);
  const start = Date.now();

  const language = env.OCR_SPACE_LANGUAGE?.trim() || 'eng';
  const engine = env.OCR_SPACE_ENGINE?.trim() || '2';
  const base64Content = `data:${mimeType};base64,${buffer.toString('base64')}`;
  const form = new URLSearchParams();
  form.set('base64Image', base64Content);
  form.set('language', language);
  form.set('isOverlayRequired', 'true');
  form.set('OCREngine', engine);
  form.set('scale', 'true');

  const usdToEurRate = env.USD_TO_EUR_RATE;
  const ocrSpaceCostUsd = env.OCR_SPACE_OCR_COST_USD;
  const ocrSpaceCostEur =
    Number.isFinite(usdToEurRate) && Number.isFinite(ocrSpaceCostUsd)
      ? ocrSpaceCostUsd * usdToEurRate
      : undefined;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apikey: apiKey,
    },
    body: form.toString(),
  });

  if (!response.ok) {
    recordApiCall({
      service: 'OCR.space',
      endpoint: 'parse/image',
      durationMs: Date.now() - start,
      status: 'error',
      statusCode: response.status,
      error: `OCR failed (${response.status})`,
      metadata: {
        language,
        ocrEngine: engine,
        costUsd: Number.isFinite(ocrSpaceCostUsd) ? ocrSpaceCostUsd : null,
        usdToEurRate: Number.isFinite(usdToEurRate) ? usdToEurRate : null,
      },
    });
    const payload = await response.text().catch(() => '');
    throw new Error(
      `OCR.space request failed (${response.status}). ${payload}`
    );
  }

  const payload = (await response.json()) as OcrSpacePayload;

  if (payload.IsErroredOnProcessing) {
    const message = normalizeOcrSpaceErrorMessage(payload.ErrorMessage);
    recordApiCall({
      service: 'OCR.space',
      endpoint: 'parse/image',
      durationMs: Date.now() - start,
      status: 'error',
      statusCode: response.status,
      error: message,
      metadata: {
        language,
        ocrEngine: engine,
      },
    });
    throw new Error(message);
  }

  const parsedResults = Array.isArray(payload.ParsedResults)
    ? payload.ParsedResults
    : [];
  const fullText = parsedResults
    .map((result) =>
      typeof result.ParsedText === 'string' ? result.ParsedText : ''
    )
    .join('\n')
    .trim();

  if (!fullText) {
    throw new Error('OCR.space did not return any text');
  }

  const blocks = parsedResults.flatMap((result) => {
    const lines = Array.isArray(result.TextOverlay?.Lines)
      ? result.TextOverlay.Lines
      : [];

    return lines
      .map((line) => {
        const words = Array.isArray(line.Words) ? line.Words : [];
        const textFromLine =
          typeof line.LineText === 'string' && line.LineText.trim()
            ? line.LineText
            : words
                .map((word) =>
                  typeof word.WordText === 'string' ? word.WordText : ''
                )
                .join(' ')
                .trim();

        const confidenceValues = words
          .map((word) =>
            typeof word.Confidence === 'number' ? word.Confidence : null
          )
          .filter((value): value is number => value !== null);

        const lineConfidence =
          confidenceValues.length > 0
            ? confidenceValues.reduce((sum, value) => sum + value, 0) /
              confidenceValues.length
            : undefined;

        const firstWordWithBounds = words.find(
          (word) =>
            typeof word.Left === 'number' &&
            typeof word.Top === 'number' &&
            typeof word.Width === 'number' &&
            typeof word.Height === 'number'
        );

        return {
          text: textFromLine.trim(),
          confidence: lineConfidence,
          boundingPoly: firstWordWithBounds
            ? {
                left: firstWordWithBounds.Left,
                top: firstWordWithBounds.Top,
                width: firstWordWithBounds.Width,
                height: firstWordWithBounds.Height,
              }
            : undefined,
        };
      })
      .filter((line) => line.text.length > 0);
  });

  const confidenceValues = blocks
    .map((block) =>
      typeof block.confidence === 'number' ? block.confidence : null
    )
    .filter((value): value is number => value !== null);

  const averageConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) /
        confidenceValues.length
      : null;

  recordApiCall({
    service: 'OCR.space',
    endpoint: 'parse/image',
    durationMs: Date.now() - start,
    status: 'success',
    statusCode: response.status,
    costEur: ocrSpaceCostEur,
    metadata: {
      textLength: fullText.length,
      blockCount: blocks.length,
      language,
      ocrEngine: engine,
      costUsd: Number.isFinite(ocrSpaceCostUsd) ? ocrSpaceCostUsd : null,
      usdToEurRate: Number.isFinite(usdToEurRate) ? usdToEurRate : null,
    },
  });

  return {
    rawText: fullText,
    languageHints: [language],
    confidence: averageConfidence,
    blocks,
    provider: 'ocr-space',
  };
}

export async function extractTextFromImage(
  imageBase64: string,
  providerName: OcrProviderName = getDefaultOcrProvider()
): Promise<OcrResult> {
  if (providerName === 'google-vision') {
    return extractWithGoogleVision(imageBase64);
  }
  return extractWithOcrSpace(imageBase64);
}
