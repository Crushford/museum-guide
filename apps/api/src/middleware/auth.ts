import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin';
import { sendBlocked } from '../lib/usage-limits';
import { recordApiCall } from '../lib/telemetry/api-call-tracker';

export type Actor = {
  uid: string;
  email?: string;
  displayName?: string;
  isAdmin: boolean;
};

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.actor) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    sendBlocked(
      res,
      401,
      'AUTH_REQUIRED',
      'Sign in required for this action.'
    );
    return;
  }

  const token = authHeader.slice(7);
  const startedAt = Date.now();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    recordApiCall({
      service: 'FirebaseAuth',
      endpoint: 'verifyIdToken',
      durationMs: Date.now() - startedAt,
      status: 'success',
      metadata: { userUid: decoded.uid },
    });
    req.actor = {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
      isAdmin: decoded.admin === true,
    };
    next();
  } catch (error) {
    recordApiCall({
      service: 'FirebaseAuth',
      endpoint: 'verifyIdToken',
      durationMs: Date.now() - startedAt,
      status: 'error',
      metadata: { authHeaderPresent: true },
      error: error instanceof Error ? error.message : String(error),
    });
    sendBlocked(res, 401, 'AUTH_REQUIRED', 'Invalid or expired token.');
  }
}

export async function attachActorIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const startedAt = Date.now();
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    recordApiCall({
      service: 'FirebaseAuth',
      endpoint: 'verifyIdToken',
      durationMs: Date.now() - startedAt,
      status: 'success',
      metadata: { userUid: decoded.uid },
    });
    req.actor = {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
      isAdmin: decoded.admin === true,
    };
  } catch (error) {
    recordApiCall({
      service: 'FirebaseAuth',
      endpoint: 'verifyIdToken',
      durationMs: Date.now() - startedAt,
      status: 'error',
      metadata: { authHeaderPresent: true },
      error: error instanceof Error ? error.message : String(error),
    });
    req.actor = undefined;
  }

  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.actor?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
