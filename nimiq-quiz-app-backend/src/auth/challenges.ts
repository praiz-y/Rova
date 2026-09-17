/**
 * Short-lived login challenges, keyed by the challenge message itself (a
 * random nonce embedded in fixed text) rather than by address — the wallet
 * that signs a given challenge determines the address, there is nothing to
 * bind in advance (D051: the address is derived from the verified
 * signature, not claimed by the client — see nimiqCrypto.ts).
 *
 * In-memory is fine for a single backend instance at MVP scale; move to a
 * shared store (DB/Redis) if the backend is ever horizontally scaled.
 */
import { randomBytes } from 'node:crypto'

const CHALLENGE_TTL_MS = 5 * 60 * 1000

const challenges = new Map<string, number>() // message -> expiresAt

/** Opportunistically drop expired, never-consumed entries (e.g. abandoned logins). */
function sweepExpired(): void {
  const now = Date.now()
  for (const [message, expiresAt] of challenges) {
    if (now > expiresAt) challenges.delete(message)
  }
}

export function createChallenge(): string {
  sweepExpired()
  const nonce = randomBytes(16).toString('hex')
  const message = `Sign in to ROVA\nNonce: ${nonce}`
  challenges.set(message, Date.now() + CHALLENGE_TTL_MS)
  return message
}

/** Consume (and invalidate) a pending challenge, if it's valid and unexpired. */
export function consumeChallenge(message: string): boolean {
  const expiresAt = challenges.get(message)
  if (expiresAt === undefined) return false
  challenges.delete(message) // one-time use regardless of outcome, prevents replay
  return Date.now() <= expiresAt
}
