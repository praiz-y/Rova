/**
 * The fullest possible proof of D037's core loop without a real device:
 *   create -> fund (real sponsor-sent deposit, real detection) -> publish
 *   -> register -> play -> rank -> pay out (D048 real signing)
 * against a running dev server and real testnet chain state.
 *
 *   npx tsx src/contests/full-loop.e2e.manualtest.ts
 *
 * No DB bypass anywhere in this script (unlike settlement.e2e.manualtest.ts,
 * which deliberately bypasses funding/status to isolate the payout leg).
 * Every state transition here goes through the real API and is driven by
 * real on-chain transactions and the server's own lifecycle ticker.
 *
 * A fresh throwaway wallet is generated and faucet-funded to act as the
 * "sponsor's real wallet" sending the deposit — proving this doesn't rely
 * on the payout wallet's own balance for the deposit side.
 */
import 'dotenv/config'
import { sha512, sha256 } from '@noble/hashes/sha2.js'
import * as ed25519 from '@noble/ed25519'
import { PrivateKey } from '@nimiq/core'
import { addressFromPublicKey } from '../auth/nimiqCrypto.js'
import { addressFromPrivateKeyHex, buildAndSignTransaction } from '../blockchain/nimiqLocalSigner.js'
import { broadcastRawTransaction, checkRawTransaction, getCurrentBlockNumber } from '../blockchain/nimiqRpc.js'

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

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return res.json()
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

  const regOpen = new Date(Date.now() - 60_000).toISOString()
  // 4 minutes: real funding detection needs real macro-block finality.
  const quizStart = new Date(Date.now() + 240_000).toISOString()
  const regClose = quizStart

  const contestRes = await api(cookieSponsor, '/api/contests', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Full Loop E2E Test',
      questions: [{ type: 'short_answer', prompt: '2+2?', points: 1, correctAnswer: '4' }],
      registrationOpenAt: regOpen,
      registrationCloseAt: regClose,
      quizStartAt: quizStart,
      quizDurationSeconds: 30, // short, so the lifecycle ticker auto-closes it quickly
      isFree: false,
      prizePoolNim: '10',
      winnerCount: 1,
      prizeDistribution: [{ rank: 1, amountNim: '10' }],
    }),
  })
  assert(contestRes.status === 201, 'paid contest created')
  const contestId = contestRes.body.id as string

  const fundingInfo = await api(cookieSponsor, `/api/contests/${contestId}/funding`)
  assert(fundingInfo.status === 200, 'funding info retrieved')
  const { depositAddress, reference, totalNim } = fundingInfo.body
  console.log(`Deposit address: ${depositAddress}, reference: ${reference}, totalNim: ${totalNim}`)

  // A fresh, separate wallet acting as the sponsor's real funding source —
  // never used for anything else, proving this doesn't depend on the
  // payout wallet's own balance for the deposit side.
  const funderPrivateKey = PrivateKey.generate().toHex()
  const funderAddress = addressFromPrivateKeyHex(funderPrivateKey)
  console.log('Generated funder test wallet:', funderAddress)

  console.log('Requesting testnet NIM from the real faucet...')
  const faucetRes = await fetch(FAUCET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `address=${encodeURIComponent(funderAddress)}`,
  })
  const faucetBody = (await faucetRes.json()) as { success?: boolean }
  assert(faucetRes.ok && faucetBody.success === true, `faucet accepted the request — ${JSON.stringify(faucetBody)}`)

  console.log('Waiting for faucet funds to land in the new wallet...')
  let funderFunded = false
  for (let attempt = 0; attempt < 8; attempt++) {
    const balanceRes = await rpc('getAccountByAddress', [funderAddress])
    const balance = balanceRes?.result?.data?.balance ?? 0
    if (balance > 0) {
      console.log(`Funder wallet balance: ${balance} luna`)
      funderFunded = true
      break
    }
    await delay(8000)
  }
  assert(funderFunded, 'faucet funds landed in the new test wallet')

  // Build + sign the REAL deposit transaction (D048's local signing,
  // reused here for an arbitrary wallet, not just the payout wallet).
  const validityStartHeight = await getCurrentBlockNumber()
  const totalLuna = BigInt(Math.round(Number(totalNim) * 100_000))
  const signedDeposit = buildAndSignTransaction({
    privateKeyHex: funderPrivateKey,
    recipientAddress: depositAddress,
    valueLuna: totalLuna,
    data: reference,
    validityStartHeight,
  })
  await checkRawTransaction(signedDeposit.hex) // pre-flight parse check, no broadcast
  const depositTxHash = await broadcastRawTransaction(signedDeposit.hex)
  console.log('Broadcast real deposit tx:', depositTxHash)

  console.log('Polling /funding/check for real detection + finality (no DB bypass)...')
  let funded = false
  let lastCheck: any = null
  for (let attempt = 0; attempt < 20; attempt++) {
    lastCheck = await api(cookieSponsor, `/api/contests/${contestId}/funding/check`, { method: 'POST' })
    if (lastCheck.body?.fundingStatus === 'confirmed') {
      funded = true
      break
    }
    await delay(8000)
  }
  assert(funded, `real deposit was detected and finalized by the backend — last: ${JSON.stringify(lastCheck?.body)}`)
  assert(
    lastCheck.body.fundingTxHash === depositTxHash,
    'the detected tx hash matches the one this script actually broadcast'
  )

  const publishRes = await api(cookieSponsor, `/api/contests/${contestId}/publish`, { method: 'POST' })
  assert(
    publishRes.status === 200 && publishRes.body.status === 'published',
    `contest publishes now that funding is really confirmed — got ${publishRes.status} ${JSON.stringify(publishRes.body)}`
  )

  const registerRes = await api(cookieWinner, `/api/contests/${contestId}/registration`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  assert(registerRes.status === 201, 'winner registers for the real-funded contest')

  const msUntilQuiz = new Date(quizStart).getTime() - Date.now()
  if (msUntilQuiz > 0) {
    console.log(`Waiting ${Math.ceil(msUntilQuiz / 1000)}s for quizStartAt...`)
    await delay(msUntilQuiz + 2000)
  }

  const attempt = await api(cookieWinner, `/api/contests/${contestId}/attempt`, { method: 'POST' })
  assert(attempt.status === 200, 'winner starts the quiz attempt')
  const answer = await api(cookieWinner, `/api/contests/${contestId}/attempt/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer: '4' }),
  })
  assert(answer.status === 200, 'winner answers correctly')
  const submit = await api(cookieWinner, `/api/contests/${contestId}/attempt/submit`, { method: 'POST' })
  assert(submit.status === 200 && Number(submit.body.score) === 1, 'winner submits with a correct score')

  const leaderboard = await api(cookieWinner, `/api/contests/${contestId}/leaderboard`)
  assert(
    leaderboard.status === 200 && leaderboard.body.leaderboard?.[0]?.rank === 1,
    'winner appears at rank 1 on the real leaderboard'
  )

  console.log('Waiting for the lifecycle ticker to auto-finalize results and process the real payout...')
  let payoutConfirmed = false
  let lastPayouts: any = null
  for (let attempt2 = 0; attempt2 < 30; attempt2++) {
    lastPayouts = await api(cookieSponsor, `/api/contests/${contestId}/payouts`)
    if (lastPayouts.body?.payouts?.[0]?.status === 'confirmed') {
      payoutConfirmed = true
      break
    }
    await delay(8000)
  }
  assert(
    payoutConfirmed,
    `real payout reaches confirmed via the automatic lifecycle ticker — last: ${JSON.stringify(lastPayouts?.body)}`
  )
  assert(
    typeof lastPayouts.body.payouts[0].txHash === 'string' && lastPayouts.body.payouts[0].txHash.length > 0,
    'the confirmed payout carries a real tx hash'
  )

  console.log('\n*** FULL REAL LOOP PROVEN: deposit -> detection -> publish -> register -> play -> rank -> payout ***')
  console.log('Deposit tx:', depositTxHash)
  console.log('Payout tx:', lastPayouts.body.payouts[0].txHash)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
