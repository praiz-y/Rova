import { pool } from '../db/pool.js'
import { findContestById } from './repository.js'
import { processContestPayouts, processContestSettlement } from './payouts.js'
import { calculateScore } from './gameplay.js'
import type { Contest } from './types.js'

export function evaluateContestStatus(contest: Contest, now = new Date()): string {
  if (
    contest.status === 'draft' ||
    contest.status === 'cancelled' ||
    contest.status === 'completed' ||
    contest.status === 'payouts'
  ) {
    return contest.status
  }

  if (!contest.registrationOpenAt || !contest.registrationCloseAt || !contest.quizStartAt || !contest.quizDurationSeconds) {
    return contest.status
  }

  const regOpen = new Date(contest.registrationOpenAt).getTime()
  const regClose = new Date(contest.registrationCloseAt).getTime()
  const quizStart = new Date(contest.quizStartAt).getTime()
  const quizEnd = quizStart + contest.quizDurationSeconds * 1000
  const current = now.getTime()

  if (current < regOpen) return 'published'
  if (current >= regOpen && current < regClose) return 'registration_open'
  if (current >= regClose && current < quizStart) return 'registration_closed'
  if (current >= quizStart && current < quizEnd) return 'quiz_started'
  return 'quiz_closed'
}

/**
 * Auto-finalizes unsubmitted quiz attempts when the quiz duration expires.
 */
async function autoFinalizeUnsubmittedAttempts(contest: Contest): Promise<void> {
  const attempts = await pool.query<{ id: string; answers: unknown }>(
    'SELECT id, answers FROM quiz_attempts WHERE contest_id = $1 AND submitted_at IS NULL',
    [contest.id]
  )

  for (const row of attempts.rows) {
    const rawAnswers = (row.answers as any[]) ?? []
    const score = calculateScore(contest.questions, rawAnswers)

    await pool.query(
      `UPDATE quiz_attempts
       SET submitted_at = now(),
           score = $1,
           completion_seconds = COALESCE($2, 0),
           updated_at = now()
       WHERE id = $3 AND submitted_at IS NULL`,
      [score, contest.quizDurationSeconds, row.id]
    )
  }
}

/**
 * Synchronizes a contest's state machine transitions cleanly.
 */
export async function syncContestLifecycleState(contestId: string): Promise<Contest | null> {
  const contest = await findContestById(contestId)
  if (!contest) return null

  let targetStatus = evaluateContestStatus(contest)

  if (targetStatus !== contest.status) {
    await pool.query(
      `UPDATE contests SET status = $1, updated_at = now() WHERE id = $2`,
      [targetStatus, contestId]
    )
  }

  // Handle post-quiz lifecycle stages
  if (targetStatus === 'quiz_closed' || contest.status === 'quiz_closed') {
    await autoFinalizeUnsubmittedAttempts(contest)
    targetStatus = 'results_finalized'
    await pool.query(
      `UPDATE contests SET status = 'results_finalized', updated_at = now() WHERE id = $1`,
      [contestId]
    )
  }

  if (targetStatus === 'results_finalized') {
    if (contest.isFree) {
      await pool.query(
        `UPDATE contests SET status = 'completed', updated_at = now() WHERE id = $1`,
        [contestId]
      )
    } else {
      await processContestPayouts(contestId)
      // D021/D022/D046: refund whatever prize-pool NIM went unallocated
      // (fewer finishers than winner slots, or zero finishers) so the
      // sponsor's funds don't sit stranded waiting for a manual click.
      await processContestSettlement(contestId)
    }
  }

  return findContestById(contestId)
}

/**
 * Scans all active contests and synchronizes lifecycle states.
 */
export async function syncAllContestLifecycles(): Promise<{ syncedCount: number }> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM contests WHERE status NOT IN ('draft', 'cancelled', 'completed')`
  )

  let syncedCount = 0
  for (const row of result.rows) {
    await syncContestLifecycleState(row.id)
    syncedCount++
  }

  return { syncedCount }
}

/**
 * Background ticker running periodic lifecycle synchronization.
 */
export function startLifecycleTicker(intervalMs = 15000): NodeJS.Timeout {
  // Run catch-up immediately on start
  syncAllContestLifecycles().catch((err) => {
    console.error('Initial lifecycle sync error:', err)
  })

  return setInterval(() => {
    syncAllContestLifecycles().catch((err) => {
      console.error('Lifecycle ticker error:', err)
    })
  }, intervalMs)
}
