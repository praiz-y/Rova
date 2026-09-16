// src/contests/analyticsService.ts
import { pool } from '../db/pool.js';


/**
 * Simple analytics for the admin dashboard.
 * Returns an object with a few key metrics used in the Phase 11 analytics UI.
 */
export async function getContestAnalytics() {
  // Total contests
  const totalContestsRes = await pool.query<{ count: string }>('SELECT COUNT(*) FROM contests');
  const totalContests = parseInt(totalContestsRes.rows[0].count, 10);

  // Total participants (unique users across all contest_registrations)
  const totalParticipantsRes = await pool.query<{ count: string }>(
    'SELECT COUNT(DISTINCT user_id) FROM contest_registrations'
  );
  const totalParticipants = parseInt(totalParticipantsRes.rows[0].count, 10);

  // Total payouts (rows in payouts table – assuming a table named payouts)
  const payoutsRes = await pool.query<{ count: string }>('SELECT COUNT(*) FROM payouts');
  const totalPayouts = parseInt(payoutsRes.rows[0].count, 10);

  // Successful payouts (status = "paid" assumed)
  const successfulRes = await pool.query<{ count: string }>(
    "SELECT COUNT(*) FROM payouts WHERE status = 'paid'"
  );
  const successfulPayouts = parseInt(successfulRes.rows[0].count, 10);

  const payoutSuccessRate = totalPayouts ? (successfulPayouts / totalPayouts) * 100 : 0;

  // Contest status distribution
  const statusDistRes = await pool.query<{ status: string; count: string }>(
    'SELECT status, COUNT(*) as count FROM contests GROUP BY status'
  );
  const statusDistribution = statusDistRes.rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10);
    return acc;
  }, {} as Record<string, number>);

  return {
    totalContests,
    totalParticipants,
    totalPayouts,
    successfulPayouts,
    payoutSuccessRate,
    statusDistribution,
  };
}

/**
 * Contest-level analytics for a specific contest ID.
 * Aggregates registration trend, prize distribution, payout health, and submission rate.
 */
export async function getContestAnalyticsById(contestId: string) {
  // 1. Registration Trend (grouped by day)
  const trendRes = await pool.query<{ date: string; count: string }>(
    `SELECT DATE_TRUNC('day', created_at)::text as date, COUNT(*) as count
     FROM contest_registrations
     WHERE contest_id = $1
     GROUP BY DATE_TRUNC('day', created_at)
     ORDER BY date ASC`,
    [contestId]
  );
  const registrationTrend = trendRes.rows.map(r => ({
    date: r.date ? r.date.split('T')[0] : 'Unknown',
    count: parseInt(r.count, 10),
  }));

  // 2. Prize distribution & metadata
  const contestRes = await pool.query<{ prize_pool_nim: string | null; prize_distribution: any; winner_count: number | null }>(
    'SELECT prize_pool_nim, prize_distribution, winner_count FROM contests WHERE id = $1',
    [contestId]
  );
  const contest = contestRes.rows[0];
  const prizePoolNim = contest?.prize_pool_nim ?? '0';
  const prizeDistribution = Array.isArray(contest?.prize_distribution) ? contest.prize_distribution : [];

  // 3. Payout Health
  const payoutRes = await pool.query<{ status: string; count: string }>(
    'SELECT status, COUNT(*) as count FROM prize_payouts WHERE contest_id = $1 GROUP BY status',
    [contestId]
  );
  const payoutHealth = {
    successful: 0,
    pending: 0,
    failed: 0,
    total: 0,
  };
  payoutRes.rows.forEach(r => {
    const count = parseInt(r.count, 10);
    payoutHealth.total += count;
    if (r.status === 'confirmed' || r.status === 'paid') {
      payoutHealth.successful += count;
    } else if (r.status === 'failed') {
      payoutHealth.failed += count;
    } else {
      payoutHealth.pending += count;
    }
  });

  // 4. Submission & Completion Rate
  const regCountRes = await pool.query<{ count: string }>(
    'SELECT COUNT(*) FROM contest_registrations WHERE contest_id = $1',
    [contestId]
  );
  const totalRegistered = parseInt(regCountRes.rows[0]?.count ?? '0', 10);

  const subCountRes = await pool.query<{ count: string }>(
    'SELECT COUNT(*) FROM quiz_attempts WHERE contest_id = $1 AND submitted_at IS NOT NULL',
    [contestId]
  );
  const totalSubmitted = parseInt(subCountRes.rows[0]?.count ?? '0', 10);

  const completionRate = totalRegistered > 0 ? (totalSubmitted / totalRegistered) * 100 : 0;

  return {
    contestId,
    registrationTrend,
    prizeInfo: {
      prizePoolNim,
      winnerCount: contest?.winner_count ?? 0,
      distribution: prizeDistribution,
    },
    payoutHealth,
    submissionRate: {
      registered: totalRegistered,
      submitted: totalSubmitted,
      completionRatePercentage: Math.round(completionRate * 10) / 10,
    },
  };
}

