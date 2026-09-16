# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary roles, same wallet-based identity:

- **Sponsors / contest creators** — anyone with a Nimiq wallet (no separate "sponsor" account type). They design a quiz (questions, schedule, prize distribution, optional entry requirements and study resources), fund a real NIM prize pool, and publish it. Situation: they have a community, product, or event and want a low-effort way to reward engagement with real on-chain prizes.
- **Participants** — anyone with a Nimiq wallet. They discover contests, optionally study the posted resources, register before the deadline, play a timed quiz once, and land on a leaderboard. Winners are paid out automatically on-chain, no separate claim step.

## Product Purpose

A sponsored, competitive quiz platform on Nimiq: contest creators fund real NIM prize pools; participants compete in knowledge quizzes for a chance to win real cryptocurrency. Success = a contest's full lifecycle (create → fund → publish → register → play → rank → pay out) completes with real, verifiable on-chain transactions, not fabricated status.

## Positioning

Real, automatic on-chain payouts — not points, not a manual-claim process, not an IOU. The backend detects the sponsor's real deposit, runs the quiz, computes the real leaderboard, and signs and broadcasts real NIM payout transactions to winners without anyone clicking "claim." It works both as a native Nimiq Pay Mini App (mobile WebView) and in any standard desktop browser via a Nimiq Hub API fallback — most Mini Apps in this competition are mobile-only; this one is not.

## Operating Context

- Runs inside Nimiq Pay's mobile WebView (the Mini Apps Competition's primary target) or a normal desktop browser (Hub API wallet fallback).
- Identity is wallet-signature auth (sign a server-issued challenge; no passwords, no email).
- A contest moves through a real lifecycle with a server-driven ticker: draft → published → registration open/closed → quiz live → closed → results finalized → payouts processing → completed. Time-driven transitions happen automatically, not on a click.
- Sponsors fund contests by sending NIM to a shared, project-controlled deposit address with a contest-specific reference embedded in the transaction data; the backend detects and confirms this on-chain (Tendermint macro-block finality, not probabilistic depth).
- Winners are paid from that same custody model: the backend signs transactions locally (never via an RPC-hosted wallet/keystore) and broadcasts them; a payout is marked confirmed only after real on-chain finality.

## Capabilities and Constraints

- **Currency:** NIM only for this version. No multi-chain, no token selector.
- **Custody model:** backend-custodied shared deposit/payout address — explicitly **not** a smart contract, not an escrow contract, not audited. Any marketing copy must not claim "non-custodial," "smart contract," "audited," or similar; those would be false claims about how funds are actually held.
- **Grading:** short-answer questions grade by normalized (trim + lowercase) exact match against the correct answer and creator-configured accepted alternatives. No fuzzy/AI matching.
- **Study resources:** external links only (no file upload), shown to participants before they play.
- **Entry requirements:** currently a free-text field; a structured task-based redesign (follow/join/visit/custom tasks with per-task completion) is planned separately and is out of scope for the current landing-page work.
- **Leaderboard:** rank by score desc, completion time asc, submission timestamp asc.
- **No real, published social/community links exist yet** (no live X/Twitter, Telegram, Discord, or GitHub presence has been provided) — do not fabricate handles or URLs for these.

## Brand Commitments

- Rebranding now, deliberately, to **ROVA** — tagline "Create. Compete. Win." — across the whole product (page title, header, footer, copy). This replaces the prior working name "Nimiq Quiz," which was never a committed brand, just the repository/internal name.
- Built for the Nimiq Mini Apps Competition; still openly "designed for Nimiq Pay" as the primary target, with desktop as a real secondary path (not a footnote).

## Evidence on Hand

- Two reference mockups provided by the product owner (mobile + desktop) for the home/discovery surface: warm cream background, navy + red accent palette, badge-driven contest cards, stats row, 3-step "How It Works," dark sponsor CTA band, FAQ accordion, footer with nav columns. Treated as the visual brief for this surface (see DESIGN.md once written).
- No real usage numbers, testimonials, press, or partner logos exist yet. Any "stats" shown (contest count, participant count, NIM paid out) must be computed from real backend data at render time, never hardcoded placeholder numbers.
- Real backend data already available for the landing page: `GET /api/contests?category=upcoming|ongoing|completed` (public contest listings). No existing aggregate-stats endpoint yet — one may need to be added if the design keeps a stats row.

## Product Principles

1. Never show a number, status, or claim on-screen that isn't backed by real data or a real, verified mechanism — this product's whole credibility rests on payouts being real, not simulated.
2. Prefer showing real current state (even if small, e.g. "3 contests") over hiding it or inventing a bigger fake number.
3. Mobile WebView (inside Nimiq Pay) is the primary, authoritative environment; desktop is a fully real secondary path, not an afterthought.
4. Wallet connection is the only identity mechanism — never design a flow that assumes email/password or a guest mode.
5. Rebrand copy and chrome, but never launder the custody model into something it isn't (no "non-custodial," "smart contract," or "audited" language while the actual mechanism is backend-custodied).

## Accessibility & Inclusion

No product-specific requirement established beyond standard web accessibility (keyboard operability, color contrast, screen-reader-sensible markup) — treat as the default bar, nothing beyond it confirmed.
