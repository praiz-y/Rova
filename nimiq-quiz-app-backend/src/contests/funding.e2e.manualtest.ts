/**
 * Manual end-to-end check against a running dev server (backend must have
 * NIMIQ_DEPOSIT_ADDRESS set — .env already does):
 *   npx tsx src/contests/funding.e2e.manualtest.ts
 *
 * The full real-deposit happy path is covered separately by
 * full-loop.e2e.manualtest.ts (T071). This file covers everything that
 * doesn't need a real deposit (fee display, publish-gate rejection,
 * free-contest bypass, cancellation math, ownership enforcement) plus,
 * since D048 made real deposit-sending possible, a real **underfunded**
 * deposit (Phase 5) — a real transaction that matches the reference but
 * falls short of the required total, confirming the backend reports it as
 * a distinct `underfunded` state rather than an indistinguishable-from-
 * "nothing arrived" `pending`.
 */
import 'dotenv/config'
import { sha512, sha256 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { PrivateKey } from '@nimiq/core'
import { addressFromPublicKey } from '../auth/nimiqCrypto.js'
import { addressFromPrivateKeyHex, buildAndSignTransaction } from '../blockchain/nimiqLocalSigner.js'
import { broadcastRawTransaction, getCurrentBlockNumber } from '../blockchain/nimiqRpc.js'

ed25519.hashes.sha512 = sha512
const BASE_URL = 'http://localhost:3001'
const RPC_URL = process.env.NIMIQ_RPC_URL ?? 'https://rpc.testnet.nimiqwatch.com'
const FAUCET_URL = 'https://faucet.pos.nimiq-testnet.com/tapit'
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

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return res.json()
}

async function main() {
  const cookieA = await loginAsNewUser()
  const cookieB = await loginAsNewUser()

  // --- Free contest: no funding needed, publish gate still enforces content completeness.
  const freeContest = await api(cookieA, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({ isFree: true }),
  })
  const freeFunding = await api(cookieA, `/api/contests/${freeContest.body.id}/funding`)
  assert(freeFunding.status === 200 && freeFunding.body.fundingStatus === 'not_required', 'free contest funding info reports not_required')

  const freePublishIncomplete = await api(cookieA, `/api/contests/${freeContest.body.id}/publish`, { method: 'POST' })
  assert(freePublishIncomplete.status === 400, 'publishing a free contest with no title/questions is rejected (400)')
  assert(freePublishIncomplete.body.errors.some((e: string) => e.includes('title')), 'publish error mentions missing title')

  const completeFree = await api(cookieA, `/api/contests/${freeContest.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Free Quiz',
      questions: [{ type: 'short_answer', prompt: 'What is 2+2?', points: 1, correctAnswer: '4' }],
      registrationOpenAt: '2026-10-01T00:00:00Z',
      registrationCloseAt: '2026-10-02T00:00:00Z',
      quizStartAt: '2026-10-02T01:00:00Z',
      quizDurationSeconds: 300,
    }),
  })
  assert(completeFree.status === 200, 'free contest can be completed')
  const freePublish = await api(cookieA, `/api/contests/${freeContest.body.id}/publish`, { method: 'POST' })
  assert(freePublish.status === 200 && freePublish.body.status === 'published', 'complete free contest publishes successfully')

  // Publishing again (already published) should be rejected.
  const republish = await api(cookieA, `/api/contests/${freeContest.body.id}/publish`, { method: 'POST' })
  assert(republish.status === 409, 'publishing an already-published contest is rejected (409)')

  // --- Paid contest: funding info, publish gate blocks on unconfirmed funding.
  const paidContest = await api(cookieA, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Paid Quiz',
      questions: [{ type: 'short_answer', prompt: 'What is 2+2?', points: 1, correctAnswer: '4' }],
      registrationOpenAt: '2026-10-01T00:00:00Z',
      registrationCloseAt: '2026-10-02T00:00:00Z',
      quizStartAt: '2026-10-02T01:00:00Z',
      quizDurationSeconds: 300,
      isFree: false,
      prizePoolNim: '1000',
      winnerCount: 1,
      prizeDistribution: [{ rank: 1, amountNim: '1000' }],
    }),
  })
  const paidFunding = await api(cookieA, `/api/contests/${paidContest.body.id}/funding`)
  assert(paidFunding.status === 200, 'paid contest funding info is retrievable')
  assert(paidFunding.body.totalNim === '1100', 'funding info shows correct total (pool 1000 + 10% platform fee = 1100)')
  assert(paidFunding.body.platformFeeNim === '100', 'funding info shows correct platform fee')
  assert(typeof paidFunding.body.depositAddress === 'string' && paidFunding.body.depositAddress.startsWith('NQ'), 'funding info includes a real deposit address')
  assert(typeof paidFunding.body.reference === 'string' && paidFunding.body.reference.length <= 64, 'funding reference fits Nimiq\'s 64-byte data field')

  const paidPublishUnfunded = await api(cookieA, `/api/contests/${paidContest.body.id}/publish`, { method: 'POST' })
  assert(paidPublishUnfunded.status === 400, 'publishing a paid contest before funding is confirmed is rejected (400)')
  assert(paidPublishUnfunded.body.errors.some((e: string) => e.includes('funding')), 'publish error specifically mentions funding')

  // Checking funding with no matching transaction reports pending, doesn't crash.
  const checkNoMatch = await api(cookieA, `/api/contests/${paidContest.body.id}/funding/check`, { method: 'POST' })
  assert(checkNoMatch.status === 200 && checkNoMatch.body.fundingStatus === 'pending', 'funding check with no matching deposit reports pending (real RPC call, no funds sent yet)')

  // Non-owner cannot check/publish/cancel someone else's contest.
  const otherCheck = await api(cookieB, `/api/contests/${paidContest.body.id}/funding/check`, { method: 'POST' })
  assert(otherCheck.status === 403, 'non-owner cannot trigger funding check on another user\'s contest (403)')
  const otherPublish = await api(cookieB, `/api/contests/${paidContest.body.id}/publish`, { method: 'POST' })
  assert(otherPublish.status === 403, 'non-owner cannot publish another user\'s contest (403)')

  // --- Cancellation math, free vs. paid-but-unfunded (no refund owed since nothing was paid in).
  const cancelUnfunded = await api(cookieA, `/api/contests/${paidContest.body.id}/cancel`, { method: 'POST' })
  assert(cancelUnfunded.status === 200 && cancelUnfunded.body.status === 'cancelled', 'unfunded paid contest can be cancelled')
  assert(cancelUnfunded.body.refundOwedNim === null, 'cancelling an unfunded contest owes no refund (nothing was ever paid in)')

  const cancelFree = await api(cookieA, `/api/contests/${freeContest.body.id}/cancel`, { method: 'POST' })
  assert(cancelFree.status === 200 && cancelFree.body.refundOwedNim === null, 'cancelling a free (published) contest owes no refund')

  // --- Phase 5: a real underfunded deposit (D048 local signing) — a
  // transaction that matches the reference but falls short of the total
  // required must be reported distinctly from "nothing has arrived yet".
  const underfundedContest = await api(cookieA, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({
      isFree: false,
      prizePoolNim: '20',
      winnerCount: 1,
      prizeDistribution: [{ rank: 1, amountNim: '20' }],
    }),
  })
  const underfundedFunding = await api(cookieA, `/api/contests/${underfundedContest.body.id}/funding`)
  const { depositAddress, reference, totalNim } = underfundedFunding.body
  console.log(`Underfunded test: deposit address ${depositAddress}, reference ${reference}, required ${totalNim} NIM`)

  const funderPrivateKey = PrivateKey.generate().toHex()
  const funderAddress = addressFromPrivateKeyHex(funderPrivateKey)
  const faucetRes = await fetch(FAUCET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `address=${encodeURIComponent(funderAddress)}`,
  })
  const faucetBody = (await faucetRes.json()) as { success?: boolean }
  assert(faucetRes.ok && faucetBody.success === true, 'faucet funded the underfunded-test wallet')

  let funderFunded = false
  for (let attempt = 0; attempt < 8; attempt++) {
    const balanceRes = await rpc('getAccountByAddress', [funderAddress])
    if ((balanceRes?.result?.data?.balance ?? 0) > 0) {
      funderFunded = true
      break
    }
    await delay(8000)
  }
  assert(funderFunded, 'faucet funds landed before sending the deliberately-short deposit')

  // Send noticeably less than required (half the total, rounded down).
  const shortLuna = BigInt(Math.floor((Number(totalNim) * 100_000) / 2))
  const validityStartHeight = await getCurrentBlockNumber()
  const signedShort = buildAndSignTransaction({
    privateKeyHex: funderPrivateKey,
    recipientAddress: depositAddress,
    valueLuna: shortLuna,
    data: reference,
    validityStartHeight,
  })
  const shortTxHash = await broadcastRawTransaction(signedShort.hex)
  console.log('Broadcast deliberately-underfunded deposit tx:', shortTxHash)

  let sawUnderfunded = false
  let lastUnderfundedCheck: any = null
  for (let attempt = 0; attempt < 20; attempt++) {
    lastUnderfundedCheck = await api(cookieA, `/api/contests/${underfundedContest.body.id}/funding/check`, { method: 'POST' })
    if (lastUnderfundedCheck.body?.fundingStatus === 'underfunded') {
      sawUnderfunded = true
      break
    }
    await delay(8000)
  }
  assert(
    sawUnderfunded,
    `a real short deposit is reported as 'underfunded', not an indistinguishable 'pending' — last: ${JSON.stringify(lastUnderfundedCheck?.body)}`
  )
  assert(
    typeof lastUnderfundedCheck.body.underfundedMessage === 'string' && lastUnderfundedCheck.body.underfundedMessage.length > 0,
    'the underfunded response includes a clear, real, actionable message'
  )
  assert(
    lastUnderfundedCheck.body.fundingTxHash === shortTxHash,
    'the recorded tx hash matches the real short deposit this script broadcast'
  )
  const publishUnderfunded = await api(cookieA, `/api/contests/${underfundedContest.body.id}/publish`, { method: 'POST' })
  assert(publishUnderfunded.status === 400, 'an underfunded contest still cannot publish (400) — never silently treated as funded')

  console.log('\nAll funding/publish/cancel checks passed, including a real detected deposit, a real underfunded deposit, and real publish-gate enforcement.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
