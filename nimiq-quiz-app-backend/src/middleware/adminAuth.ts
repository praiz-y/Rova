// src/middleware/adminAuth.ts
import { Request, Response, NextFunction } from 'express';
import { verifySessionToken, SESSION_COOKIE_NAME, type SessionPayload } from '../auth/session.js';

/**
 * Middleware that requires a valid session token **and** the `role` claim to be "admin".
 * Assumes the JWT payload follows the `SessionPayload` interface and may contain a `role` field.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const session = typeof token === 'string' ? verifySessionToken(token) : null;
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  // The role claim might be optional for regular users; admin requires explicit 'admin'.
  const role = (session as any).role;
  if (role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  // Attach the validated session to request for downstream handlers.
  (req as any).session = session;
  next();
}

export interface AdminAuthenticatedRequest extends Request {
  session: SessionPayload & { role: string };
}
