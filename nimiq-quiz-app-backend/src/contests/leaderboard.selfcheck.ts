import assert from 'node:assert'
import type { LeaderboardEntry, PrizeDistributionEntry } from './types.js'

interface RawAttempt {
  userId: string
  username: string | null
  address: string
  score: number
  completionSeconds: number
  submittedAt: string
}

function sortAndAssignLeaderboard(
  attempts: RawAttempt[],
  isFree: boolean,
  prizeDistribution: PrizeDistributionEntry[]
): LeaderboardEntry[] {
  // Sort per D014:
  // 1. Score DESC
  // 2. Completion time ASC
  // 3. Submitted timestamp ASC
  const sorted = [...attempts].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.completionSeconds !== b.completionSeconds) return a.completionSeconds - b.completionSeconds
    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  })

  const prizeMap = new Map<number, string>()
  if (!isFree && prizeDistribution) {
    for (const dist of prizeDistribution) {
      prizeMap.set(dist.rank, dist.amountNim)
    }
  }

  return sorted.map((row, index) => {
    const rank = index + 1
    return {
      rank,
      userId: row.userId,
      username: row.username,
      address: row.address,
      score: row.score,
      completionSeconds: row.completionSeconds,
      submittedAt: row.submittedAt,
      prizeNim: prizeMap.get(rank) ?? null,
    }
  })
}

function runLeaderboardSelfCheck() {
  console.log('Running Phase 6 Leaderboard Self-Check...')

  const mockAttempts: RawAttempt[] = [
    {
      userId: 'user_b',
      username: 'Bob',
      address: 'NQ02...',
      score: 180,
      completionSeconds: 308, // 05:08
      submittedAt: '2026-09-10T12:05:08Z',
    },
    {
      userId: 'user_a',
      username: 'Alice',
      address: 'NQ01...',
      score: 180,
      completionSeconds: 261, // 04:21 (faster tie-breaker)
      submittedAt: '2026-09-10T12:04:21Z',
    },
    {
      userId: 'user_c',
      username: 'Charlie',
      address: 'NQ03...',
      score: 170, // lower score (fast time should not beat score)
      completionSeconds: 235, // 03:55
      submittedAt: '2026-09-10T12:03:55Z',
    },
    {
      userId: 'user_d',
      username: 'Dave',
      address: 'NQ04...',
      score: 180,
      completionSeconds: 261, // exact tie with Alice on score and speed, later submittedAt
      submittedAt: '2026-09-10T12:04:22Z',
    },
  ]

  const prizeDistribution: PrizeDistributionEntry[] = [
    { rank: 1, amountNim: '500' },
    { rank: 2, amountNim: '300' },
    { rank: 3, amountNim: '200' },
  ]

  const result = sortAndAssignLeaderboard(mockAttempts, false, prizeDistribution)

  // Assert D014 ranking rules:
  // Rank 1: Alice (score 180, speed 261s, earlier timestamp)
  assert.strictEqual(result[0].userId, 'user_a', 'Rank 1 should be Alice')
  assert.strictEqual(result[0].rank, 1)
  assert.strictEqual(result[0].prizeNim, '500', 'Rank 1 prize should be 500 NIM')

  // Rank 2: Dave (score 180, speed 261s, later timestamp)
  assert.strictEqual(result[1].userId, 'user_d', 'Rank 2 should be Dave (tie-broken by timestamp)')
  assert.strictEqual(result[1].rank, 2)
  assert.strictEqual(result[1].prizeNim, '300', 'Rank 2 prize should be 300 NIM')

  // Rank 3: Bob (score 180, speed 308s)
  assert.strictEqual(result[2].userId, 'user_b', 'Rank 3 should be Bob (tied score, slower speed)')
  assert.strictEqual(result[2].rank, 3)
  assert.strictEqual(result[2].prizeNim, '200', 'Rank 3 prize should be 200 NIM')

  // Rank 4: Charlie (score 170 - speed cannot beat higher score per D014 example)
  assert.strictEqual(result[3].userId, 'user_c', 'Rank 4 should be Charlie (lower score)')
  assert.strictEqual(result[3].rank, 4)
  assert.strictEqual(result[3].prizeNim, null, 'Rank 4 has no prize allocation')

  console.log('✅ All 7 leaderboard self-check assertions passed successfully.')
}

runLeaderboardSelfCheck()
