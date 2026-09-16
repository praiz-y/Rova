import type { Request, Response, NextFunction } from 'express'
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from '../auth/session.js'

export interface AuthenticatedRequest extends Request {
  session: SessionPayload
}

export interface SessionRequest extends Request {
  session?: SessionPayload
}

/** Populate a valid session when present without rejecting public requests. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  const session = typeof token === 'string' ? verifySessionToken(token) : null
  if (session) (req as SessionRequest).session = session
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  const session = typeof token === 'string' ? verifySessionToken(token) : null
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  ;(req as AuthenticatedRequest).session = session
  next()
}
