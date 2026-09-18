import type { Request, Response, NextFunction } from 'express'
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from '../auth/session.js'

export interface AuthenticatedRequest extends Request {
  session: SessionPayload
}

export interface SessionRequest extends Request {
  session?: SessionPayload
}

/**
 * The session token, from either carrier, accepting whichever one verifies.
 *
 * The cookie is the original and is still issued — this is an addition, not a
 * replacement. But it cannot be the only carrier. The frontend (*.vercel.app)
 * and this API (*.up.railway.app) are different *sites*: both suffixes are on
 * the Public Suffix List. That is what forces SameSite=None; Secure in
 * session.ts, which desktop browsers accept and in-app webviews do not — iOS
 * WKWebView under ITP and Android WebView both drop third-party cookies
 * outright, and Nimiq Pay is a webview.
 *
 * The failure that produces is worth spelling out, because it does not look
 * like an auth problem: POST /api/auth/verify returns 200 and the wallet reads
 * as connected — the frontend takes the user out of the response *body*, not
 * the cookie — and then the very next request arrives bare and is rejected
 * here. On mobile that surfaced as "Not authenticated" the moment you tried to
 * save a username, while desktop worked perfectly.
 *
 * Both carriers are checked rather than one being preferred, because either
 * can be the stale one: a rotated SESSION_JWT_SECRET leaves a dead cookie
 * behind in the browser, and a logout that failed halfway leaves a dead bearer
 * token in localStorage.
 */
function readSession(req: Request): SessionPayload | null {
  const header = req.headers.authorization
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (bearer) {
    const session = verifySessionToken(bearer)
    if (session) return session
  }
  const cookie = req.cookies?.[SESSION_COOKIE_NAME]
  return typeof cookie === 'string' ? verifySessionToken(cookie) : null
}

/** Populate a valid session when present without rejecting public requests. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const session = readSession(req)
  if (session) (req as SessionRequest).session = session
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = readSession(req)
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  ;(req as AuthenticatedRequest).session = session
  next()
}
