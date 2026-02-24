import * as Sentry from '@sentry/nextjs';
import { ApiRequestError } from './api-errors';

// Expected control-flow errors — suppress from Sentry Issues to avoid noise
const SUPPRESSED_CODES = new Set([
  'AUTH_REQUIRED',
  'RATE_LIMIT_AUTH',
  'LIMIT_GLOBAL_DAILY',
  'LIMIT_USER_DAILY',
  'SIGNUP_WAITLIST',
]);

export type ReportErrorOptions = {
  message: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: Sentry.SeverityLevel;
  fingerprint?: string[];
  suppressHttpStatuses?: number[];
};

export function reportError(error: unknown, options: ReportErrorOptions): void {
  if (error instanceof ApiRequestError) {
    const code = error.body?.code;
    if (code && SUPPRESSED_CODES.has(code)) {
      return;
    }
    if (options.suppressHttpStatuses?.includes(error.status)) {
      return;
    }
  }

  const normalizedError =
    error instanceof Error
      ? error
      : typeof error === 'string'
        ? new Error(error)
        : new Error(options.message);

  Sentry.withScope((scope) => {
    scope.setLevel(options.level ?? 'error');
    scope.setExtra('summary', options.message);

    if (options.tags) {
      for (const [key, value] of Object.entries(options.tags)) {
        scope.setTag(key, value);
      }
    }

    if (options.extra) {
      for (const [key, value] of Object.entries(options.extra)) {
        scope.setExtra(key, value);
      }
    }

    if (error instanceof ApiRequestError) {
      scope.setTag('api.status', String(error.status));
      if (error.body?.code) {
        scope.setTag('api.code', error.body.code);
      }
    }

    if (!(error instanceof Error) && error !== undefined) {
      scope.setExtra('rawError', error);
    }

    if (options.fingerprint) {
      scope.setFingerprint(options.fingerprint);
    }

    Sentry.captureException(normalizedError);
  });
}
