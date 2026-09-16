-- Phase 1 schema: wallet identity + username only.
-- Phase 2 adds contests (draft creation/editing only — D003, D008).
-- Phase 3 adds funding tracking columns on contests (D042). Payout tables
-- still belong to Phase 7 — not added here (YAGNI).
-- Phase 2 (study materials) adds resources JSONB on contests.

-- gen_random_uuid() is built into Postgres 13+ core, but this keeps the
-- schema safe on older Postgres too.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized (no spaces, uppercase) Nimiq address — the actual identity (D004).
  address TEXT NOT NULL UNIQUE,
  -- Null until the user completes username creation.
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness for usernames (D006), without forcing a
-- particular display case.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
  ON users (lower(username));

-- NOTE on evolving this table: `CREATE TABLE IF NOT EXISTS` only protects
-- the FIRST creation — editing columns inside this block does nothing on a
-- database where the table already exists (learned this the hard way: see
-- TESTING.md T064). Once a column has shipped here, add later changes as
-- explicit ALTER TABLE statements below, not by editing this block.
CREATE TABLE IF NOT EXISTS contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id),

  -- Full D007 lifecycle listed now so the column never needs a migration
  -- later, even though only 'draft' is ever written before Phase 3.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'published', 'registration_open', 'registration_closed',
    'quiz_started', 'quiz_closed', 'results_finalized', 'payouts', 'completed'
  )),

  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  -- No file upload in MVP (Rule 25: avoid overengineering) — a pasted URL only.
  image_url TEXT,

  -- Draft-stage question content is read/written as one document, never
  -- queried per-question yet, so JSONB avoids premature normalization.
  -- Revisit as a real table if/when Phase 5 gameplay needs per-question
  -- queries. Shape: array of
  --   { type: 'multiple_choice'|'short_answer', prompt, points,
  --     options?, correctOptionIndex?, correctAnswer? }
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,

  registration_open_at TIMESTAMPTZ,
  registration_close_at TIMESTAMPTZ,
  quiz_start_at TIMESTAMPTZ,
  quiz_duration_seconds INTEGER,

  -- D032: free contests are supported; D041: NIM is the only MVP currency.
  is_free BOOLEAN NOT NULL DEFAULT true,
  prize_pool_nim NUMERIC(20, 5),
  winner_count INTEGER,
  -- D018: total winner allocation must equal the prize pool — enforced at
  -- publish time (Phase 3), not at draft-save time. Shape: array of
  -- { rank, amountNim }.
  prize_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,

  entry_requirements TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contests_creator_id_idx ON contests (creator_id);

-- Phase 3 (D042): funding tracking + the 'cancelled' status (D020 implies
-- it as a real transition, even though it wasn't in D007's original list).
-- ADD COLUMN IF NOT EXISTS makes this block itself safely re-runnable.
ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS funding_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS funding_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS funded_amount_nim NUMERIC(20, 5),
  ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ,
  -- D020: cancellation is a rule/calculation for now, not an executed
  -- refund — actually broadcasting a refund needs the payout-signing
  -- module Phase 7 builds. See funding.ts's module docstring.
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_owed_nim NUMERIC(20, 5);

-- Phase 2 (Study Materials, D-resources): external links (title, url, type,
-- optional description) that participants can read before competing.
-- Immutable once registration_open_at has passed — enforced at the API layer.
-- Shape: array of { id, title, type, url, description? }
ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_funding_status_check;
ALTER TABLE contests ADD CONSTRAINT contests_funding_status_check
  CHECK (funding_status IN ('not_required', 'pending', 'underfunded', 'confirmed'));

ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_status_check;
ALTER TABLE contests ADD CONSTRAINT contests_status_check
  CHECK (status IN (
    'draft', 'published', 'registration_open', 'registration_closed',
    'quiz_started', 'quiz_closed', 'results_finalized', 'payouts', 'completed',
    'cancelled'
  ));

-- Phase 4: a participant may register once per contest. The unique
-- constraint is the authoritative one-wallet-one-entry enforcement (D005);
-- the API handles a repeated request idempotently rather than creating a
-- second row.
CREATE TABLE IF NOT EXISTS contest_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id),
  user_id UUID NOT NULL REFERENCES users(id),
  -- External requirements are honor-system only in the MVP. This records
  -- acknowledgement, never verification by the platform.
  requirements_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, user_id)
);

CREATE INDEX IF NOT EXISTS contest_registrations_user_id_idx
  ON contest_registrations (user_id);

-- Per-task acknowledgements for structured entry requirements. The tasks
-- themselves remain on the contest document; this records which task IDs
-- the participant explicitly completed before registering.
ALTER TABLE contest_registrations
  ADD COLUMN IF NOT EXISTS completed_requirement_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Phase 5: one durable attempt per registration. Answers are stored as a
-- document because they are only accessed as the participant's sequential
-- progress; scores remain server-calculated from the contest's answer key.
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id),
  user_id UUID NOT NULL REFERENCES users(id),
  question_order JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_question_index INTEGER NOT NULL DEFAULT 0 CHECK (current_question_index >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  score NUMERIC(12, 2),
  completion_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, user_id)
);

CREATE INDEX IF NOT EXISTS quiz_attempts_contest_id_idx ON quiz_attempts (contest_id);

-- Phase 7 (D042, D031): automated prize distribution tracking and idempotency.
-- Unique constraints on (contest_id, user_id) and (contest_id, rank) guarantee
-- that duplicate payouts cannot be generated for the same user or rank.
CREATE TABLE IF NOT EXISTS prize_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id),
  user_id UUID NOT NULL REFERENCES users(id),
  rank INTEGER NOT NULL CHECK (rank > 0),
  amount_nim NUMERIC(20, 5) NOT NULL CHECK (amount_nim > 0),
  recipient_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'confirmed', 'failed')),
  tx_hash TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, user_id),
  UNIQUE (contest_id, rank)
);

CREATE INDEX IF NOT EXISTS prize_payouts_contest_id_idx ON prize_payouts (contest_id);

-- Phase 5: add deposit_address column and unique index for funding_tx_hash
ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS deposit_address TEXT NULL;

-- Ensure funding_tx_hash is unique when non-null
CREATE UNIQUE INDEX IF NOT EXISTS contests_funding_tx_hash_idx ON contests (funding_tx_hash) WHERE funding_tx_hash IS NOT NULL;

-- Phase 5 (D021/D022/D046): explicit settlement of prize-pool NIM that goes
-- unallocated because fewer participants finished than configured winner
-- slots (or zero participants). Refunded to the sponsor's own wallet once
-- the quiz has actually closed — never left unaccounted for, never used to
-- fabricate a winner. Mirrors prize_payouts' honesty rule: 'refunded' may
-- only be set after real on-chain finality.
ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS unallocated_prize_nim NUMERIC(20, 5),
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS settlement_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS settlement_error_message TEXT;

ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_settlement_status_check;
ALTER TABLE contests ADD CONSTRAINT contests_settlement_status_check
  CHECK (settlement_status IN ('not_applicable', 'owed', 'processing', 'refunded', 'failed'));

-- Phase 5: 'underfunded' is a real, distinct state from 'pending' — a
-- matching deposit arrived but fell short of the required total, and the
-- sponsor needs to know that specifically rather than see an
-- indistinguishable "still pending" forever.
ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_funding_status_check;
ALTER TABLE contests ADD CONSTRAINT contests_funding_status_check
  CHECK (funding_status IN ('not_required', 'pending', 'underfunded', 'confirmed'));
