export interface MultipleChoiceQuestion {
  type: 'multiple_choice'
  prompt: string
  points: number
  options: string[]
  // null = not yet configured — allowed while a draft is still in progress.
  correctOptionIndex: number | null
}

export interface ShortAnswerQuestion {
  type: 'short_answer'
  prompt: string
  points: number
  correctAnswer: string | null
  // Additional accepted answers checked at grading time (trim+lower).
  // Stored as creator typed them — normalization happens only during scoring.
  acceptedAlternatives?: string[]
}

export type Question = MultipleChoiceQuestion | ShortAnswerQuestion

export interface PrizeDistributionEntry {
  rank: number
  amountNim: string
}

/**
 * A study-material link attached to a contest.
 * Kept flexible: `type` is a plain string so the frontend enum can grow
 * without requiring backend enum migrations. The URL format is validated
 * as ^https?:// at save time.
 */
export interface ContestResource {
  id: string
  title: string
  type: string
  url: string
  description?: string
}

export type EntryRequirementType = 'follow_x' | 'join_telegram' | 'visit_website' | 'join_discord' | 'subscribe_follow' | 'custom'

/** A sponsor-defined task acknowledged before registration. */
export interface EntryRequirement {
  id: string
  type: EntryRequirementType
  title: string
  url: string
  description?: string
}

export interface ContestDraftInput {
  title?: string
  description?: string
  imageUrl?: string | null
  questions?: Question[]
  registrationOpenAt?: string | null
  registrationCloseAt?: string | null
  quizStartAt?: string | null
  quizDurationSeconds?: number | null
  isFree?: boolean
  prizePoolNim?: string | null
  winnerCount?: number | null
  prizeDistribution?: PrizeDistributionEntry[]
  entryRequirements?: EntryRequirement[]
  resources?: ContestResource[]
}

export interface Contest {
  id: string
  creatorId: string
  status: string
  title: string
  description: string
  imageUrl: string | null
  questions: Question[]
  registrationOpenAt: string | null
  registrationCloseAt: string | null
  quizStartAt: string | null
  quizDurationSeconds: number | null
  isFree: boolean
  prizePoolNim: string | null
  winnerCount: number | null
  prizeDistribution: PrizeDistributionEntry[]
  entryRequirements: EntryRequirement[]
  resources: ContestResource[]
  fundingStatus: 'not_required' | 'pending' | 'underfunded' | 'confirmed'
  fundingTxHash: string | null
  fundedAmountNim: string | null
  fundedAt: string | null
  cancelledAt: string | null
  refundOwedNim: string | null
  // D021/D022/D046: prize-pool NIM left over because fewer participants
  // finished than configured winner slots (or zero participants). Refunded
  // to the sponsor once the quiz has closed — see contests/payouts.ts's
  // processContestSettlement.
  unallocatedPrizeNim: string | null
  settlementStatus: 'not_applicable' | 'owed' | 'processing' | 'refunded' | 'failed'
  settlementTxHash: string | null
  settlementErrorMessage: string | null
  createdAt: string
  updatedAt: string
  depositAddress?: string | null
}

export type DiscoveryCategory = 'upcoming' | 'ongoing' | 'completed'

/**
 * The public contest shape deliberately excludes questions and correct
 * answers. Those remain available only to the contest creator until Phase 5
 * serves participant-safe quiz content.
 */
export interface PublicContest {
  id: string
  status: string
  discoveryCategory: DiscoveryCategory | null
  title: string
  description: string
  imageUrl: string | null
  registrationOpenAt: string | null
  registrationCloseAt: string | null
  quizStartAt: string | null
  quizDurationSeconds: number | null
  isFree: boolean
  prizePoolNim: string | null
  winnerCount: number | null
  prizeDistribution: PrizeDistributionEntry[]
  entryRequirements: EntryRequirement[]
  registrationCount: number
  questionCount: number
  resources: ContestResource[]
  sponsor: {
    username: string | null
    address: string
  }
}

/**
 * Real, aggregate, public numbers (e.g. for a homepage stats row) — never
 * fabricated. contestCount/participantCount only count contests that ever
 * became publicly real (see PUBLIC_CONTEST_STATUSES in repository.ts);
 * nimWonNim sums only *confirmed* payouts, not pending/processing/failed.
 */
export interface PublicContestStats {
  contestCount: number
  participantCount: number
  nimWonNim: string
}

export interface ContestRegistration {
  id: string
  contestId: string
  userId: string
  requirementsConfirmed: boolean
  completedRequirementIds: string[]
  createdAt: string
}

export interface QuizAnswer {
  questionIndex: number
  answer: string | number | null
}

export interface QuizAttempt {
  id: string
  contestId: string
  userId: string
  questionOrder: number[]
  answers: QuizAnswer[]
  currentQuestionIndex: number
  startedAt: string
  submittedAt: string | null
  score: string | null
  completionSeconds: number | null
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string | null
  address: string
  score: number
  completionSeconds: number
  submittedAt: string
  prizeNim: string | null
}
