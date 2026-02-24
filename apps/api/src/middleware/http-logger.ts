import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

type RequestWithActor = Request & {
  actor?: {
    uid?: string;
    isAdmin?: boolean;
  };
};

function getHeaderValue(
  header: string | string[] | undefined
): string | undefined {
  if (Array.isArray(header)) {
    return header[0];
  }
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  return undefined;
}

function shouldSkipAutoRequestLog(req: Request): boolean {
  return req.path === '/health';
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const requestId =
      getHeaderValue(req.headers['x-request-id']) ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);
    return requestId;
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => shouldSkipAutoRequestLog(req as Request),
  },
  customProps: (req) => {
    const actor = (req as RequestWithActor).actor;
    return {
      actorUid: actor?.uid ?? null,
      actorIsAdmin: actor?.isAdmin ?? null,
    };
  },
});
