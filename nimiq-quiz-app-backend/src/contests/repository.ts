import { pool } from '../db/pool.js'
import type {
  Contest,
  ContestDraftInput,
  ContestRegistration,
  DiscoveryCategory,
  LeaderboardEntry,
  PublicContest,
  PublicContestStats,
} from './types.js'


interface ContestRow {
  id: string
  creator_id: string
  status: string
  title: string
  description: string
  image_url: string | null
  questions: unknown
  registration_open_at: string | null
  registration_close_at: string | null
  quiz_start_at: string | null
  quiz_duration_seconds: number | null
  is_free: boolean
  prize_pool_nim: string | null
  winner_count: number | null
  prize_distribution: unknown
  entry_requirements: string | null
  resources: unknown
  funding_status: string
  funding_tx_hash: string | null
  funded_amount_nim: string | null
  funded_at: string | null
  cancelled_at: string | null
  refund_owed_nim: string | null
  unallocated_prize_nim: string | null
  settlement_status: string
  settlement_tx_hash: string | null
  settlement_error_message: string | null
  created_at: string
  updated_at: string
}

interface PublicContestRow extends ContestRow {
  sponsor_username: string | null
  sponsor_address: string
  registration_count: number | string
  question_count: number | string
}

interface RegistrationRow {
  id: string
  contest_id: string
  user_id: string
  requirements_confirmed: boolean
  completed_requirement_ids: unknown
  created_at: string
}

function parseEntryRequirements(raw: string | null): Contest['entryRequirements'] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Keep legacy text readable until its creator saves the new task format.
    return [{ id: 'legacy-requirement', type: 'custom', title: 'Complete the sponsor requirements', url: 'https://nimiq.com', description: raw }]
  }
}

function toContest(row: ContestRow): Contest {
  return {
    id: row.id,
    creatorId: row.creator_id,
    status: row.status,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    questions: row.questions as Contest['questions'],
    registrationOpenAt: row.registration_open_at,
    registrationCloseAt: row.registration_close_at,
    quizStartAt: row.quiz_start_at,
    quizDurationSeconds: row.quiz_duration_seconds,
    isFree: row.is_free,
    prizePoolNim: row.prize_pool_nim,
    winnerCount: row.winner_count,
    prizeDistribution: row.prize_distribution as Contest['prizeDistribution'],
    entryRequirements: parseEntryRequirements(row.entry_requirements),
    resources: (row.resources ?? []) as Contest['resources'],
    fundingStatus: row.funding_status as Contest['fundingStatus'],
    fundingTxHash: row.funding_tx_hash,
    fundedAmountNim: row.funded_amount_nim,
    fundedAt: row.funded_at,
    cancelledAt: row.cancelled_at,
    refundOwedNim: row.refund_owed_nim,
    unallocatedPrizeNim: row.unallocated_prize_nim,
    settlementStatus: row.settlement_status as Contest['settlementStatus'],
    settlementTxHash: row.settlement_tx_hash,
    settlementErrorMessage: row.settlement_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function discoveryCategoryFor(row: ContestRow, now = new Date()): DiscoveryCategory | null {
  if (row.status === 'completed') return 'completed'
  if (!row.quiz_start_at || !row.quiz_duration_seconds) return null

  const start = new Date(row.quiz_start_at).getTime()
  const end = start + row.quiz_duration_seconds * 1000
  const current = now.getTime()

  if (current < start) return 'upcoming'
  if (current < end) return 'ongoing'
  return null
}

function toPublicContest(row: PublicContestRow): PublicContest {
  return {
    id: row.id,
    status: row.status,
    discoveryCategory: discoveryCategoryFor(row),
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    registrationOpenAt: row.registration_open_at,
    registrationCloseAt: row.registration_close_at,
    quizStartAt: row.quiz_start_at,
    quizDurationSeconds: row.quiz_duration_seconds,
    isFree: row.is_free,
    prizePoolNim: row.prize_pool_nim,
    winnerCount: row.winner_count,
    prizeDistribution: row.prize_distribution as PublicContest['prizeDistribution'],
    entryRequirements: parseEntryRequirements(row.entry_requirements),
    registrationCount: Number(row.registration_count ?? 0),
    questionCount: Number(row.question_count ?? 0),
    resources: (row.resources ?? []) as PublicContest['resources'],
    sponsor: {
      username: row.sponsor_username,
      address: row.sponsor_address,
    },
  }
}

function toRegistration(row: RegistrationRow): ContestRegistration {
  return {
    id: row.id,
    contestId: row.contest_id,
    userId: row.user_id,
    requirementsConfirmed: row.requirements_confirmed,
    completedRequirementIds: Array.isArray(row.completed_requirement_ids) ? row.completed_requirement_ids as string[] : [],
    createdAt: row.created_at,
  }
}

const PUBLIC_CONTEST_STATUSES = [
  'published',
  'registration_open',
  'registration_closed',
  'quiz_started',
  'quiz_closed',
  'results_finalized',
  'payouts',
  'completed',
]

const PUBLIC_CONTEST_SELECT =
  'SELECT c.*, u.username AS sponsor_username, u.address AS sponsor_address, ' +
  '(SELECT COUNT(*) FROM contest_registrations cr WHERE cr.contest_id = c.id) AS registration_count, ' +
  'jsonb_array_length(c.questions) AS question_count ' +
  'FROM contests c JOIN users u ON u.id = c.creator_id '

export async function createContestDraft(creatorId: string, input: ContestDraftInput): Promise<Contest> {
  const isFree = input.isFree ?? true
  const result = await pool.query<ContestRow>(
    `INSERT INTO contests (
       creator_id, title, description, image_url, questions,
       registration_open_at, registration_close_at, quiz_start_at, quiz_duration_seconds,
       is_free, prize_pool_nim, winner_count, prize_distribution, entry_requirements,
       resources, funding_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      creatorId,
      input.title ?? '',
      input.description ?? '',
      input.imageUrl ?? null,
      JSON.stringify(input.questions ?? []),
      input.registrationOpenAt ?? null,
      input.registrationCloseAt ?? null,
      input.quizStartAt ?? null,
      input.quizDurationSeconds ?? null,
      isFree,
      input.prizePoolNim ?? null,
      input.winnerCount ?? null,
      JSON.stringify(input.prizeDistribution ?? []),
      JSON.stringify(input.entryRequirements ?? []),
      JSON.stringify(input.resources ?? []),
      // Must be set explicitly at creation — the column default alone
      // ('not_required') is wrong for a paid contest and, unlike the
      // free case, nothing else corrects it until a real deposit lands.
      isFree ? 'not_required' : 'pending',
    ]
  )
  return toContest(result.rows[0])
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id)
}

export async function findContestById(id: string): Promise<Contest | null> {
  if (!isValidUuid(id)) return null
  const result = await pool.query<ContestRow>('SELECT * FROM contests WHERE id = $1', [id])
  return result.rows[0] ? toContest(result.rows[0]) : null
}

export async function findPublicContestById(id: string): Promise<PublicContest | null> {
  if (!isValidUuid(id)) return null
  const result = await pool.query<PublicContestRow>(
    PUBLIC_CONTEST_SELECT + 'WHERE c.id = $1 AND c.status = ANY($2::text[])',
    [id, PUBLIC_CONTEST_STATUSES]
  )
  return result.rows[0] ? toPublicContest(result.rows[0]) : null
}

export async function listPublicContests(category: DiscoveryCategory): Promise<PublicContest[]> {
  const now = new Date()
  const result = await pool.query<PublicContestRow>(
    PUBLIC_CONTEST_SELECT +
      "WHERE c.status = ANY($1::text[]) " +
      "AND ( " +
      "($2 = 'upcoming' AND c.status <> 'completed' AND c.quiz_start_at > $3) " +
      "OR ($2 = 'ongoing' AND c.status <> 'completed' " +
      "AND c.quiz_start_at <= $3 " +
      "AND c.quiz_start_at + (c.quiz_duration_seconds * INTERVAL '1 second') > $3) " +
      "OR ($2 = 'completed' AND c.status = 'completed') " +
      ") ORDER BY " +
      "CASE WHEN $2 = 'completed' THEN c.updated_at END DESC, " +
      "CASE WHEN $2 <> 'completed' THEN c.quiz_start_at END ASC",
    [PUBLIC_CONTEST_STATUSES, category, now]
  )
  return result.rows.map(toPublicContest)
}

/**
 * Real, aggregate numbers for a public stats display (e.g. the homepage
 * hero) — never a fabricated or rounded-up number. Reuses
 * PUBLIC_CONTEST_STATUSES so "what counts as a real, publicly-countable
 * contest" is defined in exactly one place. participantCount is a genuine
 * distinct-user count (not a sum of per-contest registrationCount, which
 * would double-count a player who joined more than one contest).
 */
export async function getPublicContestStats(): Promise<PublicContestStats> {
  const [contestResult, participantResult, payoutResult] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*) FROM contests WHERE status = ANY($1::text[])', [
      PUBLIC_CONTEST_STATUSES,
    ]),
    pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT cr.user_id) FROM contest_registrations cr
       JOIN contests c ON c.id = cr.contest_id
       WHERE c.status = ANY($1::text[])`,
      [PUBLIC_CONTEST_STATUSES]
    ),
    pool.query<{ sum: string | null }>("SELECT COALESCE(SUM(amount_nim), 0) AS sum FROM prize_payouts WHERE status = 'confirmed'"),
  ])
  return {
    contestCount: parseInt(contestResult.rows[0].count, 10),
    participantCount: parseInt(participantResult.rows[0].count, 10),
    nimWonNim: payoutResult.rows[0].sum ?? '0',
  }
}

export async function listContestsByCreator(creatorId: string): Promise<Contest[]> {
  const result = await pool.query<ContestRow>(
    'SELECT * FROM contests WHERE creator_id = $1 ORDER BY updated_at DESC',
    [creatorId]
  )
  return result.rows.map(toContest)
}

/**
 * Search contests with optional filters and pagination.
 * Filters: status, title (partial), sponsor (username), dateFrom, dateTo (ISO strings),
 *          prizePoolMin, prizePoolMax (numeric), currency (only NIM supported).
 * Pagination: limit, offset.
 * Returns { contests: Contest[], total: number }.
 */
export async function searchContests(
  filters: {
    status?: string;
    title?: string;
    sponsor?: string;
    dateFrom?: string;
    dateTo?: string;
    prizePoolMin?: number;
    prizePoolMax?: number;
    currency?: string;
  },
  pagination: { limit: number; offset: number }
): Promise<{ contests: Contest[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;
  let joinSponsor = '';
  if (filters.sponsor) {
    joinSponsor = 'JOIN users u ON u.id = c.creator_id';
    conditions.push(`u.username ILIKE $${idx}`);
    values.push(`%${filters.sponsor}%`);
    idx++;
  }
  if (filters.status) { conditions.push(`c.status = $${idx}`); values.push(filters.status); idx++; }
  if (filters.title) { conditions.push(`c.title ILIKE $${idx}`); values.push(`%${filters.title}%`); idx++; }
  if (filters.dateFrom) { conditions.push(`c.created_at >= $${idx}`); values.push(filters.dateFrom); idx++; }
  if (filters.dateTo) { conditions.push(`c.created_at <= $${idx}`); values.push(filters.dateTo); idx++; }
  if (filters.prizePoolMin !== undefined) { conditions.push(`c.prize_pool_nim >= $${idx}`); values.push(filters.prizePoolMin); idx++; }
  if (filters.prizePoolMax !== undefined) { conditions.push(`c.prize_pool_nim <= $${idx}`); values.push(filters.prizePoolMax); idx++; }
  if (filters.currency) {
    if (filters.currency.toUpperCase() !== 'NIM') {
      throw new Error('Unsupported currency filter; only NIM is supported');
    }
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // Total count
  const countQuery = `SELECT COUNT(*) FROM contests c ${joinSponsor} ${whereClause}`;
  const totalResult = await pool.query<{ count: string }>(countQuery, values);
  const total = parseInt(totalResult.rows[0].count, 10);
  // Fetch rows with pagination
  const selectQuery = `SELECT c.* FROM contests c ${joinSponsor} ${whereClause} ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(pagination.limit, pagination.offset);
  const result = await pool.query<ContestRow>(selectQuery, values);
  const contests = result.rows.map(toContest);
  return { contests, total };
}


/**
 * List registrations (participants) for a specific contest.
 */
export async function listRegistrationsByContest(contestId: string): Promise<ContestRegistration[]> {
  const result = await pool.query<RegistrationRow>(
    'SELECT * FROM contest_registrations WHERE contest_id = $1 ORDER BY created_at ASC',
    [contestId]
  );
  return result.rows.map(toRegistration);
}

/**
 * List registrations (participants) for a specific contest with pagination and optional search.
 * Returns participants (including username) and total count.
 */
export async function listRegistrationsByContestPaginated(
  contestId: string,
  opts: { page: number; limit: number; search?: string }
): Promise<{ participants: any[]; total: number }> {
  const { page, limit, search } = opts;
  const offset = (page - 1) * limit;
  const params: any[] = [contestId];
  let whereClause = 'WHERE cr.contest_id = $1';
  if (search && search.trim()) {
    const pattern = `%${search.trim()}%`;
    // Cast user_id (UUID) to text for ILIKE
    params.push(pattern, pattern);
    whereClause += ` AND (cr.user_id::text ILIKE $${params.length - 1} OR u.username ILIKE $${params.length})`;
  }
  // Total count
  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM contest_registrations cr JOIN users u ON u.id = cr.user_id ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].count, 10);
  // Fetch participants with pagination
  params.push(limit, offset);
  const query = `SELECT cr.*, u.username FROM contest_registrations cr JOIN users u ON u.id = cr.user_id ${whereClause} ORDER BY cr.created_at ASC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const result = await pool.query(query, params);
  const participants = result.rows.map(row => ({
    id: row.id,
    contestId: row.contest_id,
    userId: row.user_id,
    username: row.username,
    requirementsConfirmed: row.requirements_confirmed,
    createdAt: row.created_at,
  }));
  return { participants, total };
}


/**
 * Partial update — only fields present in `input` are touched. Only valid
 * while the contest is still a draft (D008); callers must check status.
 */
export async function updateContestDraft(id: string, input: ContestDraftInput): Promise<Contest | null> {
  const sets: string[] = []
  const values: unknown[] = []
  let i = 1

  const columnFor: Record<string, string> = {
    title: 'title',
    description: 'description',
    imageUrl: 'image_url',
    questions: 'questions',
    registrationOpenAt: 'registration_open_at',
    registrationCloseAt: 'registration_close_at',
    quizStartAt: 'quiz_start_at',
    quizDurationSeconds: 'quiz_duration_seconds',
    isFree: 'is_free',
    prizePoolNim: 'prize_pool_nim',
    winnerCount: 'winner_count',
    prizeDistribution: 'prize_distribution',
    entryRequirements: 'entry_requirements',
    resources: 'resources',
  }

  for (const [key, column] of Object.entries(columnFor)) {
    if (!(key in input)) continue
    const raw = (input as Record<string, unknown>)[key]
    const isJsonb = key === 'questions' || key === 'prizeDistribution' || key === 'resources' || key === 'entryRequirements'
    const value = isJsonb ? JSON.stringify(raw ?? []) : raw
    sets.push(`${column} = $${i}`)
    values.push(value)
    i++
  }

  // If economics changed, recompute funding_status rather than leaving it
  // stale. This deliberately downgrades an already-'confirmed' contest
  // back to 'pending'/'not_required' if isFree or the pool amount change
  // after confirmation — the old confirmation no longer proves the new
  // amount was actually paid (D023: never assume, re-verify).
  if ('isFree' in input || 'prizePoolNim' in input) {
    const current = await findContestById(id)
    const resolvedIsFree = input.isFree ?? current?.isFree ?? true
    sets.push(`funding_status = $${i}`)
    values.push(resolvedIsFree ? 'not_required' : 'pending')
    i++
    sets.push(`funding_tx_hash = NULL`, `funded_amount_nim = NULL`, `funded_at = NULL`)
  }

  if (sets.length === 0) {
    return findContestById(id)
  }

  sets.push(`updated_at = now()`)
  values.push(id)

  const result = await pool.query<ContestRow>(
    `UPDATE contests SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  )
  return result.rows[0] ? toContest(result.rows[0]) : null
}

export async function deleteContestDraft(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM contests WHERE id = $1', [id])
  return (result.rowCount ?? 0) > 0
}

export async function markContestFunded(
  id: string,
  txHash: string,
  amountNim: string
): Promise<Contest | null> {
  const result = await pool.query<ContestRow>(
    `UPDATE contests
     SET funding_status = 'confirmed', funding_tx_hash = $1, funded_amount_nim = $2,
         funded_at = now(), updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [txHash, amountNim, id]
  )
  return result.rows[0] ? toContest(result.rows[0]) : null
}

/**
 * Records a finalized deposit that matched this contest's reference but
 * fell short of the required total (Phase 5) — deliberately does NOT set
 * `funded_at`, since the contest isn't actually funded yet. Never
 * downgrades an already-`confirmed` contest: a later, additional deposit
 * that completes the total should go through `markContestFunded` instead,
 * and a stale underfunded check must not un-confirm real funding.
 */
export async function markContestUnderfunded(
  id: string,
  txHash: string,
  amountNim: string
): Promise<Contest | null> {
  const result = await pool.query<ContestRow>(
    `UPDATE contests
     SET funding_status = CASE WHEN funding_status = 'confirmed' THEN funding_status ELSE 'underfunded' END,
         funding_tx_hash = CASE WHEN funding_status = 'confirmed' THEN funding_tx_hash ELSE $1 END,
         funded_amount_nim = CASE WHEN funding_status = 'confirmed' THEN funded_amount_nim ELSE $2 END,
         updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [txHash, amountNim, id]
  )
  return result.rows[0] ? toContest(result.rows[0]) : null
}

export async function publishContest(id: string): Promise<Contest | null> {
  const result = await pool.query<ContestRow>(
    `UPDATE contests SET status = 'published', updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  )
  return result.rows[0] ? toContest(result.rows[0]) : null
}

/**
 * Records that a refund is owed (D020) — does NOT send one. See
 * funding.ts's module docstring for why actually broadcasting a refund
 * needs Phase 7's payout-signing module, not this function.
 */
export async function cancelContest(id: string, refundOwedNim: string | null): Promise<Contest | null> {
  const result = await pool.query<ContestRow>(
    `UPDATE contests
     SET status = 'cancelled', cancelled_at = now(), refund_owed_nim = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [refundOwedNim, id]
  )
  return result.rows[0] ? toContest(result.rows[0]) : null
}

export async function findRegistration(contestId: string, userId: string): Promise<ContestRegistration | null> {
  const result = await pool.query<RegistrationRow>(
    'SELECT * FROM contest_registrations WHERE contest_id = $1 AND user_id = $2',
    [contestId, userId]
  )
  return result.rows[0] ? toRegistration(result.rows[0]) : null
}

/**
 * The INSERT's SELECT evaluates the registration window with Postgres time,
 * so a client clock and a race at the deadline cannot create a late entry.
 */
export async function createRegistrationIfEligible(
  contestId: string,
  userId: string,
  requirementsConfirmed: boolean,
  completedRequirementIds: string[] = []
): Promise<ContestRegistration | null> {
  const result = await pool.query<RegistrationRow>(
    "INSERT INTO contest_registrations (contest_id, user_id, requirements_confirmed, completed_requirement_ids) " +
      "SELECT c.id, $2, $3, $4 FROM contests c " +
      "WHERE c.id = $1 " +
      "AND c.status IN ('published', 'registration_open') " +
      "AND c.registration_open_at IS NOT NULL " +
      "AND c.registration_close_at IS NOT NULL " +
      "AND c.quiz_start_at IS NOT NULL " +
      "AND now() >= c.registration_open_at " +
      "AND now() < c.registration_close_at " +
      "AND now() < c.quiz_start_at " +
      "ON CONFLICT (contest_id, user_id) DO NOTHING RETURNING *",
    [contestId, userId, requirementsConfirmed, JSON.stringify(completedRequirementIds)]
  )
  return result.rows[0] ? toRegistration(result.rows[0]) : null
}

export async function getContestLeaderboard(contestId: string): Promise<LeaderboardEntry[]> {
  const contest = await findContestById(contestId)
  if (!contest) return []

  const result = await pool.query<{
    user_id: string
    username: string | null
    address: string
    score: number | string
    completion_seconds: number
    submitted_at: string
  }>(
    `SELECT qa.user_id, u.username, u.address, qa.score, qa.completion_seconds, qa.submitted_at
     FROM quiz_attempts qa
     JOIN users u ON u.id = qa.user_id
     WHERE qa.contest_id = $1 AND qa.submitted_at IS NOT NULL AND qa.user_id <> $2
     ORDER BY qa.score DESC, qa.completion_seconds ASC, qa.submitted_at ASC`,
    // Defensive exclusion of the contest creator (Phase 5): a sponsor must
    // never appear on their own leaderboard or receive their own prize,
    // even if registration/attempt-creation guards were somehow bypassed
    // (e.g. pre-existing data from before those guards shipped).
    [contestId, contest.creatorId]
  )

  const prizeMap = new Map<number, string>()
  if (!contest.isFree && contest.prizeDistribution) {
    for (const dist of contest.prizeDistribution) {
      prizeMap.set(dist.rank, dist.amountNim)
    }
  }

  return result.rows.map((row, index) => {
    const rank = index + 1
    const prizeNim = prizeMap.get(rank) ?? null
    return {
      rank,
      userId: row.user_id,
      username: row.username,
      address: row.address,
      score: Number(row.score ?? 0),
      completionSeconds: Number(row.completion_seconds ?? 0),
      submittedAt: row.submitted_at,
      prizeNim,
    }
  })
}

/**
 * Records the computed unallocated prize amount (D021/D022/D046) and moves
 * settlement_status to 'owed' if there's anything to refund. Idempotent and
 * safe to call repeatedly: never regresses an already 'refunded' or
 * 'processing' settlement back to 'owed'.
 */
export async function recordContestSettlement(contestId: string, unallocatedNim: string): Promise<Contest | null> {
  const result = await pool.query<ContestRow>(
    `UPDATE contests
     SET unallocated_prize_nim = $1,
         settlement_status = CASE
           WHEN settlement_status IN ('refunded', 'processing') THEN settlement_status
           WHEN $1::numeric > 0 THEN 'owed'
           ELSE 'not_applicable'
         END,
         updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [unallocatedNim, contestId]
  )
  return result.rows[0] ? toContest(result.rows[0]) : null
}

export async function markSettlementProcessing(contestId: string): Promise<void> {
  await pool.query(
    `UPDATE contests SET settlement_status = 'processing', settlement_error_message = NULL, updated_at = now() WHERE id = $1`,
    [contestId]
  )
}

export async function markSettlementTxHash(contestId: string, txHash: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE contests
     SET settlement_status = 'processing', settlement_tx_hash = $1, settlement_error_message = $2, updated_at = now()
     WHERE id = $3`,
    [txHash, message, contestId]
  )
}

export async function markSettlementRefunded(contestId: string): Promise<void> {
  await pool.query(
    `UPDATE contests SET settlement_status = 'refunded', settlement_error_message = NULL, updated_at = now() WHERE id = $1`,
    [contestId]
  )
}

export async function markSettlementFailed(contestId: string, message: string): Promise<void> {
  // Defense in depth: never let a failure write clobber a row some other
  // (overlapping ticker/manual) call already marked refunded.
  await pool.query(
    `UPDATE contests SET settlement_status = 'failed', settlement_error_message = $1, updated_at = now() WHERE id = $2 AND settlement_status <> 'refunded'`,
    [message, contestId]
  )
}

/** The contest creator's own Nimiq address — the settlement refund recipient. */
export async function findCreatorAddress(creatorId: string): Promise<string | null> {
  const result = await pool.query<{ address: string }>('SELECT address FROM users WHERE id = $1', [creatorId])
  return result.rows[0]?.address ?? null
}
