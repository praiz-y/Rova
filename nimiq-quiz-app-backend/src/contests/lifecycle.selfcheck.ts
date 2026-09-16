import assert from 'node:assert'
import { evaluateContestStatus } from './lifecycle.js'
import type { Contest } from './types.js'

function runLifecycleSelfCheck() {
  console.log('Running Phase 8 Lifecycle Self-Check...')

  const baseContest: Contest = {
    id: 'c1',
    creatorId: 'u1',
    status: 'published',
    title: 'Nimiq Lifecycle Test',
    description: 'Testing D007 state machine',
    imageUrl: null,
    questions: [],
    registrationOpenAt: '2026-09-10T10:00:00Z',
    registrationCloseAt: '2026-09-10T11:00:00Z',
    quizStartAt: '2026-09-10T12:00:00Z',
    quizDurationSeconds: 600, // 10 mins (ends 12:10:00Z)
    isFree: true,
    prizePoolNim: null,
    winnerCount: null,
    prizeDistribution: [],
    entryRequirements: [],
    resources: [],
    fundingStatus: 'not_required',
    fundingTxHash: null,
    fundedAmountNim: null,
    fundedAt: null,
    cancelledAt: null,
    refundOwedNim: null,
    unallocatedPrizeNim: null,
    settlementStatus: 'not_applicable',
    settlementTxHash: null,
    settlementErrorMessage: null,
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-09-10T09:00:00Z',
  }

  // Test 1: Before registration opens -> 'published'
  const t1 = new Date('2026-09-10T09:30:00Z')
  assert.strictEqual(evaluateContestStatus(baseContest, t1), 'published')

  // Test 2: During registration window -> 'registration_open'
  const t2 = new Date('2026-09-10T10:30:00Z')
  assert.strictEqual(evaluateContestStatus(baseContest, t2), 'registration_open')

  // Test 3: Between registration close and quiz start -> 'registration_closed'
  const t3 = new Date('2026-09-10T11:30:00Z')
  assert.strictEqual(evaluateContestStatus(baseContest, t3), 'registration_closed')

  // Test 4: During quiz execution -> 'quiz_started'
  const t4 = new Date('2026-09-10T12:05:00Z')
  assert.strictEqual(evaluateContestStatus(baseContest, t4), 'quiz_started')

  // Test 5: After quiz end -> 'quiz_closed'
  const t5 = new Date('2026-09-10T12:15:00Z')
  assert.strictEqual(evaluateContestStatus(baseContest, t5), 'quiz_closed')

  // Test 6: Draft contests do not auto-advance
  const draftContest = { ...baseContest, status: 'draft' }
  assert.strictEqual(evaluateContestStatus(draftContest, t4), 'draft')

  console.log('✅ All 6 lifecycle self-check assertions passed successfully.')
}

runLifecycleSelfCheck()
