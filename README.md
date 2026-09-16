# Nimiq Sponsored Quiz Platform

A quiz platform where anyone can sponsor a knowledge competition by funding a
prize pool up front, and winners are paid automatically in NIM after the
contest closes.

The core loop:

> **Sponsor creates a contest → funds the prize → people register → the quiz
> runs → the leaderboard determines winners → winners are paid on-chain.**

The payment layer is part of the product loop, not a bolt-on. The prize is
locked before the contest begins, so participants are competing for money that
already exists on-chain rather than a promise.

---

## Repository layout

| Path | What it is |
| --- | --- |
| [`nimiq-quiz-app-backend/`](nimiq-quiz-app-backend/) | Express 5 API, Postgres schema, Nimiq chain integration |
| [`nimiq-quiz-app-frontend/`](nimiq-quiz-app-frontend/) | Vue 3 single-page app, and the Nimiq Pay Mini App surface |

Each project is self-contained with its own `package.json`, `.env.example`, and
`.gitignore`.

---

## How it works

**Identity is the wallet.** There is no email or password. A user connects a
Nimiq wallet, the backend issues a single-use challenge nonce, the wallet signs
it, and the backend verifies the signature before issuing a session JWT. The
address _is_ the account. Usernames are a display layer on top of it.

**There are no separate sponsor and participant accounts.** One account can
browse, play, win, create, and sponsor.

**Sponsors fund before anyone plays.** When a contest is published, the sponsor
sends NIM to a shared project deposit address, tagging the transaction with a
per-contest reference in its data field. The backend polls the chain, matches
the reference, and only flips the contest to funded once the deposit has
reached real finality.

**Scoring is server-authoritative.** Question order is randomized per
participant, the timer runs server-side, and answers are graded against the
answer key the server holds. The client never calculates a score.

**Payouts are signed locally.** Prize and refund transactions are built and
signed in the backend process with `@nimiq/core` and broadcast as raw
transactions. The configured RPC node never sees the private key and needs no
wallet or keystore support. A payout is only marked `confirmed` after its
transaction has reached on-chain finality.

---

## Chain integration notes

- **Network:** Nimiq Albatross. `NIMIQ_NETWORK_ID` is `5` for testnet and `24`
  for mainnet, and it must match whatever chain `NIMIQ_RPC_URL` points at, or
  signed transactions will be rejected.
- **Finality:** Albatross finality is a Tendermint-style vote on the macro
  block that closes a batch. A transaction is final once the chain head has
  reached that macro block — not after a confirmation count.
- **Local signing:** transactions are assembled offline with
  `@nimiq/core`, then relayed with `sendRawTransaction`. Public RPC nodes
  generally reject the keystore methods (`importRawKey`, `unlockAccount`,
  `sendTransaction`), so the code never depends on them.
- **Honest state:** a payout or refund only moves to a terminal success state
  after real chain confirmation. Failures stay visibly failed rather than being
  reported as success.

---

## Tech stack

**Backend** — Node.js, Express 5, PostgreSQL 16, TypeScript, `tsx`
**Frontend** — Vue 3, Vite, vue-router, Chart.js
**Nimiq** — `@nimiq/core`, `nimiq-rpc-client-ts`, `@nimiq/mini-app-sdk`,
`@nimiq/hub-api`

---

## Prerequisites

- **Node.js 20 or newer**
- **Docker** (for the Postgres container) — or any reachable Postgres 13+
- **A Nimiq wallet on testnet**, for both the deploying user and the payout
  account

---

## Setup

### 1. Database

From `nimiq-quiz-app-backend/`:

```bash
docker compose up -d
```

That starts Postgres 16 on host port **5434**, with user, password, and
database all named `nimiq_quiz`.

### 2. Backend

```bash
cd nimiq-quiz-app-backend
npm install
cp .env.example .env
```

Then fill in `.env`. At minimum you need `DATABASE_URL`, a
`SESSION_JWT_SECRET`, and for paid contests a deposit address and its private
key. See [Backend environment variables](#backend-environment-variables).

Generate a fresh deposit/payout wallet rather than reusing one. Run this from
inside `nimiq-quiz-app-backend/`, since it writes to a relative path:

```bash
npx tsx src/auth/generate-deposit-wallet.ts
```

It prints the new address and writes the private key to
`nimiq-quiz-app-backend/.secrets/deposit-wallet.txt`, which is gitignored. The
key is deliberately not printed to the terminal. Move it to a password manager
and delete the file once saved.
Put the address in `NIMIQ_DEPOSIT_ADDRESS` and the key in
`NIMIQ_PAYOUT_PRIVATE_KEY`. Fund the address from a testnet faucet before
creating a paid contest.

Apply the schema and start the server:

```bash
npm run db:migrate
npm run dev
```

The API listens on **http://localhost:3001**. `GET /api/health` returns
`{"ok":true}`.

> `npm run dev` runs the TypeScript sources directly through `tsx`. `npm start`
> runs the compiled output in `dist/`, so run `npm run build` first if you use
> it, otherwise you will be serving stale code.

### 3. Frontend

```bash
cd nimiq-quiz-app-frontend
npm install
cp .env.example .env
npm run dev
```

The app runs on **http://localhost:5176**. It expects the backend on port 3001,
and the backend's `FRONTEND_ORIGIN` defaults to matching it.

---

## Environment variables

### Backend environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | No | `3001` | HTTP port |
| `FRONTEND_ORIGIN` | No | `http://localhost:5176` | CORS origin |
| `DATABASE_URL` | **Yes** | — | Postgres connection string |
| `SESSION_JWT_SECRET` | **Yes** | — | Long random value for session JWTs |
| `NIMIQ_DEPOSIT_ADDRESS` | For paid contests | — | Shared deposit and payout address |
| `NIMIQ_PAYOUT_PRIVATE_KEY` | For paid contests | — | Key for that address. Stays in this process, is never sent anywhere |
| `NIMIQ_RPC_URL` | **Yes** | public testnet RPC | Nimiq Albatross RPC endpoint |
| `NIMIQ_NETWORK_ID` | No | `5` | `5` = testnet, `24` = mainnet. Must match `NIMIQ_RPC_URL` |
| `NIMIQ_RPC_TIMEOUT_MS` | No | `15000` | Per-request RPC timeout |
| `NIMIQ_RPC_TRANSACTION_LOOKUP_LIMIT` | No | `30` | Recent transactions scanned per funding check, capped at 100 |
| `NIMIQ_PAYOUT_FINALITY_ATTEMPTS` | No | `12` | Finality poll attempts per transaction |
| `NIMIQ_PAYOUT_FINALITY_POLL_MS` | No | `5000` | Delay between finality polls |

### Frontend environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | No | empty | Leave empty when the frontend and backend share an origin |
| `VITE_NIMIQ_EXPLORER_BASE_URL` | No | testnet explorer | Block explorer used for transaction links |
| `VITE_NIMIQ_HUB_URL` | For desktop | `https://hub.nimiq-testnet.com` | Nimiq Hub endpoint, used when not running inside Nimiq Pay |

---

## Data model

Five tables, all created by `npm run db:migrate`.

| Table | Purpose |
| --- | --- |
| `users` | Wallet address as identity, plus an optional unique username |
| `contests` | The contest document: questions, schedule, prize pool, funding and settlement state |
| `contest_registrations` | One row per participant per contest, enforced by a unique constraint |
| `quiz_attempts` | One durable attempt per registration: question order, answers, score, completion time |
| `prize_payouts` | Prize payouts with a unique constraint on both `(contest_id, user_id)` and `(contest_id, rank)`, so a rank can never be paid twice |

Questions, prize distribution, and study resources are stored as `JSONB` on the
contest row, since they are read and written as whole documents. The unique
constraints, not application logic, are the authority on idempotency.

---

## Contest lifecycle

Contests move through an explicit status sequence, with the current value
enforced by a database `CHECK` constraint:

```
draft → published → registration_open → registration_closed
      → quiz_started → quiz_closed → results_finalized → payouts → completed
```

A contest can also become `cancelled`.

Funding is tracked separately, with its own states:

| Funding status | Meaning |
| --- | --- |
| `not_required` | Free contest, no prize pool |
| `pending` | No matching deposit seen yet |
| `underfunded` | A matching deposit arrived but fell short of the required total |
| `confirmed` | A matching deposit reached finality and covers the prize |

Settlement tracks what happens to prize money that nobody won, when fewer
participants finish than there are configured winner slots:

| Settlement status | Meaning |
| --- | --- |
| `not_applicable` | Every winner slot was filled |
| `owed` | Unallocated prize exists and is owed back to the sponsor |
| `processing` | A refund transaction has been broadcast |
| `refunded` | The refund reached on-chain finality |
| `failed` | The refund could not be completed |

Unallocated prize money is refunded to the sponsor. It is never left
unaccounted for, and it is never used to invent a winner.

---

## Wallet support

The frontend targets two environments behind one interface:

- **Inside Nimiq Pay** — through `@nimiq/mini-app-sdk`. This is the primary
  target.
- **Any desktop browser** — falls back to the Nimiq Hub API. Hub signs
  client-side and does not reliably relay to the network, so already-signed raw
  transactions are forwarded to `POST /api/blockchain/broadcast`, which reuses
  the same broadcast path the payout system uses.

Sponsors are blocked from registering for, playing, or being paid from their own
contest. That is enforced server-side, not just hidden in the UI.

---

## Verification

The backend ships with self-check and end-to-end scripts that run against a
real database and real testnet chain state:

```bash
cd nimiq-quiz-app-backend

npx tsc --noEmit                 # type check
npm run db:migrate               # apply schema

npx tsx src/auth/nimiqCrypto.selfcheck.ts
npx tsx src/contests/lifecycle.selfcheck.ts
npx tsx src/contests/leaderboard.selfcheck.ts
npx tsx src/contests/resources.selfcheck.ts
npx tsx src/contests/gameplay.selfcheck.ts
npx tsx src/contests/funding.selfcheck.ts
npx tsx src/contests/payouts.selfcheck.ts
npx tsx src/contests/settlement.selfcheck.ts
```

The full end-to-end scripts (`*.e2e.manualtest.ts`) require a running server,
a migrated database, and a funded testnet account. They send real transactions.
The testnet preflight is the safest first check and sends nothing:

```bash
npx tsx src/blockchain/testnet-preflight.manualtest.ts
```

Frontend production build:

```bash
cd nimiq-quiz-app-frontend && npm run build
```

---

## Project status

This is a hackathon project running on **Nimiq testnet**. It is not audited and
not production-ready.

**Implemented and verified against real testnet state:**

- Wallet signature authentication and session handling
- Contest creation, editing, discovery, and study resources
- Registration, server-authoritative gameplay, and leaderboard ranking
- Real deposit detection, including the distinct `underfunded` case
- Prize payouts and settlement refunds, signed locally and confirmed on-chain
- The full loop end to end: deposit, detection, publish, register, play, rank,
  and payout, driven entirely through the API

**Not yet verified:**

- **Real device testing.** Connect, sign, deposit, and gameplay have not been
  confirmed inside the actual Nimiq Pay application on a phone.
- **Desktop Hub click-through.** The Hub sign-in flow is proven at the API and
  contract level, but the browser popups have not been confirmed end to end by
  hand.

---

## Security notes

- **Never commit `.env` or `.secrets/`.** Both are gitignored, and the root
  `.gitignore` repeats that rule as a safety net. Check `git status` before
  every commit.
- **`NIMIQ_PAYOUT_PRIVATE_KEY` controls real funds.** Use a dedicated wallet
  whose only job is contest payouts, and keep its balance no higher than what
  in-flight contests require.
- **The public RPC endpoint is third-party infrastructure with no uptime
  guarantee.** It is fine for a testnet demo. Point `NIMIQ_RPC_URL` at your own
  node before handling real fund volume.
- **Before mainnet**, rotate every key, switch `NIMIQ_NETWORK_ID` to `24`, and
  repoint `NIMIQ_RPC_URL`, `VITE_NIMIQ_HUB_URL`, and
  `VITE_NIMIQ_EXPLORER_BASE_URL` at their mainnet equivalents.

---

## License

MIT. See [LICENSE](LICENSE).
