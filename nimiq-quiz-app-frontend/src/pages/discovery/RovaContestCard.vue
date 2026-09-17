<script setup lang="ts">
/**
 * Live/upcoming sub-state and CTA logic lives here only. Both CTAs route
 * to the contest detail page (never straight to /play) — the detail page
 * already owns register/entry-requirement/enter-quiz state, so a card
 * click can never land on a raw "registration required" error.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSession } from '../../composables/useSession'
import type { PublicContest } from '../../composables/useContests'
import { formatDateTime, formatMinutes, prizeLabel, relativeTime, sponsorName } from './format'

const props = defineProps<{
  contest: PublicContest
  variant: 'live' | 'upcoming' | 'completed'
}>()

const { user } = useSession()

// Progress bars/relative labels are derived from static timestamps already
// in the payload — a 30s tick is enough to keep them honest without a new
// real-time architecture.
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 30_000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const quizEndsAt = computed(() => {
  if (!props.contest.quizStartAt || !props.contest.quizDurationSeconds) return null
  return new Date(new Date(props.contest.quizStartAt).getTime() + props.contest.quizDurationSeconds * 1000).toISOString()
})

const progressPct = computed(() => {
  if (props.variant !== 'live' || !props.contest.quizStartAt || !props.contest.quizDurationSeconds) return 0
  const start = new Date(props.contest.quizStartAt).getTime()
  const durationMs = props.contest.quizDurationSeconds * 1000
  const elapsed = now.value.getTime() - start
  return Math.max(0, Math.min(100, (elapsed / durationMs) * 100))
})

type Lifecycle = 'live' | 'upcoming' | 'registration_open' | 'registration_closed' | 'completed'

const lifecycle = computed<Lifecycle>(() => {
  if (props.variant === 'live') return 'live'
  if (props.variant === 'completed') return 'completed'
  const openAt = props.contest.registrationOpenAt ? new Date(props.contest.registrationOpenAt).getTime() : null
  const closeAt = props.contest.registrationCloseAt ? new Date(props.contest.registrationCloseAt).getTime() : null
  // Defensive: with no registration window there is nothing to be "open",
  // so never claim "Register Now". Publish validation requires both
  // timestamps, so real data shouldn't reach this — but a missing window
  // must degrade to a neutral state rather than a CTA the contest can't back.
  if (openAt === null || closeAt === null) return 'upcoming'
  const current = now.value.getTime()
  if (current < openAt) return 'upcoming'
  if (current >= closeAt) return 'registration_closed'
  return 'registration_open'
})

const badgeText: Record<Lifecycle, string> = {
  live: 'LIVE',
  upcoming: 'UPCOMING',
  registration_open: 'REGISTRATION OPEN',
  registration_closed: 'REGISTRATION CLOSED',
  completed: 'COMPLETED',
}

const ctaText = computed(() => {
  if (props.variant === 'live') return user.value ? 'Enter Live Arena' : 'Watch Leaderboard'
  if (props.variant === 'completed') return 'View Results'
  return lifecycle.value === 'registration_open' ? 'Register Now' : 'View Contest'
})

const ctaPrimary = computed(() => props.variant === 'live' ? !!user.value : lifecycle.value === 'registration_open')
</script>

<template>
  <router-link :to="{ name: 'contest-detail', params: { id: contest.id } }" class="card" :class="`is-${lifecycle}`">
    <div class="badge-row">
      <span class="prize-tag" :class="{ free: contest.isFree }">{{ prizeLabel(contest) }}</span>
      <span class="lifecycle-badge" :class="`is-${lifecycle}`">
        <span v-if="lifecycle === 'live'" class="live-dot" />
        {{ badgeText[lifecycle] }}
      </span>
    </div>

    <h3>{{ contest.title }}</h3>
    <p class="meta">by {{ sponsorName(contest) }}</p>

    <template v-if="variant === 'live'">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${progressPct}%` }" />
      </div>
      <p class="time-label">Started {{ relativeTime(contest.quizStartAt, now) }} &middot; Ends {{ relativeTime(quizEndsAt, now) }}</p>
    </template>
    <template v-else-if="variant === 'completed'">
      <p class="meta">{{ contest.questionCount }} Qs &middot; {{ formatMinutes(contest.quizDurationSeconds) }} min</p>
      <p class="meta">Ended {{ relativeTime(quizEndsAt, now) }}</p>
    </template>
    <template v-else>
      <p class="meta">{{ contest.questionCount }} Qs &middot; {{ formatMinutes(contest.quizDurationSeconds) }} min</p>
      <p class="meta">Registration: {{ formatDateTime(contest.registrationOpenAt) }} – {{ formatDateTime(contest.registrationCloseAt) }}</p>
      <p class="meta">Quiz starts: {{ formatDateTime(contest.quizStartAt) }}</p>
    </template>

    <p class="registered">{{ contest.registrationCount }} registered</p>

    <span class="cta" :class="{ primary: ctaPrimary }">{{ ctaText }}</span>
  </router-link>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1.1rem;
  text-decoration: none;
  color: var(--rova-ink);
  transition: border-color 0.15s ease;
}

.card:hover {
  border-color: var(--rova-navy-600);
}

.badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.prize-tag {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.7rem;
  font-weight: var(--rova-fw-bold);
}

.prize-tag.free {
  background: var(--rova-surface-alt);
  color: var(--rova-navy-900);
}

.lifecycle-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.62rem;
  font-weight: var(--rova-fw-bold);
  letter-spacing: 0.03em;
  background: var(--rova-surface-alt);
  color: var(--rova-ink-muted);
}

.lifecycle-badge.is-live {
  background: var(--rova-red-bg);
  color: var(--rova-red-600);
}

.lifecycle-badge.is-registration_open {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
}

.live-dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--rova-red-500);
}

h3 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.3;
}

.meta {
  margin: 0;
  font-size: 0.78rem;
  color: var(--rova-ink-muted);
}

.registered {
  margin: 0;
  font-size: 0.72rem;
  color: var(--rova-ink-muted);
}

.progress-track {
  height: 5px;
  border-radius: 999px;
  background: var(--rova-surface-alt);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--rova-red-500);
  border-radius: 999px;
}

.time-label {
  margin: 0;
  font-size: 0.75rem;
  color: var(--rova-ink-muted);
}

.cta {
  margin-top: 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.6rem 1rem;
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--rova-navy-900);
  border: 1.5px solid var(--rova-navy-900);
}

.cta.primary {
  background: var(--rova-red-500);
  color: var(--rova-on-red);
  border-color: var(--rova-red-500);
}
</style>
