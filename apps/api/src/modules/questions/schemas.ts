import { z } from 'zod';

export const questionAskParamsSchema = z.object({
  artifactId: z.coerce.number(),
});

export const questionAskBodySchema = z.preprocess(
  (value) => (value && typeof value === 'object' ? value : {}),
  z
    .object({
      question: z.unknown(),
      forceCreate: z.unknown().optional(),
      previewOnly: z.unknown().optional(),
      publishAnonymously: z.unknown().optional(),
      approvedQuestionText: z.unknown().optional(),
    })
    .superRefine((value, ctx) => {
      if (typeof value.question !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['question'],
          message: 'question is required',
        });
        return;
      }

      const questionText = value.question.trim();
      if (questionText.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['question'],
          message: 'Question is too short (minimum 8 characters).',
        });
        return;
      }
      if (questionText.length > 280) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['question'],
          message: 'Question is too long (maximum 280 characters).',
        });
      }
    })
    .transform((value) => {
      let approvedQuestionText: string | null = null;
      if (typeof value.approvedQuestionText === 'string') {
        const trimmed = value.approvedQuestionText.trim();
        if (trimmed.length > 0) {
          approvedQuestionText = trimmed;
        }
      }

      return {
        questionText: (value.question as string).trim(),
        forceCreate: value.forceCreate === true,
        previewOnly: value.previewOnly === true,
        publishAnonymously: value.publishAnonymously === true,
        approvedQuestionText,
      };
    })
);

export const questionsListQuerySchema = z
  .object({
    limit: z.preprocess((value) => {
      if (value === undefined || value === null) return 20;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 20 : parsed;
    }, z.number()),
    sort: z.enum(['top', 'new']).catch('top'),
  })
  .transform((value) => ({
    limit: Math.min(Math.max(value.limit || 20, 1), 100),
    sort: value.sort,
  }));

export const questionVoteBodySchema = z
  .object({ vote: z.enum(['up', 'down']) })
  .transform((value) => value);

export const questionListenBodySchema = z
  .preprocess(
    (value) => (value && typeof value === 'object' ? value : {}),
    z.object({
      durationSeconds: z.unknown().optional(),
      completed: z.unknown().optional(),
      sessionId: z.unknown().optional(),
      source: z.unknown().optional(),
    })
  )
  .transform((value) => {
    const durationSecondsRaw = Number(value.durationSeconds ?? 0);
    const durationSeconds =
      Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0
        ? durationSecondsRaw
        : 0;

    return {
      durationSeconds,
      completed: value.completed === true,
      sessionId: typeof value.sessionId === 'string' ? value.sessionId : null,
      source: typeof value.source === 'string' ? value.source : null,
    };
  });
