import { z } from 'zod';

export const contentCreateBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z
    .object({
      text: z.unknown().optional(),
      type: z.unknown().optional(),
      museumId: z.unknown().optional(),
      roomId: z.unknown().optional(),
      artifactId: z.unknown().optional(),
      llmProvider: z.unknown().optional(),
      model: z.unknown().optional(),
      prompt: z.unknown().optional(),
    })
    .superRefine((value, ctx) => {
      if (typeof value.text !== 'string' || !value.text) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['text'],
          message: 'text is required',
        });
      }

      const parentCount =
        Number(Boolean(value.museumId)) +
        Number(Boolean(value.roomId)) +
        Number(Boolean(value.artifactId));
      if (parentCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Exactly one of museumId, roomId, or artifactId must be provided',
        });
      }
    })
    .transform((value) => {
      const museumId = Number(value.museumId);
      const roomId = Number(value.roomId);
      const artifactId = Number(value.artifactId);

      return {
        text: value.text as string,
        type: typeof value.type === 'string' ? value.type : undefined,
        museumId: Number.isFinite(museumId) ? museumId : undefined,
        roomId: Number.isFinite(roomId) ? roomId : undefined,
        artifactId: Number.isFinite(artifactId) ? artifactId : undefined,
        llmProvider:
          typeof value.llmProvider === 'string' ? value.llmProvider : undefined,
        model: typeof value.model === 'string' ? value.model : undefined,
        prompt: typeof value.prompt === 'string' ? value.prompt : undefined,
      };
    })
);

export const ttsProviderBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      ttsProvider: z.unknown().optional(),
    })
  )
  .transform((value) => value);

export const wikipediaSummaryQuerySchema = z.object({
  url: z
    .string({ error: 'URL is required' })
    .min(1, { error: 'URL is required' }),
});
