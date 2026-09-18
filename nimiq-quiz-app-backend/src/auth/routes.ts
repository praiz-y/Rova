import { Router } from 'express'
import { pool } from '../db/pool.js'
import { createChallenge, consumeChallenge } from './challenges.js'
import { verifyAndDeriveAddress, normalizeAddress } from './nimiqCrypto.js'
import { issueSession, clearSession } from './session.js'

export const authRouter = Router()

/**
 * Step 1: client requests a nonce to sign. Not address-scoped (D051) — the
 * wallet that signs it determines the address, so there is nothing to bind
 * to an address in advance. This also lets a single wallet popup both pick
 * an account and sign in one step (needed for the Hub API desktop fallback,
 * D050 — chaining two separate popups across an intervening network call
 * gets the second one blocked by the browser).
 */
authRouter.post('/challenge', (_req, res) => {
  const message = createChallenge()
  res.json({ message })
})

/**
 * Step 2: client submits a signature over that exact message. The address
 * is derived from the signature itself (D051), not claimed by the client.
 * On success, issues a session cookie and creates the user row if new.
 */
authRouter.post('/verify', async (req, res) => {
  const { message, publicKey, signature } = req.body ?? {}
  if (typeof message !== 'string' || typeof publicKey !== 'string' || typeof signature !== 'string') {
    res.status(400).json({ error: 'message, publicKey, and signature are required' })
    return
  }

  if (!consumeChallenge(message)) {
    res.status(401).json({ error: 'Invalid, expired, or already-used challenge' })
    return
  }

  let address: string | null
  try {
    address = verifyAndDeriveAddress({ message, publicKeyHex: publicKey, signatureHex: signature })
  } catch {
    res.status(400).json({ error: 'Malformed publicKey or signature' })
    return
  }

  if (!address) {
    res.status(401).json({ error: 'Signature verification failed' })
    return
  }

  const normalizedAddress = normalizeAddress(address)

  const result = await pool.query<{ id: string; username: string | null }>(
    `INSERT INTO users (address) VALUES ($1)
     ON CONFLICT (address) DO UPDATE SET address = EXCLUDED.address
     RETURNING id, username`,
    [normalizedAddress]
  )
  const user = result.rows[0]

  // The token goes into the body as well as into the cookie. The frontend
  // keeps the body copy and replays it as `Authorization: Bearer`, which is
  // what carries the session through an in-app webview that refuses the
  // cross-site cookie — see requireAuth.ts. Same token in both places, which
  // is why issueSession returns it rather than signing a second one.
  const token = issueSession(res, { userId: user.id, address: normalizedAddress })
  // This response body deserializes straight into the frontend's CurrentUser,
  // whose field is `id` — and GET /api/users/me already returns `id`. The JWT
  // payload on the line above keeps `userId`: that's session.ts's
  // SessionPayload, a separate contract. Mismatching these made `user.id`
  // undefined immediately after connecting and correct after any reload.
  res.json({ id: user.id, address: normalizedAddress, username: user.username, token })
})

authRouter.post('/logout', (_req, res) => {
  clearSession(res)
  res.status(204).end()
})
