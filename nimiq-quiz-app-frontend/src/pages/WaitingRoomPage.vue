<script setup lang="ts">
/**
 * Waiting room — the gap between registration closing and the quiz opening.
 *
 * The server has always had this state. `evaluateContestStatus()` in
 * contests/lifecycle.ts returns 'registration_closed' for exactly
 * [registrationCloseAt, quizStartAt), but nothing ever rendered it: a
 * registered participant saw "Quiz has not started yet" on the contest page
 * and had to refresh by hand until the quiz appeared. This is that window with
 * a UI on it.
 *
 * Two choices here are deliberate and worth knowing before editing:
 *
 * 1. The countdown is computed client-side from `quizStartAt`, never from
 *    `contest.status`. startLifecycleTicker() only re-evaluates every 15s, so
 *    the status *string* can lag a timestamp by up to 15 seconds. That is fine
 *    for a badge and wrong for a countdown, so status is never consulted here.
 *
 * 2. Arriving late is allowed, and the room never delays the quiz.
 *    `quizStartAt` is load-bearing in four places (lifecycle.ts's state
 *    machine, the auto-finalizer it drives, gameplay.ts's admission query, and
 *    the ticker), so shifting it would make the advertised start time false.
 *    Anyone who lands here at or after T-0 is advanced immediately, and
 *    `createQuizAttempt` still admits them atomically until quizEnd — see the
 *    ON CONFLICT/WHERE guard in contests/gameplay.ts.
 *
 * Nothing here writes to the server. The room cannot strand a participant:
 * no quiz_attempts row exists until someone actually enters the quiz, so
 * autoFinalizeUnsubmittedAttempts() has nothing of ours to sweep.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContests, type PublicContest } from '../composables/useContests'
import { useSession } from '../composables/useSession'

const route = useRoute()
const router = useRouter()
const { getPublic, getRegistration } = useContests()
const { user } = useSession()

const contest = ref<PublicContest | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
/** True only once every guard below has passed and the room is really live. */
const ready = ref(false)
const nowMs = ref(Date.now())

const contestId = computed(() => route.params.id as string)

const quizStartMs = computed(() =>
  contest.value?.quizStartAt ? new Date(contest.value.quizStartAt).getTime() : null
)

const remainingMs = computed(() => {
  if (quizStartMs.value === null) return null
  return Math.max(0, quizStartMs.value - nowMs.value)
})

const started = computed(() => remainingMs.value === 0)

/**
 * A deliberate beat past T-0 before handing off to the quiz.
 *
 * The countdown runs on the participant's clock, so a machine running even a
 * second fast would reach the quiz before the server agrees it is open —
 * and POST /attempt answers that with a 409 that QuizGameplayPage renders as a
 * dead-end error with no retry. Waiting a moment is imperceptible and removes
 * the whole failure mode for clocks that are merely imprecise. (A badly skewed
 * clock is still an exposure on the contest page's own Enter Quiz link; this
 * deliberately does not try to fix that here.)
 */
const HANDOFF_GRACE_MS = 1200

const shouldAdvance = computed(() => {
  if (quizStartMs.value === null) return false
  return nowMs.value >= quizStartMs.value + HANDOFF_GRACE_MS
})

/** m:ss — the quiz window is measured in minutes, never hours. */
const countdown = computed(() => {
  const totalSeconds = Math.ceil((remainingMs.value ?? 0) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})

function toContest() {
  router.replace({ name: 'contest-detail', params: { id: contestId.value } })
}

let tick: ReturnType<typeof setInterval> | undefined
let countPoll: ReturnType<typeof setInterval> | undefined

/**
 * `registrationCount` is already on the public contest payload (a COUNT
 * subquery in contests/repository.ts) and is a real number, so the "players
 * ready" figure needs no new endpoint. Polling it is deliberate: the SSE
 * channel in contests/sse.ts only carries leaderboard entries, and standing up
 * a second event stream to move one integer across a two-minute window would
 * cost more than it explains.
 */
async function refreshCount() {
  try {
    contest.value = await getPublic(contestId.value)
  } catch {
    // A dropped refresh is not worth interrupting the countdown over — the
    // previous count stays on screen and the next poll corrects it.
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const loaded = await getPublic(contestId.value)
    contest.value = loaded

    // Every guard below sends the participant back to the contest page rather
    // than showing a countdown that leads somewhere they cannot go.
    if (!loaded.quizStartAt || !loaded.quizDurationSeconds) return toContest()

    const endMs = new Date(loaded.quizStartAt).getTime() + loaded.quizDurationSeconds * 1000
    if (Date.now() >= endMs) return toContest()

    // requireAuth gates the registration lookup, so re-entering the room while
    // signed out would 401 and clear the session for no reason.
    if (!user.value) return toContest()

    const result = await getRegistration(contestId.value)
    if (!result.registration) return toContest()

    ready.value = true
  } catch (err: any) {
    error.value = err?.message ?? 'This contest could not be loaded'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  if (!ready.value) return

  nowMs.value = Date.now()

  // Arriving at or after T-0 — the late-joiner path. The watch below only
  // fires when `shouldAdvance` *changes*, and for these arrivals it is already
  // true at mount, so without this they would sit on a dead 0:00 forever.
  // There is nothing to wait for: quizStartAt has passed, so go straight in.
  if (shouldAdvance.value) {
    router.replace({ name: 'quiz-gameplay', params: { id: contestId.value } })
    return
  }

  // 250ms rather than 1000ms so the final second lands on the boundary instead
  // of up to a second late — this is the one number on the page that matters.
  tick = setInterval(() => {
    nowMs.value = Date.now()
  }, 250)
  countPoll = setInterval(refreshCount, 10_000)
})

onUnmounted(() => {
  if (tick) clearInterval(tick)
  if (countPoll) clearInterval(countPoll)
})

// T-0, plus the grace above. `replace`, not `push`, so the back button doesn't
// drop the participant into a room that would immediately advance them again.
watch(shouldAdvance, (advance) => {
  if (advance && ready.value) {
    router.replace({ name: 'quiz-gameplay', params: { id: contestId.value } })
  }
})
</script>

<template>
  <main class="page">
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="contest && ready">
      <p class="rova-eyebrow">Waiting room</p>
      <h1 class="rova-page-title">{{ contest.title }}</h1>

      <div class="countdown-block">
        <p class="label">{{ started ? 'Starting' : 'Quiz starts in' }}</p>
        <p class="countdown rova-num" aria-live="off">{{ countdown }}</p>
        <p class="hint">
          <template v-if="started">Opening the quiz…</template>
          <template v-else>
            This page opens the quiz for you automatically — you don't need to refresh.
          </template>
        </p>
      </div>

      <div class="ready">
        <span class="live-dot" aria-hidden="true"></span>
        <span>
          <strong>{{ contest.registrationCount }}</strong>
          {{ contest.registrationCount === 1 ? 'player is' : 'players are' }} registered
        </span>
      </div>

      <p class="sponsor">Hosted by {{ contest.sponsor.username ?? contest.sponsor.address }}</p>

      <router-link :to="`/contests/${contest.id}`" class="back">← Back to contest</router-link>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 2rem 1rem;
  text-align: center;
}

h1 {
  margin: 0.4rem 0 1.5rem;
}

.countdown-block {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 2rem 1rem;
}

.label {
  margin: 0;
  font-size: 0.85rem;
  color: var(--rova-ink-muted);
}

.countdown {
  margin: 0.25rem 0 0.75rem;
  font-size: 4rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--rova-navy-900);
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--rova-ink-muted);
}

.ready {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding: 0.5rem 1rem;
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-line);
  border-radius: 999px;
  font-size: 0.9rem;
  color: var(--rova-navy-900);
}

.live-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--rova-red-500);
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.8);
  }
}

.sponsor {
  margin: 1.5rem 0 0;
  font-size: 0.85rem;
  color: var(--rova-ink-muted);
}

.back {
  display: inline-block;
  margin-top: 2rem;
  color: var(--rova-ink-muted);
  font-size: 0.85rem;
  text-decoration: none;
}

.back:hover {
  color: var(--rova-navy-900);
}

.error {
  color: var(--rova-red-600);
}
</style>
