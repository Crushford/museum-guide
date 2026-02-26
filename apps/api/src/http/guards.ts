import type { Request } from 'express';
import createHttpError from 'http-errors';
import type { Actor } from '../middleware/auth';

export function requireActor(req: Request): Actor {
  if (!req.actor) {
    throw createHttpError(401, 'Not authenticated');
  }
  return req.actor;
}
