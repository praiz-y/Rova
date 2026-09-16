// src/users/userHistory.ts
import { pool } from '../db/pool.js';


/**
 * Get registration attempts, quiz attempts, scores, and winner info for a user.
 */
export async function getUserHistory(userId: string) {
  const registrations = await pool.query(
    `SELECT cr.id, cr.contest_id, c.title, c.quiz_start_at, c.quiz_duration_seconds, cr.created_at as registered_at
     FROM contest_registrations cr
     JOIN contests c ON c.id = cr.contest_id
     WHERE cr.user_id = $1`,
    [userId]
  );

  const attempts = await pool.query(
    `SELECT qa.id, qa.contest_id, qa.started_at, qa.submitted_at, qa.score, qa.completion_seconds
     FROM quiz_attempts qa
     WHERE qa.user_id = $1`,
    [userId]
  );

  const payouts = await pool.query(
    `SELECT pp.id, pp.contest_id, pp.amount_nim, pp.status, pp.tx_hash
     FROM prize_payouts pp
     WHERE pp.user_id = $1`,
    [userId]
  );

  return {
    registrations: registrations.rows,
    attempts: attempts.rows,
    payouts: payouts.rows,
  };
}

/**
 * Get contests where the user is the sponsor (creator).
 */
export async function getSponsoredContests(userId: string) {
  const contests = await pool.query(
    `SELECT id, title, status, prize_pool_nim, created_at, updated_at
     FROM contests
     WHERE creator_id = $1`,
    [userId]
  );

  return contests.rows;
}
