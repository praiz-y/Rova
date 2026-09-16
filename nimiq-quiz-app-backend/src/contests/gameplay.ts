import { pool } from '../db/pool.js'
import type { Contest, QuizAnswer, QuizAttempt } from './types.js'

interface AttemptRow {
  id: string
  contest_id: string
  user_id: string
  question_order: unknown
  answers: unknown
  current_question_index: number
  started_at: string
  submitted_at: string | null
  score: string | null
  completion_seconds: number | null
}

function toAttempt(row: AttemptRow): QuizAttempt {
  return {
    id: row.id, contestId: row.contest_id, userId: row.user_id,
    questionOrder: row.question_order as number[], answers: row.answers as QuizAnswer[],
    currentQuestionIndex: row.current_question_index, startedAt: row.started_at,
    submittedAt: row.submitted_at, score: row.score, completionSeconds: row.completion_seconds,
  }
}

function shuffledOrder(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function evaluateAnswer(
  question: Contest['questions'][number] | undefined,
  answer: QuizAnswer['answer']
): { correct: boolean; points: number } {
  if (!question) return { correct: false, points: 0 }

  const correct = question.type === 'multiple_choice'
    ? answer === question.correctOptionIndex
    : (() => {
        if (typeof answer !== 'string') return false
        const given = answer.trim().toLowerCase()
        if (!given) return false
        const primary = (question.correctAnswer ?? '').trim().toLowerCase()
        if (given === primary) return true
        const alternatives = (question.acceptedAlternatives ?? [])
          .map((alternative) => alternative.trim().toLowerCase())
          .filter(Boolean)
        return alternatives.includes(given)
      })()

  return { correct, points: correct ? question.points : 0 }
}

export function calculateScore(questions: Contest['questions'], answers: QuizAnswer[]): number {
  let score = 0
  for (const answer of answers) {
    score += evaluateAnswer(questions[answer.questionIndex], answer.answer).points
  }
  return score
}

export async function findQuizAttempt(contestId: string, userId: string): Promise<QuizAttempt | null> {
  const result = await pool.query<AttemptRow>('SELECT * FROM quiz_attempts WHERE contest_id = $1 AND user_id = $2', [contestId, userId])
  return result.rows[0] ? toAttempt(result.rows[0]) : null
}

export async function createQuizAttempt(contest: Contest, userId: string): Promise<QuizAttempt | null> {
  const result = await pool.query<AttemptRow>(
    "INSERT INTO quiz_attempts (contest_id, user_id, question_order) " +
      "SELECT c.id, $2, $3 FROM contests c " +
      "WHERE c.id = $1 AND c.quiz_start_at <= now() " +
      "AND c.quiz_start_at + (c.quiz_duration_seconds * INTERVAL '1 second') > now() " +
      "ON CONFLICT (contest_id, user_id) DO NOTHING RETURNING *",
    [contest.id, userId, JSON.stringify(shuffledOrder(contest.questions.length))]
  )
  return result.rows[0] ? toAttempt(result.rows[0]) : null
}

export async function saveAnswer(attempt: QuizAttempt, answer: QuizAnswer): Promise<QuizAttempt | null> {
  const answers = [...attempt.answers.filter((item) => item.questionIndex !== answer.questionIndex), answer]
  const result = await pool.query<AttemptRow>(
    'UPDATE quiz_attempts SET answers = $1, current_question_index = current_question_index + 1, updated_at = now() WHERE id = $2 AND submitted_at IS NULL RETURNING *',
    [JSON.stringify(answers), attempt.id]
  )
  return result.rows[0] ? toAttempt(result.rows[0]) : null
}

export async function submitAttempt(contest: Contest, attempt: QuizAttempt): Promise<QuizAttempt | null> {
  const score = calculateScore(contest.questions, attempt.answers)
  const result = await pool.query<AttemptRow>(
    "UPDATE quiz_attempts SET submitted_at = now(), score = $1, completion_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::integer), updated_at = now() WHERE id = $2 AND submitted_at IS NULL RETURNING *",
    [score, attempt.id]
  )
  return result.rows[0] ? toAttempt(result.rows[0]) : null
}
