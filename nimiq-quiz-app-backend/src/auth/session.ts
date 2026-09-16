import jwt from 'jsonwebtoken'
import type { Response } from 'express'

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

export function issueSession(res: Response, payload: SessionPayload): void {
  const token = jwt.sign(payload, getSecret(), { expiresIn: SESSION_TTL_SECONDS })
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS * 1000,
  })
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload
  } catch {
    return null
  }
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME)
}

export { SESSION_COOKIE_NAME }
