import { ref } from 'vue'
import { invalidateSession } from './useSession'
import { authHeaders } from './sessionToken'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

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
  score: string | number | null
  completionSeconds: number | null
}

export interface GameplayQuestion {
  type: 'multiple_choice' | 'short_answer'
  prompt: string
  options?: string[]
}

export interface QuestionResponse {
  question: GameplayQuestion | null
  attempt: QuizAttempt
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
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Phase 5 (D030): a session that expires mid-quiz must produce a clear
    // reconnect state, not a silent failure — the answer the player was
    // mid-way through is not lost either way (D030's persistence is
    // server-side per saved answer, not tied to the live session).
    if (res.status === 401) invalidateSession('Your session expired mid-quiz. Reconnect your wallet — your saved answers are safe.')
    throw new ApiError(body.errors?.join('; ') ?? body.error ?? `Request failed (${res.status})`, body.errors)
  }
  return res.status === 204 ? null : res.json()
}

export function useQuiz() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function startAttempt(contestId: string): Promise<QuizAttempt> {
    loading.value = true
    error.value = null
    try {
      return await apiFetch(`/api/contests/${contestId}/attempt`, { method: 'POST' })
    } catch (err: any) {
      error.value = err?.message ?? 'Failed to start quiz attempt'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function getCurrentQuestion(contestId: string): Promise<QuestionResponse> {
    return await apiFetch(`/api/contests/${contestId}/attempt/question`)
  }

  async function submitAnswer(contestId: string, answer: string | number | null): Promise<QuizAttempt> {
    loading.value = true
    error.value = null
    try {
      return await apiFetch(`/api/contests/${contestId}/attempt/answer`, {
        method: 'POST',
        body: JSON.stringify({ answer }),
      })
    } catch (err: any) {
      error.value = err?.message ?? 'Failed to submit answer'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function submitQuiz(contestId: string): Promise<QuizAttempt> {
    loading.value = true
    error.value = null
    try {
      return await apiFetch(`/api/contests/${contestId}/attempt/submit`, { method: 'POST' })
    } catch (err: any) {
      error.value = err?.message ?? 'Failed to submit quiz'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    startAttempt,
    getCurrentQuestion,
    submitAnswer,
    submitQuiz,
  }
}
