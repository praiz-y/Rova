import jwt from 'jsonwebtoken'
import type { CookieOptions, Response } from 'express'

const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  userId: string
  address: string
}

function getSecret(): string {
  const secret = process.env.SESSION_JWT_SECRET
  if (!secret) {
    throw new Error('SESSION_JWT_SECRET is not set — see .env.example')
  }
  return secret
}

/**
 * Shared cookie attributes for setting AND clearing the session cookie.
 *
 * `sameSite` is the load-bearing part. In deployment the frontend and this
 * API live on different registrable domains — *.vercel.app and
 * *.up.railway.app are both public suffixes — which makes them separate
 * "sites". A SameSite=Lax cookie is never attached to a cross-site request,
 * so every `credentials: 'include'` call would arrive unauthenticated: the
 * user signs in successfully and is logged out again on the next request.
 * 'none' is what lets the cookie travel at all.
 *
 * SameSite=None is only honoured together with Secure, and Secure requires
 * HTTPS, so both switch on `NODE_ENV === 'production'` as a pair. Local dev
 * keeps Lax over plain HTTP, where None would be rejected outright.
 *
 * Built by a function rather than inlined so `clearSession` cannot drift out
 * of sync with these attributes — a mismatched clear silently leaves a live
 * cookie behind on logout.
 */
function sessionCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  }
}

/**
 * Signs a session token. Split out of `issueSession` because the token now
 * travels by two routes — the cookie set there, and the `Authorization:
 * Bearer` header the frontend falls back to. requireAuth.ts explains why the
 * cookie cannot be the only carrier.
 */
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: SESSION_TTL_SECONDS })
}

/**
 * Sets the session cookie and returns the same token, so the caller can put it
 * in the response body as well. Returns rather than returns-void because
 * /api/auth/verify sends both and signing twice would be two different tokens.
 */
export function issueSession(res: Response, payload: SessionPayload): string {
  const token = signSessionToken(payload)
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    maxAge: SESSION_TTL_SECONDS * 1000,
  })
  return token
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload
  } catch {
    return null
  }
}

export function clearSession(res: Response): void {
  // Attributes must match issueSession's exactly, or the browser treats this
  // as a different cookie and the session survives logout.
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions())
}

export { SESSION_COOKIE_NAME }
