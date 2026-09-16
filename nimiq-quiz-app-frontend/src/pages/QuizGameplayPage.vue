<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContests, type PublicContest } from '../composables/useContests'
import { useQuiz, type GameplayQuestion, type QuizAttempt } from '../composables/useQuiz'
import { useSession } from '../composables/useSession'

const route = useRoute()
const router = useRouter()
const { getPublic } = useContests()
const { startAttempt, getCurrentQuestion, submitAnswer, submitQuiz } = useQuiz()
const { user } = useSession()

const contestId = computed(() => route.params.id as string)
const contest = ref<PublicContest | null>(null)
const attempt = ref<QuizAttempt | null>(null)
const currentQuestion = ref<GameplayQuestion | null>(null)

const loading = ref(true)
const submitting = ref(false)
const error = ref<string | null>(null)
const selectedOption = ref<number | null>(null)
const shortAnswerInput = ref<string>('')
const remainingSeconds = ref<number>(0)
let timerInterval: ReturnType<typeof setInterval> | null = null

const isFinished = computed(() => Boolean(attempt.value?.submittedAt))
const currentQuestionNumber = computed(() => (attempt.value?.currentQuestionIndex ?? 0) + 1)
const totalQuestions = computed(() => attempt.value?.questionOrder?.length ?? 0)

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function updateTimer() {
  if (!attempt.value || !contest.value?.quizDurationSeconds || isFinished.value) {
    remainingSeconds.value = 0
    return
  }
  const startedMs = new Date(attempt.value.startedAt).getTime()
  const durationMs = contest.value.quizDurationSeconds * 1000
  const endMs = startedMs + durationMs
  const nowMs = Date.now()
  const diffSec = Math.max(0, Math.floor((endMs - nowMs) / 1000))
  remainingSeconds.value = diffSec

  if (diffSec <= 0 && !isFinished.value && !submitting.value) {
    handleAutoSubmit()
  }
}

function startTimer() {
  stopTimer()
  updateTimer()
  timerInterval = setInterval(updateTimer, 1000)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

async function loadNextQuestion() {
  selectedOption.value = null
  shortAnswerInput.value = ''
  try {
    const res = await getCurrentQuestion(contestId.value)
    attempt.value = res.attempt
    currentQuestion.value = res.question

    if (attempt.value.submittedAt || !res.question) {
      stopTimer()
    }
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to load question'
  }
}

async function initQuiz() {
  loading.value = true
  error.value = null
  try {
    if (!user.value) {
      router.push(`/contests/${contestId.value}`)
      return
    }

    contest.value = await getPublic(contestId.value)
    attempt.value = await startAttempt(contestId.value)
    startTimer()

    if (!attempt.value.submittedAt) {
      await loadNextQuestion()
    }
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to initialize quiz'
  } finally {
    loading.value = false
  }
}

async function handleSubmitAnswer() {
  if (!currentQuestion.value || submitting.value || isFinished.value) return

  let answerVal: string | number | null = null
  if (currentQuestion.value.type === 'multiple_choice') {
    if (selectedOption.value === null) {
      error.value = 'Please select an option.'
      return
    }
    answerVal = selectedOption.value
  } else {
    if (!shortAnswerInput.value.trim()) {
      error.value = 'Please enter an answer.'
      return
    }
    answerVal = shortAnswerInput.value.trim()
  }

  submitting.value = true
  error.value = null
  try {
    const updatedAttempt = await submitAnswer(contestId.value, answerVal)
    attempt.value = updatedAttempt

    // Check if more questions remain
    if (updatedAttempt.submittedAt) {
      stopTimer()
    } else {
      await loadNextQuestion()
    }
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to submit answer'
  } finally {
    submitting.value = false
  }
}

async function handleAutoSubmit() {
  stopTimer()
  submitting.value = true
  try {
    attempt.value = await submitQuiz(contestId.value)
  } catch (err: any) {
    error.value = err?.message ?? 'Quiz auto-submission failed'
  } finally {
    submitting.value = false
  }
}

async function handleManualFinalSubmit() {
  stopTimer()
  submitting.value = true
  try {
    attempt.value = await submitQuiz(contestId.value)
  } catch (err: any) {
    error.value = err?.message ?? 'Quiz submission failed'
  } finally {
    submitting.value = false
  }
}

onMounted(initQuiz)
onUnmounted(stopTimer)
</script>

<template>
  <main class="page">
    <div v-if="loading" class="loading-box">
      <p>Loading quiz session…</p>
    </div>

    <div v-else-if="error && !attempt" class="error-box">
      <h2>Error</h2>
      <p>{{ error }}</p>
      <router-link :to="`/contests/${contestId}`" class="btn">Back to Contest</router-link>
    </div>

    <template v-else-if="contest && attempt">
      <!-- Quiz Completed View -->
      <section v-if="isFinished" class="result-card">
        <div class="result-badge">Quiz Completed</div>
        <h1>{{ contest.title }}</h1>
        <p class="summary-text">Your submission has been recorded on the server.</p>

        <div class="stats-grid">
          <div class="stat-box">
            <span class="stat-label">Your Score</span>
            <span class="stat-value highlight">{{ attempt.score ?? 0 }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Completion Time</span>
            <span class="stat-value">{{ formatTime(attempt.completionSeconds ?? 0) }}</span>
          </div>
        </div>

        <div class="actions">
          <router-link :to="`/contests/${contestId}`" class="btn">View Contest Details</router-link>
          <router-link to="/" class="btn secondary">All Contests</router-link>
        </div>
      </section>

      <!-- Active Quiz View -->
      <section v-else class="quiz-card">
        <header class="quiz-header">
          <div class="progress">
            Question <strong>{{ currentQuestionNumber }}</strong> of <strong>{{ totalQuestions }}</strong>
          </div>
          <div class="timer" :class="{ warning: remainingSeconds < 60 }">
            ⏱️ {{ formatTime(remainingSeconds) }}
          </div>
        </header>

        <div v-if="currentQuestion" class="question-body">
          <h2 class="prompt">{{ currentQuestion.prompt }}</h2>

          <!-- Multiple Choice Options -->
          <div v-if="currentQuestion.type === 'multiple_choice' && currentQuestion.options" class="options-list">
            <label
              v-for="(opt, idx) in currentQuestion.options"
              :key="idx"
              class="option-item"
              :class="{ selected: selectedOption === idx }"
            >
              <input
                type="radio"
                :name="'q_' + currentQuestionNumber"
                :value="idx"
                v-model="selectedOption"
              />
              <span>{{ opt }}</span>
            </label>
          </div>

          <!-- Short Answer Input -->
          <div v-else-if="currentQuestion.type === 'short_answer'" class="short-answer-box">
            <input
              type="text"
              v-model="shortAnswerInput"
              placeholder="Type your answer here..."
              @keyup.enter="handleSubmitAnswer"
            />
          </div>

          <p v-if="error" class="error-text">{{ error }}</p>

          <footer class="question-footer">
            <button
              class="btn primary"
              :disabled="submitting || (currentQuestion.type === 'multiple_choice' ? selectedOption === null : !shortAnswerInput.trim())"
              @click="handleSubmitAnswer"
            >
              {{ submitting ? 'Submitting…' : (currentQuestionNumber === totalQuestions ? 'Submit Quiz' : 'Next Question →') }}
            </button>
          </footer>
        </div>

        <div v-else class="no-question">
          <p>No questions available or quiz end reached.</p>
          <button class="btn primary" :disabled="submitting" @click="handleManualFinalSubmit">
            Finish Quiz
          </button>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.loading-box, .error-box {
  text-align: center;
  padding: 3rem 1rem;
}

.quiz-card, .result-card {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 2rem;
  box-shadow: 0 2px 12px rgba(15, 27, 51, 0.06);
}

.quiz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--rova-line);
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}

.progress {
  font-size: 0.95rem;
  color: var(--rova-ink-muted);
}

.timer {
  font-family: monospace;
  font-size: 1.25rem;
  font-weight: 700;
  padding: 0.3rem 0.8rem;
  background: var(--rova-surface-alt);
  border-radius: var(--rova-radius-sm);
}

.timer.warning {
  color: var(--rova-red-600);
  animation: pulse 1s infinite alternate;
}

@keyframes pulse {
  from { opacity: 1; }
  to { opacity: 0.6; }
}

.prompt {
  font-size: 1.3rem;
  margin-bottom: 1.5rem;
  line-height: 1.4;
  color: var(--rova-navy-900);
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-item:hover {
  border-color: var(--rova-navy-600);
  background: var(--rova-surface-alt);
}

.option-item.selected {
  border-color: var(--rova-red-500);
  background: var(--rova-red-bg);
  font-weight: 600;
}

.short-answer-box input {
  width: 100%;
  padding: 0.9rem;
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  background: var(--rova-surface-alt);
  color: var(--rova-ink);
  font-size: 1rem;
  margin-bottom: 1.5rem;
}

.question-footer {
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 999px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  text-decoration: none;
  display: inline-block;
  font-size: 0.9rem;
}

.btn.primary {
  background: var(--rova-red-500);
  color: var(--rova-on-red);
}

.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.secondary {
  background: transparent;
  border: 1.5px solid var(--rova-navy-900);
  color: var(--rova-navy-900);
  margin-left: 0.5rem;
}

.error-text {
  color: var(--rova-red-600);
  margin-bottom: 1rem;
}

.result-card {
  text-align: center;
}

.result-badge {
  display: inline-block;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 2rem 0;
}

.stat-box {
  background: var(--rova-surface-alt);
  padding: 1.2rem;
  border-radius: var(--rova-radius-sm);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--rova-ink-muted);
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--rova-navy-900);
}

.stat-value.highlight {
  color: var(--rova-red-600);
}

.actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}
</style>
