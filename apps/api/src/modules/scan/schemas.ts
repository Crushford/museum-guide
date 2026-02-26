import { z } from 'zod';

export const scanOcrBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      imageBase64: z
        .string({ error: 'imageBase64 is required' })
        .min(1, { error: 'imageBase64 is required' }),
      provider: z.unknown().optional(),
    })
  )
  .transform((value) => value);

export const scanRawTextBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z
      .object({
        rawText: z.string({ error: 'rawText is required' }),
      })
      .superRefine((value, ctx) => {
        if (!value.rawText.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rawText'],
            message: 'rawText is required',
          });
        }
      })
  )
  .transform((value) => ({
    rawText: value.rawText,
    trimmedRawText: value.rawText.trim(),
  }));

export const scanDuplicatesDraftBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      draft: z.record(z.string(), z.unknown()),
    })
  )
  .transform((value) => value);

export const scanCreateBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z.object({
    imageBase64: z.unknown().optional(),
    rawText: z.unknown().optional(),
    draft: z.record(z.string(), z.unknown()).nullish(),
    ocr: z.record(z.string(), z.unknown()).nullish(),
    enrichment: z.record(z.string(), z.unknown()).nullish(),
  })
);
