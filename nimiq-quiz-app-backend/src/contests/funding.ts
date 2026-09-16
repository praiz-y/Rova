/**
 * D042 funding logic: fee math, the contest-reference embedded in deposit
 * transactions, and matching incoming chain transactions to a contest.
 *
 * Cancellation math is computed here (D020), but NOT executed — actually
 * broadcasting a refund transaction needs the isolated payout-signing
 * module Phase 7 builds (D042). `cancelContest` in repository.ts only
 * records that a refund is owed; it does not send one. Don't add refund
 * broadcasting here without also building that signing module — see
 * DECISIONS.md D042's "Alternatives Considered" on why signing is kept
 * isolated from general application code.
 */
import { getIncomingTransactions, isTransactionFinalized } from '../blockchain/nimiqRpc.js'
import type { Contest, LeaderboardEntry } from './types.js'

const LUNA_PER_NIM = 100_000n
const PLATFORM_FEE_RATE_PERCENT = 10n // D019
const CANCELLATION_FEE_RATE_PERCENT = 10n // D020

export function nimToLuna(nim: string): bigint {
  const [whole, frac = ''] = nim.split('.')
  const fracPadded = (frac + '00000').slice(0, 5)
  return BigInt(whole || '0') * LUNA_PER_NIM + BigInt(fracPadded || '0')
}

export function lunaToNim(luna: bigint): string {
  const whole = luna / LUNA_PER_NIM
  const frac = (luna % LUNA_PER_NIM).toString().padStart(5, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export interface SponsorPayment {
  prizePoolNim: string
  platformFeeNim: string
  totalNim: string
}

export function computeSponsorPayment(prizePoolNim: string): SponsorPayment {
  const poolLuna = nimToLuna(prizePoolNim)
  const feeLuna = (poolLuna * PLATFORM_FEE_RATE_PERCENT) / 100n
  return {
    prizePoolNim: lunaToNim(poolLuna),
    platformFeeNim: lunaToNim(feeLuna),
    totalNim: lunaToNim(poolLuna + feeLuna),
  }
}

export interface CancellationRefund {
  prizePoolNim: string
  platformFeeNim: string
  cancellationFeeNim: string
  refundNim: string
}

/**
 * D020 example math: pool 1000, platform fee 100, cancellation fee 100,
 * refund 900. Only the cancellation fee reduces the refund from the pool —
 * the platform fee was already taken out of the separate total sponsor
 * payment (D019) when the contest was funded, it's not deducted again
 * here. `platformFeeNim` is included only for display (so the UI can show
 * the sponsor the full picture of what they paid vs. what they forfeit),
 * not because it's subtracted here.
 */
export function computeCancellationRefund(prizePoolNim: string): CancellationRefund {
  const poolLuna = nimToLuna(prizePoolNim)
  const platformFeeLuna = (poolLuna * PLATFORM_FEE_RATE_PERCENT) / 100n
  const cancellationFeeLuna = (poolLuna * CANCELLATION_FEE_RATE_PERCENT) / 100n
  const refundLuna = poolLuna - cancellationFeeLuna
  return {
    prizePoolNim: lunaToNim(poolLuna),
    platformFeeNim: lunaToNim(platformFeeLuna),
    cancellationFeeNim: lunaToNim(cancellationFeeLuna),
    refundNim: lunaToNim(refundLuna),
  }
}

/** Compact, fits well within Nimiq's 64-byte transaction data field. */
export function contestDepositReference(contestId: string): string {
  return contestId.replace(/-/g, '')
}

/**
 * RPC returns `recipientData` as hex-encoded bytes, not plain text — the
 * Mini App's `sendBasicTransactionWithData({ data })` takes a plain string,
 * but confirmed against a real mainnet transaction (decoded a live tx's
 * recipientData and got back readable ASCII) that the wire format is hex.
 * Comparing the raw reference string against `tx.recipientData` directly
 * would silently never match.
 */
function decodeHexData(hex: string): string {
  try {
    return Buffer.from(hex, 'hex').toString('utf-8')
  } catch {
    return ''
  }
}

/**
 * D021/D022/D046: sums the prize-pool NIM allocated to winner ranks that
 * have no matching finisher on the real leaderboard — zero participants
 * means every rank is unallocated (the whole pool), fewer finishers than
 * winner slots means only the unfilled tail is. Never creates or assumes a
 * winner; only sums amounts already committed in `prizeDistribution`.
 */
export function computeUnallocatedPrizeNim(contest: Contest, leaderboard: LeaderboardEntry[]): string {
  if (contest.isFree || !contest.prizePoolNim) return '0'

  const finishedRanks = new Set(leaderboard.map((entry) => entry.rank))
  let unallocatedLuna = 0n
  for (const dist of contest.prizeDistribution ?? []) {
    if (!finishedRanks.has(dist.rank)) {
      unallocatedLuna += nimToLuna(dist.amountNim)
    }
  }
  return lunaToNim(unallocatedLuna)
}

export interface FundingMatch {
  txHash: string
  amountNim: string
  blockNumber: number
}

export interface FundingCheckResult {
  /** A finalized transaction that fully covers the required total. */
  match: FundingMatch | null
  /**
   * A finalized transaction that matches this contest's reference but
   * falls short of the required total (D021/D022-adjacent: Phase 5's
   * "underfunded deposit must be clearly reported, not silently treated
   * as funded or silently stuck forever"). If multiple partial sends
   * exist, the largest is reported. Only meaningful when `match` is null.
   */
  underfunded: FundingMatch | null
}

/**
 * Looks for a finalized incoming transaction to `depositAddress` whose data
 * matches this contest's reference. Distinguishes "no matching deposit
 * found yet" from "a matching deposit arrived but it's short" — the two
 * previously looked identical (both just "pending" forever), which is a
 * real trap for a sponsor who sent the wrong amount and would otherwise
 * see no explanation at all.
 */
export async function checkFundingTransactions(
  contest: Contest,
  depositAddress: string
): Promise<FundingCheckResult> {
  if (contest.isFree || !contest.prizePoolNim) return { match: null, underfunded: null }

  const reference = contestDepositReference(contest.id)
  const { totalNim } = computeSponsorPayment(contest.prizePoolNim)
  const requiredLuna = nimToLuna(totalNim)

  const transactions = await getIncomingTransactions(depositAddress)

  let underfunded: FundingMatch | null = null

  for (const tx of transactions) {
    if (decodeHexData(tx.recipientData) !== reference) continue
    if (tx.blockNumber == null) continue
    const finalized = await isTransactionFinalized(tx.blockNumber)
    if (!finalized) continue

    const value = BigInt(tx.value)
    const candidate: FundingMatch = { txHash: tx.hash, amountNim: lunaToNim(value), blockNumber: tx.blockNumber }

    if (value >= requiredLuna) {
      return { match: candidate, underfunded: null }
    }
    if (!underfunded || value > nimToLuna(underfunded.amountNim)) {
      underfunded = candidate
    }
  }

  return { match: null, underfunded }
}
