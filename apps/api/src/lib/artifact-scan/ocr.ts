import { GoogleAuth } from 'google-auth-library';
import type { OcrResult } from '@repo/types';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordApiCall } from '../telemetry/api-call-tracker';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const VISION_OCR_COST_USD = 0.02457252;

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
  const envQuota = process.env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim();
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

export async function extractTextFromImage(
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
  const usdToEurRate = Number(process.env.USD_TO_EUR_RATE || '0.92');
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
