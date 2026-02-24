import createHttpError from 'http-errors';
import { type ZodType } from 'zod';

export function parseWithSchema<T>(
  schema: ZodType<T>,
  input: unknown,
  fallbackMessage?: string
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const message =
    fallbackMessage ?? parsed.error.issues[0]?.message ?? 'Invalid request';
  throw createHttpError(400, message);
}
