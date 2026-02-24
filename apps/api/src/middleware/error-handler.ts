import type { ErrorRequestHandler, Request } from 'express';
import createHttpError from 'http-errors';
import { logger } from '../lib/logger';

type RequestWithLog = Request & {
  id?: string;
  log?: {
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  actor?: {
    uid?: string;
    isAdmin?: boolean;
  };
};

function getStatusCode(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  ) {
    return Math.trunc((error as { statusCode: number }).statusCode);
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return Math.trunc((error as { status: number }).status);
  }

  return 500;
}

function getMessage(error: unknown): string | undefined {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return undefined;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const request = req as RequestWithLog;
  const rawStatusCode = getStatusCode(error);
  const statusCode =
    Number.isFinite(rawStatusCode) &&
    rawStatusCode >= 400 &&
    rawStatusCode <= 599
      ? rawStatusCode
      : 500;

  const logBase = {
    requestId: request.id ?? null,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode,
    actorUid: request.actor?.uid ?? null,
    actorIsAdmin: request.actor?.isAdmin ?? null,
  };

  const reqLogger = request.log ?? logger;
  if (statusCode >= 500) {
    reqLogger.error({ ...logBase, err: error }, 'Unhandled request error');
  } else {
    reqLogger.warn(
      { ...logBase, error: getMessage(error) ?? 'Request failed' },
      'Request error'
    );
  }

  const isHttpError = createHttpError.isHttpError(error);
  const shouldExpose =
    statusCode < 500 ||
    (isHttpError &&
      typeof (error as { expose?: unknown }).expose === 'boolean' &&
      (error as { expose: boolean }).expose);

  const message = shouldExpose
    ? (getMessage(error) ?? 'Request failed')
    : 'Internal server error';

  res.status(statusCode).json({ error: message });
};
