<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContests, type PublicContest, type LeaderboardEntry } from '../composables/useContests'
import { useQuiz, type GameplayQuestion, type QuizAttempt } from '../composables/useQuiz'
import { useSession } from '../composables/useSession'

const route = useRoute()
const router = useRouter()
const { getPublic, getMyResult, getLeaderboard } = useContests()
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

// Result-view state. Loaded once the attempt is finalised — see the isFinished
// watcher below.
const myEntry = ref<LeaderboardEntry | null>(null)
const submissionCount = ref(0)
const resultsFinal = ref(false)

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

  // Captured before the await: submitAnswer replaces `attempt`, and
  // currentQuestionNumber is derived from it.
  const isLastQuestion = currentQuestionNumber.value >= totalQuestions.value

  submitting.value = true
  error.value = null
  try {
    const updatedAttempt = await submitAnswer(contestId.value, answerVal)
    attempt.value = updatedAttempt

    if (updatedAttempt.submittedAt) {
      // The server finalised it for us — the timer expired mid-request.
      stopTimer()
    } else if (isLastQuestion) {
      // saveAnswer only increments current_question_index; it does not
      // finalise. Without this call the index advances past the end of
      // question_order and the participant lands on "Question 6 of 5" with
      // nothing to answer. Their score and completion time are already
      // recorded, so this only stamps submitted_at.
      stopTimer()
      attempt.value = await submitQuiz(contestId.value)
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

/** 1 -> "1st". 11/12/13 are the exception to the mod-10 rule. */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function quizEndsAt(): number | null {
  const current = contest.value
  if (!current?.quizStartAt || !current?.quizDurationSeconds) return null
  return new Date(current.quizStartAt).getTime() + current.quizDurationSeconds * 1000
}

/**
 * Where the participant placed, and whether that number can still move.
 *
 * Both reads are needed and each answers a different half of the question:
 * /results/mine is authoritative for *my* rank — the server computes it, so
 * nothing is matched client-side — while the leaderboard supplies the field
 * size, which my own entry cannot express ("3rd of 7" needs the 7).
 *
 * Best effort on purpose: this enhances a screen that already shows the score,
 * so a failure here must leave the page working rather than surface an error
 * over an otherwise correct result.
 */
async function loadResult() {
  const endsAt = quizEndsAt()
  // Sampled once. If the participant sits on this screen past the deadline the
  // copy stays cautious ("so far") rather than claiming a finality that has
  // since arrived — erring toward under-claiming.
  resultsFinal.value = endsAt === null || Date.now() >= endsAt
  try {
    const [mine, board] = await Promise.all([
      getMyResult(contestId.value),
      getLeaderboard(contestId.value),
    ])
    myEntry.value = mine.entry
    submissionCount.value = board.leaderboard?.length ?? 0
  } catch {
    myEntry.value = null
  }
}

/**
 * Fires on the transition into the finished state, which covers all three ways
 * an attempt ends: answering the last question, submitting from the recovery
 * button, and the timer expiring mid-question. A page reopened after the fact
 * still transitions, because attempt starts null and so isFinished starts false.
 */
watch(isFinished, (finished) => {
  if (finished) loadResult()
})

const rankText = computed(() => {
  const entry = myEntry.value
  if (!entry) return null
  const of = submissionCount.value > 1 ? ` of ${submissionCount.value}` : ''
  return resultsFinal.value
    ? `You placed ${ordinal(entry.rank)}${of}.`
    : `You're ${ordinal(entry.rank)}${of} so far.`
})

const rankNote = computed(() => {
  if (!myEntry.value || resultsFinal.value) return null
  const endsAt = quizEndsAt()
  if (endsAt === null) return 'This can still change until the quiz closes.'
  const closesAt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(endsAt))
  return `This can still change — the quiz closes at ${closesAt}.`
})

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
        <h1 class="rova-page-title">{{ contest.title }}</h1>

        <!-- Was "Your submission has been recorded on the server." — an
             implementation detail, shown to the person who just played, in
             place of the one thing they want to know. The fallback is plain
             language rather than jargon, for when the rank is unavailable. -->
        <p class="summary-text">{{ rankText ?? 'Your answers have been submitted.' }}</p>
        <p v-if="rankNote" class="summary-note">{{ rankNote }}</p>

        <div class="stats-grid">
          <div class="stat-box">
            <span class="stat-label">Your Score</span>
            <span class="stat-value highlight">{{ attempt.score ?? 0 }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Completion Time</span>
            <span class="stat-value">{{ formatTime(attempt.completionSeconds ?? 0) }}</span>
            <!-- The leaderboard orders by score DESC, completion_seconds ASC, so
                 time decides your position whenever scores tie. Unlabelled it
                 reads as a neutral stat. -->
            <span class="stat-note">Used to break ties</span>
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

        <!-- Recovery path, not the normal one. Reached only when an attempt
             has every question answered but was never finalised — i.e. the
             participant closed the tab on the last question. The last-answer
             path above now submits directly, so this exists to make that
             attempt completable rather than stranded. -->
        <div v-else class="no-question">
          <p>You've answered every question.</p>
          <button class="btn primary" :disabled="submitting" @click="handleManualFinalSubmit">
            {{ submitting ? 'Submitting…' : 'Submit Quiz' }}
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
  box-shadow: var(--rova-shadow-raised);
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
  /* Was `all`, which would also animate anything a later rule adds here —
     including layout properties, at 60fps. Naming the two that actually
     change keeps hover cheap and predictable. */
  transition:
    border-color var(--rova-dur-base) var(--rova-ease-out),
    background-color var(--rova-dur-base) var(--rova-ease-out);
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

/* Had no rule at all, so this line rendered as a bare UA paragraph. It now
   carries the placement, which is the point of the screen. */
.summary-text {
  margin: 0;
  font-weight: var(--rova-fw-medium);
  color: var(--rova-ink);
}

.summary-note {
  margin: 0.4rem 0 0;
  font-size: var(--rova-fs-sm);
  color: var(--rova-ink-muted);
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
  font-weight: var(--rova-fw-bold);
  color: var(--rova-navy-900);
}

.stat-value.highlight {
  color: var(--rova-red-600);
}

/* Tightened against the value it annotates: .stat-box spaces its children
   evenly, which would float this note away from the time it belongs to. */
.stat-note {
  margin-top: -0.25rem;
  font-size: var(--rova-fs-2xs);
  color: var(--rova-ink-muted);
}

.actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}
</style>
