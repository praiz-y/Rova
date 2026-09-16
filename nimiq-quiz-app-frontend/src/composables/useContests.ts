/**
 * Contest draft CRUD (Phase 2 — D003 any user can create, D008 drafts are
 * freely editable). Talks to nimiq-quiz-app-backend's /api/contests routes,
 * tested end-to-end in contests/e2e.manualtest.ts.
 */
import { invalidateSession } from './useSession'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface MultipleChoiceQuestion {
  type: 'multiple_choice'
  prompt: string
  points: number
  options: string[]
  correctOptionIndex: number | null
}

export interface ShortAnswerQuestion {
  type: 'short_answer'
  prompt: string
  points: number
  correctAnswer: string | null
  acceptedAlternatives?: string[]
}

export type Question = MultipleChoiceQuestion | ShortAnswerQuestion

export interface PrizeDistributionEntry {
  rank: number
  amountNim: string
}

export interface ContestResource {
  id: string
  title: string
  type: string
  url: string
  description?: string
}

export type EntryRequirementType = 'follow_x' | 'join_telegram' | 'visit_website' | 'join_discord' | 'subscribe_follow' | 'custom'

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

export interface Contest extends Required<ContestDraftInput> {
  id: string
  creatorId: string
  status: string
  fundingStatus: 'not_required' | 'pending' | 'underfunded' | 'confirmed'
  fundingTxHash: string | null
  fundedAmountNim: string | null
  fundedAt: string | null
  cancelledAt: string | null
  refundOwedNim: string | null
  createdAt: string
  updatedAt: string
}

export interface FundingInfo {
  fundingStatus: 'not_required' | 'pending' | 'underfunded' | 'confirmed'
  depositAddress?: string
  reference?: string
  prizePoolNim?: string
  platformFeeNim?: string
  totalNim?: string
  fundingTxHash?: string | null
  fundedAmountNim?: string | null
  fundedAt?: string | null
}

export type DiscoveryCategory = 'upcoming' | 'ongoing' | 'completed'

/** Safe for public use: it intentionally contains no quiz questions/answers. */
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

/** Real, aggregate public numbers — never fabricated. See backend PublicContestStats. */
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

export interface RegistrationResponse {
  registration: ContestRegistration | null
  alreadyRegistered?: boolean
}

class ApiError extends Error {
  errors?: string[]
  constructor(message: string, errors?: string[]) {
    super(message)
    this.errors = errors
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Phase 5 (D030): a 401 here always means an expired/invalid session —
    // the only place the backend returns 401 is requireAuth. Clear the
    // stale "connected" header state immediately instead of leaving every
    // subsequent action to fail with an unexplained "Not authenticated".
    if (res.status === 401) invalidateSession()
    throw new ApiError(body.errors?.join('; ') ?? body.error ?? `Request failed (${res.status})`, body.errors)
  }
  return res.status === 204 ? null : res.json()
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

export interface PrizePayout {
  id: string
  contestId: string
  userId: string
  rank: number
  amountNim: string
  recipientAddress: string
  status: 'pending' | 'processing' | 'confirmed' | 'failed'
  txHash: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export function useContests() {
  return {
    listPublic: (category: DiscoveryCategory): Promise<PublicContest[]> =>
      apiFetch(`/api/contests?category=${category}`),
    getStats: (): Promise<PublicContestStats> => apiFetch('/api/contests/stats'),
    getPublic: (id: string): Promise<PublicContest> => apiFetch(`/api/contests/${id}?view=public`),
    listMine: (): Promise<Contest[]> => apiFetch('/api/contests/mine'),
    get: (id: string): Promise<Contest> => apiFetch(`/api/contests/${id}`),
    create: (input: ContestDraftInput): Promise<Contest> =>
      apiFetch('/api/contests', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: ContestDraftInput): Promise<Contest> =>
      apiFetch(`/api/contests/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    updateResources: (id: string, resources: ContestResource[]): Promise<Contest> =>
      apiFetch(`/api/contests/${id}/resources`, { method: 'PATCH', body: JSON.stringify({ resources }) }),
    remove: (id: string): Promise<null> => apiFetch(`/api/contests/${id}`, { method: 'DELETE' }),
    getFunding: (id: string): Promise<FundingInfo> => apiFetch(`/api/contests/${id}/funding`),
    checkFunding: (id: string): Promise<Contest & { underfundedMessage?: string | null }> =>
      apiFetch(`/api/contests/${id}/funding/check`, { method: 'POST' }),
    publish: (id: string): Promise<Contest> => apiFetch(`/api/contests/${id}/publish`, { method: 'POST' }),
    cancel: (id: string): Promise<Contest> => apiFetch(`/api/contests/${id}/cancel`, { method: 'POST' }),
    getRegistration: (id: string): Promise<RegistrationResponse> => apiFetch(`/api/contests/${id}/registration`),
    register: (id: string, completedRequirementIds: string[]): Promise<RegistrationResponse> =>
      apiFetch(`/api/contests/${id}/registration`, {
        method: 'POST',
        body: JSON.stringify({ completedRequirementIds }),
      }),
    getLeaderboard: (id: string): Promise<{ leaderboard: LeaderboardEntry[] }> =>
      apiFetch(`/api/contests/${id}/leaderboard`),
    getMyResult: (id: string): Promise<{ entry: LeaderboardEntry | null; isRegistered: boolean }> =>
      apiFetch(`/api/contests/${id}/results/mine`),
    getPayouts: (id: string): Promise<{ payouts: PrizePayout[] }> =>
      apiFetch(`/api/contests/${id}/payouts`),
    processPayouts: (id: string): Promise<{ payouts: PrizePayout[]; processedCount: number }> =>
      apiFetch(`/api/contests/${id}/payouts/process`, { method: 'POST' }),
  }
}



export { ApiError }
