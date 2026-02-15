import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin';

export type Actor = {
  uid: string;
  email?: string;
  displayName?: string;
  isAdmin: boolean;
};

declare module 'express' {
  interface Request {
    actor?: Actor;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.actor = {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
      isAdmin: decoded.admin === true,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
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
