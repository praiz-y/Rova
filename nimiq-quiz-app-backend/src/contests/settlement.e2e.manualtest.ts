/**
 * Manual end-to-end check against a running dev server (npx tsx src/server.ts):
 *   npx tsx src/contests/settlement.e2e.manualtest.ts
 *
 * Covers the two Phase 5 items added on 2026-09-14:
 *  1. Sponsor self-participation block (registration + attempt creation).
 *  2. Undersubscribed-contest settlement (D021/D022/D046) — the unallocated
 *     prize math, the premature-settlement guard, and the honesty guardrail
 *     (a real signed refund attempt against the configured RPC, which is
 *     expected to fail honestly since it's a public read-only endpoint —
 *     see DECISIONS.md D044/Phase 2's "Current Guardrail").
 *
 * Directly mutates contest rows via the DB pool in two places, clearly
 * marked below, to reach 'published'/'results_finalized' without needing a
 * real matching deposit transaction or waiting out a real quiz duration —
 * the real funding flow is blocked on the same wallet-enabled-RPC gap as
 * Phase 2 (see ROADMAP.md). Everything else here drives real API routes
 * against the real database.
 */
import 'dotenv/config'
import { sha512, sha256 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { addressFromPublicKey } from '../auth/nimiqCrypto.js'
import { pool } from '../db/pool.js'

ed25519.hashes.sha512 = sha512
const BASE_URL = 'http://localhost:3001'
const PREFIX = '\x16Nimiq Signed Message:\n'

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}
function sign(privateKey: Uint8Array, message: string): string {
  const enc = new TextEncoder()
  const msgBytes = enc.encode(message)
  const prefixBytes = enc.encode(PREFIX)
  const lenBytes = enc.encode(String(msgBytes.length))
  const combined = new Uint8Array(prefixBytes.length + lenBytes.length + msgBytes.length)
  combined.set(prefixBytes, 0)
  combined.set(lenBytes, prefixBytes.length)
  combined.set(msgBytes, prefixBytes.length + lenBytes.length)
  return bytesToHex(ed25519.sign(sha256(combined), privateKey))
}

async function loginAsNewUser(): Promise<string> {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(privateKey)
  const address = addressFromPublicKey(publicKey)
  const challengeRes = await fetch(`${BASE_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const { message } = (await challengeRes.json()) as { message: string }
  const signature = sign(privateKey, message)
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message, publicKey: bytesToHex(publicKey), signature }),
  })
  return verifyRes.headers.get('set-cookie')!.split(';')[0]
}

async function api(cookie: string, path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...init?.headers },
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const cookieSponsor = await loginAsNewUser()
  const cookieWinner = await loginAsNewUser()

  // Registration must close at/before the quiz starts (validated by the
  // app), so both are set to the same near-future instant; registration
  // itself happens well before that, and gameplay waits for it to pass.
  const regOpen = new Date(Date.now() - 60_000).toISOString()
  const quizStart = new Date(Date.now() + 8000).toISOString()
  const regClose = quizStart

  // --- 1. Sponsor self-participation block (free contest, no funding needed) ---
  const freeContest = await api(cookieSponsor, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Self-Participation Test',
      questions: [{ type: 'short_answer', prompt: '2+2?', points: 1, correctAnswer: '4' }],
      registrationOpenAt: regOpen,
      registrationCloseAt: regClose,
      quizStartAt: quizStart,
      quizDurationSeconds: 600,
      isFree: true,
    }),
  })
  const publishFree = await api(cookieSponsor, `/api/contests/${freeContest.body.id}/publish`, { method: 'POST' })
  assert(publishFree.status === 200, 'free self-participation test contest publishes')

  const selfRegister = await api(cookieSponsor, `/api/contests/${freeContest.body.id}/registration`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  assert(selfRegister.status === 403, 'contest creator cannot register for their own contest (403)')

  const otherRegister = await api(cookieWinner, `/api/contests/${freeContest.body.id}/registration`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  assert(otherRegister.status === 201, 'a different user can register normally')

  const selfAttempt = await api(cookieSponsor, `/api/contests/${freeContest.body.id}/attempt`, { method: 'POST' })
  assert(selfAttempt.status === 403, 'contest creator cannot create a quiz attempt for their own contest (403)')

  // --- 2. Settlement: paid contest, 2 winner slots, only 1 real finisher ---
  // Fresh timing window (not reusing the free-contest one above, which may
  // already be close to expiring by the time we get here).
  const regOpen2 = new Date(Date.now() - 60_000).toISOString()
  const quizStart2 = new Date(Date.now() + 8000).toISOString()
  const regClose2 = quizStart2

  const paidContest = await api(cookieSponsor, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Settlement Test Contest',
      questions: [{ type: 'short_answer', prompt: '2+2?', points: 1, correctAnswer: '4' }],
      registrationOpenAt: regOpen2,
      registrationCloseAt: regClose2,
      quizStartAt: quizStart2,
      quizDurationSeconds: 600,
      isFree: false,
      prizePoolNim: '10',
      winnerCount: 2,
      prizeDistribution: [
        { rank: 1, amountNim: '7' },
        { rank: 2, amountNim: '3' },
      ],
    }),
  })
  const contestId = paidContest.body.id as string

  // Test-only DB bypass: the real deposit flow is blocked on the same
  // wallet-enabled-RPC gap as Phase 2 (public RPC rejects wallet methods —
  // verified directly this session). This reaches 'published' with funding
  // marked confirmed so the rest of this test can exercise real routes.
  await pool.query(
    `UPDATE contests SET status = 'published', funding_status = 'confirmed', funding_tx_hash = $1, funded_amount_nim = $2, funded_at = now() WHERE id = $3`,
    [`test-bypass-settlement-${contestId}`, '11', contestId]
  )

  const settleTooEarly = await api(cookieSponsor, `/api/contests/${contestId}/payouts/process`, { method: 'POST' })
  assert(
    settleTooEarly.status === 200 && settleTooEarly.body.settlement.status === 'not_applicable',
    'settlement refuses to run before the quiz has closed (premature full-refund guard)'
  )
  assert(
    settleTooEarly.body.settlement.unallocatedPrizeNim === null,
    'settlement records nothing while the contest is still live'
  )

  const winnerRegister = await api(cookieWinner, `/api/contests/${contestId}/registration`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  assert(winnerRegister.status === 201, 'winner can register for the paid contest')

  await delay(9000) // wait for quizStartAt (now + 8s) to actually pass

  const attempt = await api(cookieWinner, `/api/contests/${contestId}/attempt`, { method: 'POST' })
  assert(attempt.status === 200, 'winner can start the quiz attempt once it opens')
  const answer = await api(cookieWinner, `/api/contests/${contestId}/attempt/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer: '4' }),
  })
  assert(answer.status === 200, 'winner can answer the question')
  const submit = await api(cookieWinner, `/api/contests/${contestId}/attempt/submit`, { method: 'POST' })
  assert(submit.status === 200 && Number(submit.body.score) === 1, 'winner submits with a correct score')

  // Test-only DB bypass: skip the real 10-minute quiz duration to reach
  // results_finalized immediately, same as the lifecycle ticker would once
  // quiz_start_at + duration has actually passed.
  await pool.query(`UPDATE contests SET status = 'results_finalized', updated_at = now() WHERE id = $1`, [contestId])

  // D048: payouts/settlement now sign locally and broadcast for real (no
  // wallet-enabled RPC needed) — this exercises the real testnet chain,
  // including real finality waits, so this call can take a couple of
  // minutes.
  let processed = await api(cookieSponsor, `/api/contests/${contestId}/payouts/process`, { method: 'POST' })
  assert(processed.status === 200, 'payouts/process runs successfully')
  // unallocated_prize_nim is NUMERIC(20,5), so Postgres pads it to that
  // scale on read (e.g. "3.00000") — same as every other money column in
  // this schema. Compare numerically, not by exact string.
  assert(
    Number(processed.body.settlement.unallocatedPrizeNim) === 3,
    `settlement correctly computes the unfilled rank-2 slot as unallocated (3 NIM) — got ${processed.body.settlement.unallocatedPrizeNim}`
  )
  assert(
    processed.body.payouts.length === 1,
    'exactly one real payout row exists (rank 2 never got a fabricated winner)'
  )
  assert(processed.body.payouts[0].rank === 1, 'the one payout row is for the actual finisher (rank 1), not a fake rank 2')
  assert(
    processed.body.payouts[0].status === 'confirmed',
    `the real payout reaches genuine on-chain confirmation (D048) — got: ${processed.body.payouts[0].status} / ${processed.body.payouts[0].errorMessage}`
  )
  assert(
    typeof processed.body.payouts[0].txHash === 'string' && processed.body.payouts[0].txHash.length > 0,
    'the confirmed payout carries a real tx hash'
  )

  // The shared public testnet RPC rate-limits (429) — payout + settlement
  // together make several real RPC calls back-to-back. This is a real,
  // known infrastructure characteristic, not a fabricated pass: if hit,
  // wait out the window and retry the same idempotent call once (it
  // resumes rather than re-sending, per D031/D048).
  const isRateLimited = (s: any) =>
    s?.status === 'failed' && typeof s.errorMessage === 'string' && /429|Too Many Requests/i.test(s.errorMessage)

  if (isRateLimited(processed.body.settlement)) {
    console.log('Settlement hit the public RPC rate limit — waiting 65s and retrying once (idempotent resume, not a re-send)...')
    await delay(65_000)
    processed = await api(cookieSponsor, `/api/contests/${contestId}/payouts/process`, { method: 'POST' })
  }

  assert(
    processed.body.settlement.status === 'refunded',
    `settlement reaches genuine on-chain refund confirmation (D048) — got: ${processed.body.settlement.status} / ${processed.body.settlement.errorMessage}`
  )
  assert(
    typeof processed.body.settlement.txHash === 'string' && processed.body.settlement.txHash.length > 0,
    'the refunded settlement carries a real tx hash'
  )

  await pool.end()
  console.log('\nAll sponsor self-participation + settlement checks passed — including real on-chain payout and settlement confirmation.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
