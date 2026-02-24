import createHttpError from 'http-errors';
import { z, type ZodType } from 'zod';

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

export function parseRequiredNumber(value: unknown, message: string): number {
  const parsed = parseWithSchema(z.coerce.number(), value, message);
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, message);
  }
  return parsed;
}

export function parseOptionalNumberFilter(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = z.coerce.number().safeParse(value);
  if (
    !parsed.success ||
    !Number.isFinite(parsed.data) ||
    Number.isNaN(parsed.data)
  ) {
    return undefined;
  }
  return parsed.data;
}

export function parseOptionalString(value: unknown): string | undefined {
  const parsed = z.string().safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data;
}
