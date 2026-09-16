import assert from 'node:assert'
import { computeUnallocatedPrizeNim } from './funding.js'
import type { Contest, LeaderboardEntry } from './types.js'

/**
 * Phase 5 self-check (D021/D022/D046): unallocated prize-pool settlement.
 * Pure-function test of computeUnallocatedPrizeNim — the money math must be
 * right before anything ever signs a refund transaction with it.
 */
function runSettlementSelfCheck() {
  console.log('Running Phase 5 Settlement Self-Check...')

  const baseContest: Contest = {
    id: 'c1',
    creatorId: 'sponsor-1',
    status: 'results_finalized',
    title: 'Settlement Test',
    description: '',
    imageUrl: null,
    questions: [],
    registrationOpenAt: null,
    registrationCloseAt: null,
    quizStartAt: null,
    quizDurationSeconds: null,
    isFree: false,
    prizePoolNim: '1000',
    winnerCount: 3,
    prizeDistribution: [
      { rank: 1, amountNim: '500' },
      { rank: 2, amountNim: '300' },
      { rank: 3, amountNim: '200' },
    ],
    entryRequirements: [],
    resources: [],
    fundingStatus: 'confirmed',
    fundingTxHash: 'tx1',
    fundedAmountNim: '1100',
    fundedAt: '2026-09-14T00:00:00Z',
    cancelledAt: null,
    refundOwedNim: null,
    unallocatedPrizeNim: null,
    settlementStatus: 'not_applicable',
    settlementTxHash: null,
    settlementErrorMessage: null,
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
  }

  function entry(rank: number): LeaderboardEntry {
    return {
      rank,
      userId: `u${rank}`,
      username: null,
      address: `NQ${rank}`,
      score: 100 - rank,
      completionSeconds: 60,
      submittedAt: '2026-09-14T00:05:00Z',
      prizeNim: null,
    }
  }

  // Test 1: Zero participants -> entire prize pool is unallocated (D021).
  assert.strictEqual(computeUnallocatedPrizeNim(baseContest, []), '1000')

  // Test 2: Fewer finishers than winner slots -> only the unfilled tail (D022).
  assert.strictEqual(computeUnallocatedPrizeNim(baseContest, [entry(1)]), '500')
  assert.strictEqual(computeUnallocatedPrizeNim(baseContest, [entry(1), entry(2)]), '200')

  // Test 3: Exactly enough finishers -> nothing unallocated.
  assert.strictEqual(computeUnallocatedPrizeNim(baseContest, [entry(1), entry(2), entry(3)]), '0')

  // Test 4: More finishers than winner slots -> still nothing unallocated
  // (extra participants beyond winnerCount don't create extra prize money).
  assert.strictEqual(
    computeUnallocatedPrizeNim(baseContest, [entry(1), entry(2), entry(3), entry(4)]),
    '0'
  )

  // Test 5: Free contest -> never a settlement, regardless of participants.
  const freeContest: Contest = { ...baseContest, isFree: true, prizePoolNim: null, prizeDistribution: [] }
  assert.strictEqual(computeUnallocatedPrizeNim(freeContest, []), '0')

  // Test 6: A contest with no prize pool configured -> never a settlement.
  const noPoolContest: Contest = { ...baseContest, prizePoolNim: null }
  assert.strictEqual(computeUnallocatedPrizeNim(noPoolContest, []), '0')

  console.log('All 6 settlement self-check assertions passed successfully.')
}

runSettlementSelfCheck()
