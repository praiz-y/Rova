import { Router } from 'express'
import { optionalAuth, requireAuth, type AuthenticatedRequest, type SessionRequest } from '../middleware/requireAuth.js'
import { validateContestDraftInput, validateContestForPublish, validateResources } from './validation.js'
import { checkFundingTransactions, computeCancellationRefund, computeSponsorPayment, contestDepositReference } from './funding.js'
import {
  cancelContest,
  createContestDraft,
  createRegistrationIfEligible,
  deleteContestDraft,
  findContestById,
  findPublicContestById,
  findRegistration,
  getContestLeaderboard,
  getPublicContestStats,
  listContestsByCreator,
  listPublicContests,
  markContestFunded,
  markContestUnderfunded,
  publishContest,
  updateContestDraft,
} from './repository.js'

import type { DiscoveryCategory } from './types.js'
import { createQuizAttempt, findQuizAttempt, saveAnswer, submitAttempt } from './gameplay.js'
import { getPayoutsByContest, processContestPayouts, processContestSettlement } from './payouts.js'

export const contestsRouter = Router()


// Any authenticated user may create a contest — no separate sponsor role (D003).
contestsRouter.post('/', requireAuth, async (req, res) => {
  const { errors, value } = validateContestDraftInput(req.body)
  if (errors.length > 0) {
    res.status(400).json({ errors })
    return
  }
  const { userId } = (req as AuthenticatedRequest).session
  const contest = await createContestDraft(userId, value)
  res.status(201).json(contest)
})

contestsRouter.get('/mine', requireAuth, async (req, res) => {
  const { userId } = (req as AuthenticatedRequest).session
  const contests = await listContestsByCreator(userId)
  res.json(contests)
})

// Public aggregate numbers for the homepage stats row — no auth, no
// per-contest detail, just real counts (must come before `/:id` or that
// catch-all would swallow this as id="stats").
contestsRouter.get('/stats', async (_req, res) => {
  res.json(await getPublicContestStats())
})

// Public discovery needs no wallet connection. The public shape excludes all
// quiz questions and answers; only the creator receives the full document.
contestsRouter.get('/', async (req, res) => {
  const category = req.query.category
  if (category !== 'upcoming' && category !== 'ongoing' && category !== 'completed') {
    res.status(400).json({ error: 'category must be upcoming, ongoing, or completed' })
    return
  }
  res.json(await listPublicContests(category as DiscoveryCategory))
})

contestsRouter.get('/:id', optionalAuth, async (req, res) => {
  const id = req.params.id as string
  const contest = await findContestById(id)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  const session = (req as SessionRequest).session
  // The editor needs the creator-only document. A public-detail caller uses
  // ?view=public even when that caller also happens to be the creator.
  if (contest.creatorId === session?.userId && req.query.view !== 'public') {
    res.json(contest)
    return
  }
  if (contest.status === 'draft') {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  const publicContest = await findPublicContestById(id)
  if (!publicContest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  res.json(publicContest)
})

contestsRouter.get('/:id/registration', requireAuth, async (req, res) => {
  const { userId } = (req as AuthenticatedRequest).session
  const registration = await findRegistration(req.params.id as string, userId)
  res.json({ registration })
})

contestsRouter.post('/:id/registration', requireAuth, async (req, res) => {
  const contestId = req.params.id as string
  const { userId } = (req as AuthenticatedRequest).session
  const contest = await findPublicContestById(contestId)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }

  // Phase 5 (D003/D035): a sponsor must never register for, play, rank in,
  // or be paid from their own contest. Checked server-side, not just hidden
  // in the UI. `findPublicContestById` doesn't expose creatorId, so this is
  // a small extra lookup rather than trusting client-supplied identity.
  const fullContest = await findContestById(contestId)
  if (fullContest && fullContest.creatorId === userId) {
    res.status(403).json({ error: 'Contest creators cannot register for their own contest' })
    return
  }

  // Repeated clicks/retries return the original registration safely (D031).
  const existing = await findRegistration(contestId, userId)
  if (existing) {
    res.json({ registration: existing, alreadyRegistered: true })
    return
  }

  const completedRequirementIds = Array.isArray(req.body?.completedRequirementIds)
    ? req.body.completedRequirementIds.filter((id: unknown): id is string => typeof id === 'string')
    : []
  const requiredIds = contest.entryRequirements.map((requirement) => requirement.id)
  const requirementsConfirmed = requiredIds.length === 0 || requiredIds.every((id) => completedRequirementIds.includes(id))
  if (!requirementsConfirmed) {
    res.status(400).json({ error: 'Complete each entry requirement before registering.' })
    return
  }

  const registration = await createRegistrationIfEligible(contestId, userId, requirementsConfirmed, completedRequirementIds)
  if (!registration) {
    // A simultaneous retry may have inserted the unique registration first.
    const racedRegistration = await findRegistration(contestId, userId)
    if (racedRegistration) {
      res.json({ registration: racedRegistration, alreadyRegistered: true })
      return
    }
    res.status(409).json({ error: 'Registration is not open for this contest' })
    return
  }
  res.status(201).json({ registration, alreadyRegistered: false })
})

contestsRouter.post('/:id/attempt', requireAuth, async (req, res) => {
  const contest = await findContestById(req.params.id as string)
  const { userId } = (req as AuthenticatedRequest).session
  // Phase 5: block at the attempt-creation boundary too, in case a
  // registration row already exists from before this guard shipped.
  if (contest && contest.creatorId === userId) return res.status(403).json({ error: 'Contest creators cannot participate in their own contest' })
  if (!contest || !(await findRegistration(contest.id, userId))) return res.status(403).json({ error: 'Registration required' })
  const attempt = (await findQuizAttempt(contest.id, userId)) ?? (await createQuizAttempt(contest, userId))
  if (!attempt) return res.status(409).json({ error: 'Quiz is not currently open' })
  res.json(attempt)
})

contestsRouter.get('/:id/attempt/question', requireAuth, async (req, res) => {
  const contest = await findContestById(req.params.id as string)
  const { userId } = (req as AuthenticatedRequest).session
  const attempt = contest ? await findQuizAttempt(contest.id, userId) : null
  if (!contest || !attempt || attempt.submittedAt) return res.status(409).json({ error: 'No active quiz attempt' })
  const index = attempt.questionOrder[attempt.currentQuestionIndex]
  const question = index === undefined ? null : contest.questions[index]
  if (!question) return res.json({ question: null, attempt })
  res.json({ question: question.type === 'multiple_choice'
    ? { type: question.type, prompt: question.prompt, options: question.options }
    : { type: question.type, prompt: question.prompt }, attempt })
})

contestsRouter.post('/:id/attempt/answer', requireAuth, async (req, res) => {
  const contest = await findContestById(req.params.id as string)
  const { userId } = (req as AuthenticatedRequest).session
  const attempt = contest ? await findQuizAttempt(contest.id, userId) : null
  if (!contest || !attempt || attempt.submittedAt) return res.status(409).json({ error: 'No active quiz attempt' })
  const questionIndex = attempt.questionOrder[attempt.currentQuestionIndex]
  const answer = req.body?.answer
  if (questionIndex === undefined || (typeof answer !== 'string' && typeof answer !== 'number' && answer !== null)) return res.status(400).json({ error: 'Invalid answer' })
  const updated = await saveAnswer(attempt, { questionIndex, answer })
  res.json(updated)
})

contestsRouter.post('/:id/attempt/submit', requireAuth, async (req, res) => {
  const contest = await findContestById(req.params.id as string)
  const { userId } = (req as AuthenticatedRequest).session
  const attempt = contest ? await findQuizAttempt(contest.id, userId) : null
  if (!contest || !attempt) return res.status(409).json({ error: 'No quiz attempt found' })
  if (attempt.submittedAt) return res.json(attempt)
  const submitted = await submitAttempt(contest, attempt)
  res.json(submitted)
})

contestsRouter.get('/:id/leaderboard', async (req, res) => {
  const contestId = req.params.id as string
  const contest = await findContestById(contestId)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  const leaderboard = await getContestLeaderboard(contestId)
  res.json({ leaderboard })
})

contestsRouter.get('/:id/results/mine', requireAuth, async (req, res) => {
  const contestId = req.params.id as string
  const { userId } = (req as AuthenticatedRequest).session
  const leaderboard = await getContestLeaderboard(contestId)
  const myEntry = leaderboard.find((item) => item.userId === userId) ?? null
  const registration = await findRegistration(contestId, userId)

  res.json({
    entry: myEntry,
    isRegistered: Boolean(registration),
  })
})

contestsRouter.get('/:id/payouts', async (req, res) => {
  const contestId = req.params.id as string
  const contest = await findContestById(contestId)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  const payouts = await getPayoutsByContest(contestId)
  res.json({ payouts })
})

contestsRouter.post('/:id/payouts/process', requireAuth, async (req, res) => {
  const contestId = req.params.id as string
  const contest = await loadOwnedContest(req, res)
  if (!contest) return
  const result = await processContestPayouts(contestId)
  // D021/D022/D046: settle any prize-pool NIM left unallocated because
  // fewer participants finished than winner slots — refunded to the
  // sponsor, never left unaccounted for, never a fabricated winner.
  const settlement = await processContestSettlement(contestId)
  res.json({ ...result, settlement })
})



contestsRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const contest = await findContestById(id)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  const { userId } = (req as AuthenticatedRequest).session
  if (contest.creatorId !== userId) {
    res.status(403).json({ error: 'Not your contest' })
    return
  }
  if (contest.status !== 'draft') {
    // D009: rules lock once registration opens. Editing a non-draft
    // contest is out of scope here entirely, not just locked fields.
    res.status(409).json({ error: 'Only draft contests can be edited' })
    return
  }

  const { errors, value } = validateContestDraftInput(req.body)
  if (errors.length > 0) {
    res.status(400).json({ errors })
    return
  }
  const updated = await updateContestDraft(id, value)
  res.json(updated)
})

/**
 * PATCH /:id/resources — updates only the resources array.
 *
 * Separate from the general PATCH because the locking rule is different:
 * resources remain editable past the draft phase as long as registration
 * has not yet opened. The primary gate is the actual registration timestamp;
 * a defensive status check prevents accidental unlocking if the clock is wrong.
 *
 * Locked statuses (registration is considered open or past):
 *   registration_open, registration_closed, quiz_started, quiz_closed,
 *   results_finalized, payouts, completed, cancelled
 */
const REGISTRATION_LOCKED_STATUSES = new Set([
  'registration_open', 'registration_closed', 'quiz_started', 'quiz_closed',
  'results_finalized', 'payouts', 'completed', 'cancelled',
])

contestsRouter.patch('/:id/resources', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const contest = await findContestById(id)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  const { userId } = (req as AuthenticatedRequest).session
  if (contest.creatorId !== userId) {
    res.status(403).json({ error: 'Not your contest' })
    return
  }

  // Primary rule: registration timing.
  if (contest.registrationOpenAt && new Date(contest.registrationOpenAt) <= new Date()) {
    res.status(409).json({ error: 'Resources cannot be changed once registration has opened' })
    return
  }
  // Defensive secondary: status-based guard.
  if (REGISTRATION_LOCKED_STATUSES.has(contest.status)) {
    res.status(409).json({ error: 'Resources cannot be changed once registration has opened' })
    return
  }

  const { errors, resources } = validateResources(req.body?.resources)
  if (errors.length > 0) {
    res.status(400).json({ errors })
    return
  }
  const updated = await updateContestDraft(id, { resources })
  res.json(updated)
})

contestsRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const contest = await findContestById(id)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return
  }
  const { userId } = (req as AuthenticatedRequest).session
  if (contest.creatorId !== userId) {
    res.status(403).json({ error: 'Not your contest' })
    return
  }
  if (contest.status !== 'draft') {
    // D033: completed contests are permanent. Deleting a published/live
    // contest is a Phase 3+ cancellation-flow concern, not a plain delete.
    res.status(409).json({ error: 'Only draft contests can be deleted' })
    return
  }
  await deleteContestDraft(id)
  res.status(204).end()
})

/** Shared ownership + existence check used by the funding/publish/cancel routes. */
async function loadOwnedContest(req: import('express').Request, res: import('express').Response) {
  const id = req.params.id as string
  const contest = await findContestById(id)
  if (!contest) {
    res.status(404).json({ error: 'Contest not found' })
    return null
  }
  const { userId } = (req as AuthenticatedRequest).session
  if (contest.creatorId !== userId) {
    res.status(403).json({ error: 'Not your contest' })
    return null
  }
  return contest
}

// D042: deposit info a sponsor needs to fund this contest.
contestsRouter.get('/:id/funding', requireAuth, async (req, res) => {
  const contest = await loadOwnedContest(req, res)
  if (!contest) return

  if (contest.isFree || !contest.prizePoolNim) {
    res.json({ fundingStatus: 'not_required' })
    return
  }

  const depositAddress = process.env.NIMIQ_DEPOSIT_ADDRESS
  if (!depositAddress) {
    res.status(503).json({ error: 'Funding is not configured on this deployment yet (NIMIQ_DEPOSIT_ADDRESS unset)' })
    return
  }

  const { prizePoolNim, platformFeeNim, totalNim } = computeSponsorPayment(contest.prizePoolNim)
  res.json({
    depositAddress,
    reference: contestDepositReference(contest.id),
    prizePoolNim,
    platformFeeNim,
    totalNim,
    fundingStatus: contest.fundingStatus,
    fundingTxHash: contest.fundingTxHash,
    fundedAmountNim: contest.fundedAmountNim,
    fundedAt: contest.fundedAt,
  })
})

// D042/D023: backend-verified check against real chain state — never
// trusts a frontend claim that a deposit was sent.
contestsRouter.post('/:id/funding/check', requireAuth, async (req, res) => {
  const contest = await loadOwnedContest(req, res)
  if (!contest) return

  if (contest.isFree) {
    res.status(400).json({ error: 'This contest is free and does not need funding' })
    return
  }
  const depositAddress = process.env.NIMIQ_DEPOSIT_ADDRESS
  if (!depositAddress) {
    res.status(503).json({ error: 'Funding is not configured on this deployment yet (NIMIQ_DEPOSIT_ADDRESS unset)' })
    return
  }
  if (contest.fundingStatus === 'confirmed') {
    res.json(contest)
    return
  }

  let result
  try {
    result = await checkFundingTransactions(contest, depositAddress)
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to check Nimiq funding status',
    })
    return
  }

  if (result.match) {
    const updated = await markContestFunded(contest.id, result.match.txHash, result.match.amountNim)
    res.json(updated)
    return
  }

  // Phase 5: a matching-but-short deposit is a real, distinct, reportable
  // state — never left indistinguishable from "nothing has arrived yet".
  if (result.underfunded) {
    const { totalNim } = computeSponsorPayment(contest.prizePoolNim as string)
    const updated = await markContestUnderfunded(contest.id, result.underfunded.txHash, result.underfunded.amountNim)
    res.json({
      ...updated,
      underfundedMessage: `A deposit of ${result.underfunded.amountNim} NIM was received, but ${totalNim} NIM is required. Send the remaining ${(Number(totalNim) - Number(result.underfunded.amountNim)).toFixed(5).replace(/0+$/, '').replace(/\.$/, '')} NIM to the same deposit address with the same reference.`,
    })
    return
  }

  // No match of any kind this round — report whatever was already stored
  // (e.g. a still-underfunded status from a previous check), rather than
  // forcing 'pending' and masking that state.
  res.json(contest)
})

// Full readiness gate (D009/D018/D023) — deliberately NOT the same lenient
// check draft create/update use. See validation.ts's docstring.
contestsRouter.post('/:id/publish', requireAuth, async (req, res) => {
  const contest = await loadOwnedContest(req, res)
  if (!contest) return

  if (contest.status !== 'draft') {
    res.status(409).json({ error: 'Only draft contests can be published' })
    return
  }

  const errors = validateContestForPublish(contest)
  if (errors.length > 0) {
    res.status(400).json({ errors })
    return
  }

  const published = await publishContest(contest.id)
  res.json(published)
})

// D020: computes and records the refund owed. Does NOT send one — see
// funding.ts's module docstring for why that's Phase 7 scope.
contestsRouter.post('/:id/cancel', requireAuth, async (req, res) => {
  const contest = await loadOwnedContest(req, res)
  if (!contest) return

  if (contest.status !== 'draft' && contest.status !== 'published') {
    res.status(409).json({ error: 'Only a draft or published contest can be cancelled' })
    return
  }

  let refundOwedNim: string | null = null
  if (!contest.isFree && contest.prizePoolNim && contest.fundingStatus === 'confirmed') {
    refundOwedNim = computeCancellationRefund(contest.prizePoolNim).refundNim
  }

  const cancelled = await cancelContest(contest.id, refundOwedNim)
  res.json(cancelled)
})
