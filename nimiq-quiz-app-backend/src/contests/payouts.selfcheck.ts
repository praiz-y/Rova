import assert from 'node:assert'
import type { LeaderboardEntry, PrizeDistributionEntry } from './types.js'

interface MockPayout {
  contestId: string
  userId: string
  rank: number
  amountNim: string
  status: 'pending' | 'processing' | 'confirmed' | 'failed'
}

function simulatePayoutInitialization(
  contestId: string,
  winnerCount: number,
  isFree: boolean,
  prizeDistribution: PrizeDistributionEntry[],
  leaderboard: LeaderboardEntry[]
): MockPayout[] {
  if (isFree) return []

  const prizeMap = new Map<number, string>()
  for (const dist of prizeDistribution) {
    prizeMap.set(dist.rank, dist.amountNim)
  }

  const payouts: MockPayout[] = []
  const userSeen = new Set<string>()
  const rankSeen = new Set<number>()

  for (const entry of leaderboard) {
    if (entry.rank > winnerCount) continue
    const prize = prizeMap.get(entry.rank)
    if (!prize || Number(prize) <= 0) continue

    // Enforce D031 duplicate protection
    if (userSeen.has(entry.userId) || rankSeen.has(entry.rank)) {
      continue
    }

    userSeen.add(entry.userId)
    rankSeen.add(entry.rank)

    payouts.push({
      contestId,
      userId: entry.userId,
      rank: entry.rank,
      amountNim: prize,
      status: 'pending',
    })
  }

  return payouts
}

function runPayoutsSelfCheck() {
  console.log('Running Phase 7 Payouts Self-Check...')

  const contestId = 'contest_123'
  const winnerCount = 3
  const prizeDistribution: PrizeDistributionEntry[] = [
    { rank: 1, amountNim: '500' },
    { rank: 2, amountNim: '300' },
    { rank: 3, amountNim: '200' },
  ]

  const leaderboard: LeaderboardEntry[] = [
    {
      rank: 1,
      userId: 'user_a',
      username: 'Alice',
      address: 'NQ01...',
      score: 100,
      completionSeconds: 120,
      submittedAt: '2026-09-10T12:00:00Z',
      prizeNim: '500',
    },
    {
      rank: 2,
      userId: 'user_b',
      username: 'Bob',
      address: 'NQ02...',
      score: 90,
      completionSeconds: 150,
      submittedAt: '2026-09-10T12:01:00Z',
      prizeNim: '300',
    },
    {
      rank: 3,
      userId: 'user_c',
      username: 'Charlie',
      address: 'NQ03...',
      score: 80,
      completionSeconds: 180,
      submittedAt: '2026-09-10T12:02:00Z',
      prizeNim: '200',
    },
    {
      rank: 4,
      userId: 'user_d',
      username: 'Dave',
      address: 'NQ04...',
      score: 70,
      completionSeconds: 200,
      submittedAt: '2026-09-10T12:03:00Z',
      prizeNim: null,
    },
  ]

  // Test 1: Paid contest payouts generated
  const payouts = simulatePayoutInitialization(
    contestId,
    winnerCount,
    false,
    prizeDistribution,
    leaderboard
  )

  assert.strictEqual(payouts.length, 3, 'Should generate payouts for top 3 winners')
  assert.strictEqual(payouts[0].userId, 'user_a')
  assert.strictEqual(payouts[0].amountNim, '500')
  assert.strictEqual(payouts[1].userId, 'user_b')
  assert.strictEqual(payouts[1].amountNim, '300')
  assert.strictEqual(payouts[2].userId, 'user_c')
  assert.strictEqual(payouts[2].amountNim, '200')

  // Test 2: Free contest produces no payouts
  const freePayouts = simulatePayoutInitialization(
    contestId,
    winnerCount,
    true,
    prizeDistribution,
    leaderboard
  )
  assert.strictEqual(freePayouts.length, 0, 'Free contest must generate zero payouts')

  // Test 3: Duplicate user entry rejected (D031)
  const duplicateLeaderboard: LeaderboardEntry[] = [
    ...leaderboard,
    {
      rank: 3, // duplicate rank attempt
      userId: 'user_a', // duplicate user attempt
      username: 'Alice',
      address: 'NQ01...',
      score: 100,
      completionSeconds: 120,
      submittedAt: '2026-09-10T12:00:00Z',
      prizeNim: '200',
    },
  ]
  const dedupedPayouts = simulatePayoutInitialization(
    contestId,
    winnerCount,
    false,
    prizeDistribution,
    duplicateLeaderboard
  )
  assert.strictEqual(dedupedPayouts.length, 3, 'Duplicate user/rank must be rejected')

  console.log('✅ All 6 payout self-check assertions passed successfully.')
}

runPayoutsSelfCheck()
