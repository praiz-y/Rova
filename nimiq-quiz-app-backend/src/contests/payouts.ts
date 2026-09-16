import { pool } from '../db/pool.js'
import {
  broadcastRawTransaction,
  checkRawTransaction,
  getCurrentBlockNumber,
  getFinalityMacroBlock,
  getTransaction,
} from '../blockchain/nimiqRpc.js'
import { addressFromPrivateKeyHex, buildAndSignTransaction } from '../blockchain/nimiqLocalSigner.js'
import { computeUnallocatedPrizeNim, nimToLuna } from './funding.js'
import {
  findContestById,
  findCreatorAddress,
  getContestLeaderboard,
  markSettlementFailed,
  markSettlementProcessing,
  markSettlementRefunded,
  markSettlementTxHash,
  recordContestSettlement,
} from './repository.js'

export interface PrizePayout {
  id: string
  contestId: string
  userId: string
  rank: number
  amountNim: string
  recipientAddress: string
  status: 'pending' | 'processing' | 'confirmed' | 'failed'
  txHash: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

interface PayoutRow {
  id: string
  contest_id: string
  user_id: string
  rank: number
  amount_nim: string
  recipient_address: string
  status: string
  tx_hash: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

function toPayout(row: PayoutRow): PrizePayout {
  return {
    id: row.id,
    contestId: row.contest_id,
    userId: row.user_id,
    rank: row.rank,
    amountNim: row.amount_nim,
    recipientAddress: row.recipient_address,
    status: row.status as PrizePayout['status'],
    txHash: row.tx_hash,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function payoutTransactionData(contestId: string, payout: PrizePayout): string {
  return `p:${contestId.replace(/-/g, '').slice(0, 24)}:${payout.rank}`
}

/**
 * Builds, verifies (offline + against the real RPC without broadcasting),
 * and broadcasts a transaction for `valueNim` NIM to `recipient` (D048).
 * Returns the real tx hash once the node has accepted the broadcast.
 */
async function signAndBroadcast(params: {
  privateKey: string
  recipient: string
  valueNim: string
  data: string
}): Promise<string> {
  const validityStartHeight = await getCurrentBlockNumber()
  const signed = buildAndSignTransaction({
    privateKeyHex: params.privateKey,
    recipientAddress: params.recipient,
    valueLuna: nimToLuna(params.valueNim),
    data: params.data,
    validityStartHeight,
  })

  // Pre-flight: have the real node parse the raw transaction before
  // anything is broadcast — a genuine safety check, not just a local one.
  await checkRawTransaction(signed.hex)

  return broadcastRawTransaction(signed.hex)
}

/**
 * Polls for finality with minimal RPC calls (D048): once the transaction's
 * finality macro block is known, only re-checks the chain head — it does
 * not re-derive the macro block on every attempt, unlike a naive
 * repeated isTransactionFinalized call. Matters in practice: the
 * configured public RPC rate-limits (429), and payouts already run
 * several signing/broadcast calls per contest.
 *
 * A transient RPC error mid-poll (e.g. a 429) is swallowed and retried on
 * the next attempt rather than thrown — the caller already treats
 * "not finalized within the window" as a safe, resumable `processing`
 * state, not a hard failure. Letting a transient error propagate would
 * incorrectly mark an already-broadcast, real transaction as permanently
 * `failed` just because one poll got rate-limited (a real bug found and
 * fixed via T071 — see DECISIONS.md D048).
 */
async function waitForPayoutFinality(txHash: string): Promise<boolean> {
  const attempts = envInt('NIMIQ_PAYOUT_FINALITY_ATTEMPTS', 12)
  const intervalMs = envInt('NIMIQ_PAYOUT_FINALITY_POLL_MS', 5000)

  let finalityMacroBlock: number | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (finalityMacroBlock == null) {
        const transaction = await getTransaction(txHash)
        if (transaction?.blockNumber != null) {
          finalityMacroBlock = await getFinalityMacroBlock(transaction.blockNumber)
        }
      }
      if (finalityMacroBlock != null) {
        const head = await getCurrentBlockNumber()
        if (head >= finalityMacroBlock) return true
      }
    } catch (err) {
      console.error(`waitForPayoutFinality: transient RPC error on attempt ${attempt + 1}, will retry:`, err)
    }
    if (attempt < attempts - 1) await delay(intervalMs)
  }

  return false
}

async function markPayoutFailed(payoutId: string, message: string): Promise<void> {
  // Defense in depth against the race the in-process lock below already
  // prevents in the normal case: never let a failure write clobber a row
  // that some other path already confirmed.
  await pool.query(
    `UPDATE prize_payouts
     SET status = 'failed',
         error_message = $1,
         updated_at = now()
     WHERE id = $2 AND status <> 'confirmed'`,
    [message, payoutId]
  )
}

/**
 * The lifecycle ticker runs every 15s (server.ts), but a finality wait can
 * take minutes (NIMIQ_PAYOUT_FINALITY_ATTEMPTS x POLL_MS). Without this,
 * overlapping ticker ticks for the same contest race: two concurrent
 * finality-poll loops for the same tx can finish out of order, and a
 * later-finishing loop that hit a transient RPC error can overwrite a
 * status an earlier-finishing loop had already set to 'confirmed' — a
 * real bug found via T071 (see DECISIONS.md D048). Single Node process,
 * so a simple in-process lock is sufficient (Rule 25: no need for a DB
 * advisory lock at this scale).
 */
const inFlightPayoutRuns = new Set<string>()
const inFlightSettlementRuns = new Set<string>()

export async function getPayoutsByContest(contestId: string): Promise<PrizePayout[]> {
  const result = await pool.query<PayoutRow>(
    'SELECT * FROM prize_payouts WHERE contest_id = $1 ORDER BY rank ASC',
    [contestId]
  )
  return result.rows.map(toPayout)
}

/**
 * Initializes payout records from the official leaderboard.
 * Enforces one payout per user and per rank (D031).
 */
export async function initializeContestPayouts(contestId: string): Promise<PrizePayout[]> {
  const contest = await findContestById(contestId)
  if (!contest || contest.isFree || !contest.prizePoolNim) {
    return []
  }

  const leaderboard = await getContestLeaderboard(contestId)
  const maxWinners = contest.winnerCount ?? 0

  for (const entry of leaderboard) {
    if (entry.rank > maxWinners || !entry.prizeNim || Number(entry.prizeNim) <= 0) {
      continue
    }

    await pool.query(
      `INSERT INTO prize_payouts (
         contest_id, user_id, rank, amount_nim, recipient_address, status
       ) VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (contest_id, user_id) DO NOTHING`,
      [contestId, entry.userId, entry.rank, entry.prizeNim, entry.address]
    )
  }

  return getPayoutsByContest(contestId)
}

/**
 * Isolated payout signing & execution module (D042, D048).
 * Signs each payout transaction locally (no RPC wallet/keystore involved —
 * see nimiqLocalSigner.ts), pre-flight-checks it against the real node,
 * broadcasts it, and confirms macro-block finality before marking paid.
 */
export async function processContestPayouts(contestId: string): Promise<{
  payouts: PrizePayout[]
  processedCount: number
}> {
  if (inFlightPayoutRuns.has(contestId)) {
    // Another call for this contest (ticker or manual) is already running
    // a signing/finality pass — return current state rather than racing it.
    return { payouts: await getPayoutsByContest(contestId), processedCount: 0 }
  }
  inFlightPayoutRuns.add(contestId)
  try {
    return await processContestPayoutsImpl(contestId)
  } finally {
    inFlightPayoutRuns.delete(contestId)
  }
}

async function processContestPayoutsImpl(contestId: string): Promise<{
  payouts: PrizePayout[]
  processedCount: number
}> {
  const payouts = await initializeContestPayouts(contestId)
  const privateKey = process.env.NIMIQ_PAYOUT_PRIVATE_KEY?.trim()

  if (!privateKey) {
    for (const payout of payouts) {
      if (payout.status !== 'confirmed') {
        await markPayoutFailed(payout.id, 'NIMIQ_PAYOUT_PRIVATE_KEY is not configured; no transaction was sent.')
      }
    }
    return { payouts: await getPayoutsByContest(contestId), processedCount: 0 }
  }

  // Fail loudly and early rather than silently signing from an unexpected
  // key: the payout wallet must be the same shared address deposits are
  // collected into (D042).
  const depositAddress = process.env.NIMIQ_DEPOSIT_ADDRESS?.trim().replace(/\s+/g, '').toUpperCase()
  if (depositAddress && addressFromPrivateKeyHex(privateKey) !== depositAddress) {
    for (const payout of payouts) {
      if (payout.status !== 'confirmed') {
        await markPayoutFailed(payout.id, 'NIMIQ_PAYOUT_PRIVATE_KEY does not match NIMIQ_DEPOSIT_ADDRESS; refusing to sign.')
      }
    }
    return { payouts: await getPayoutsByContest(contestId), processedCount: 0 }
  }

  let processedCount = 0

  for (const payout of payouts) {
    if (payout.status === 'confirmed') continue

    try {
      let txHash = payout.txHash

      if (!txHash) {
        await pool.query(
          `UPDATE prize_payouts
           SET status = 'processing',
               error_message = NULL,
               updated_at = now()
           WHERE id = $1`,
          [payout.id]
        )

        txHash = await signAndBroadcast({
          privateKey,
          recipient: payout.recipientAddress,
          valueNim: payout.amountNim,
          data: payoutTransactionData(contestId, payout),
        })

        await pool.query(
          `UPDATE prize_payouts
           SET status = 'processing',
               tx_hash = $1,
               error_message = $2,
               updated_at = now()
           WHERE id = $3`,
          [txHash, 'Broadcast accepted; waiting for chain finality.', payout.id]
        )
      }

      const finalized = await waitForPayoutFinality(txHash)
      if (!finalized) {
        await pool.query(
          `UPDATE prize_payouts
           SET status = 'processing',
               error_message = $1,
               updated_at = now()
           WHERE id = $2`,
          ['Broadcast accepted; finality not reached within the polling window.', payout.id]
        )
        continue
      }

      await pool.query(
        `UPDATE prize_payouts
         SET status = 'confirmed',
             error_message = NULL,
             updated_at = now()
         WHERE id = $1`,
        [payout.id]
      )
      processedCount++
    } catch (err) {
      await markPayoutFailed(payout.id, err instanceof Error ? err.message : 'Payout execution failed')
    }
  }

  const updatedPayouts = await getPayoutsByContest(contestId)
  const allConfirmed = updatedPayouts.length > 0 && updatedPayouts.every((p) => p.status === 'confirmed')

  if (allConfirmed) {
    await pool.query(
      `UPDATE contests SET status = 'completed', updated_at = now() WHERE id = $1`,
      [contestId]
    )
  }

  return { payouts: updatedPayouts, processedCount }
}

function settlementTransactionData(contestId: string): string {
  return `s:${contestId.replace(/-/g, '').slice(0, 24)}`
}

export interface ContestSettlement {
  status: 'not_applicable' | 'owed' | 'processing' | 'refunded' | 'failed'
  unallocatedPrizeNim: string | null
  txHash: string | null
  errorMessage: string | null
}

// Settlement must only run once the quiz has genuinely closed. Computing it
// earlier would see an empty leaderboard (nobody has finished yet) and
// treat every winner rank as "unallocated" — refunding the entire prize
// pool back to the sponsor while the contest is still supposed to be live.
const SETTLEABLE_STATUSES = new Set(['quiz_closed', 'results_finalized', 'payouts', 'completed'])

/**
 * Settles prize-pool NIM left over because fewer participants finished than
 * configured winner slots, or zero participants finished at all (D021,
 * D022, D046). Never fabricates a winner for an empty slot — the leftover
 * is refunded to the sponsor's own wallet, real signed transaction, same
 * signing/finality path as processContestPayouts. Only marked 'refunded'
 * after real on-chain finality; idempotent like payout processing (reuses
 * an existing tx_hash instead of sending twice).
 */
export async function processContestSettlement(contestId: string): Promise<ContestSettlement> {
  if (inFlightSettlementRuns.has(contestId)) {
    const contest = await findContestById(contestId)
    return {
      status: contest?.settlementStatus ?? 'not_applicable',
      unallocatedPrizeNim: contest?.unallocatedPrizeNim ?? null,
      txHash: contest?.settlementTxHash ?? null,
      errorMessage: contest?.settlementErrorMessage ?? null,
    }
  }
  inFlightSettlementRuns.add(contestId)
  try {
    return await processContestSettlementImpl(contestId)
  } finally {
    inFlightSettlementRuns.delete(contestId)
  }
}

async function processContestSettlementImpl(contestId: string): Promise<ContestSettlement> {
  const contest = await findContestById(contestId)
  if (!contest) throw new Error('Contest not found')

  if (!SETTLEABLE_STATUSES.has(contest.status)) {
    return {
      status: 'not_applicable',
      unallocatedPrizeNim: contest.unallocatedPrizeNim,
      txHash: contest.settlementTxHash,
      errorMessage: null,
    }
  }

  const leaderboard = await getContestLeaderboard(contestId)
  const unallocatedNim = computeUnallocatedPrizeNim(contest, leaderboard)
  const recorded = await recordContestSettlement(contestId, unallocatedNim)
  if (!recorded) throw new Error('Contest not found')

  if (recorded.settlementStatus === 'not_applicable' || recorded.settlementStatus === 'refunded') {
    return {
      status: recorded.settlementStatus,
      unallocatedPrizeNim: recorded.unallocatedPrizeNim,
      txHash: recorded.settlementTxHash,
      errorMessage: recorded.settlementErrorMessage,
    }
  }

  const privateKey = process.env.NIMIQ_PAYOUT_PRIVATE_KEY?.trim()
  if (!privateKey) {
    const message = 'NIMIQ_PAYOUT_PRIVATE_KEY is not configured; no refund was sent.'
    await markSettlementFailed(contestId, message)
    return { status: 'failed', unallocatedPrizeNim: recorded.unallocatedPrizeNim, txHash: null, errorMessage: message }
  }

  const depositAddress = process.env.NIMIQ_DEPOSIT_ADDRESS?.trim().replace(/\s+/g, '').toUpperCase()
  if (depositAddress && addressFromPrivateKeyHex(privateKey) !== depositAddress) {
    const message = 'NIMIQ_PAYOUT_PRIVATE_KEY does not match NIMIQ_DEPOSIT_ADDRESS; refusing to sign.'
    await markSettlementFailed(contestId, message)
    return { status: 'failed', unallocatedPrizeNim: recorded.unallocatedPrizeNim, txHash: null, errorMessage: message }
  }

  try {
    const recipient = await findCreatorAddress(contest.creatorId)
    if (!recipient) throw new Error('Sponsor wallet address could not be found for this contest')

    let txHash = recorded.settlementTxHash

    if (!txHash) {
      await markSettlementProcessing(contestId)

      txHash = await signAndBroadcast({
        privateKey,
        recipient,
        valueNim: recorded.unallocatedPrizeNim as string,
        data: settlementTransactionData(contestId),
      })

      await markSettlementTxHash(contestId, txHash, 'Broadcast accepted; waiting for chain finality.')
    }

    const finalized = await waitForPayoutFinality(txHash)
    if (!finalized) {
      const message = 'Broadcast accepted; finality not reached within the polling window.'
      await markSettlementTxHash(contestId, txHash, message)
      return { status: 'processing', unallocatedPrizeNim: recorded.unallocatedPrizeNim, txHash, errorMessage: message }
    }

    await markSettlementRefunded(contestId)
    return { status: 'refunded', unallocatedPrizeNim: recorded.unallocatedPrizeNim, txHash, errorMessage: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Settlement refund failed'
    await markSettlementFailed(contestId, message)
    return {
      status: 'failed',
      unallocatedPrizeNim: recorded.unallocatedPrizeNim,
      txHash: recorded.settlementTxHash,
      errorMessage: message,
    }
  }
}
