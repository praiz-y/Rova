<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useContests, type PublicContest, type LeaderboardEntry } from '../composables/useContests'
import { useSession } from '../composables/useSession'
import LeaderboardTable from '../components/LeaderboardTable.vue'

const route = useRoute()
const { getPublic, getRegistration, register, getLeaderboard } = useContests()
const { user } = useSession()
const contest = ref<PublicContest | null>(null)
const leaderboard = ref<LeaderboardEntry[]>([])
const loading = ref(true)
const submitting = ref(false)
const error = ref<string | null>(null)
const registrationMessage = ref<string | null>(null)
const completedRequirementIds = ref<string[]>([])
const registered = ref(false)
const contestId = computed(() => route.params.id as string)

const canEnterQuiz = computed(() => {
  if (!registered.value || !contest.value?.quizStartAt || !contest.value?.quizDurationSeconds) return false
  const startMs = new Date(contest.value.quizStartAt).getTime()
  const endMs = startMs + contest.value.quizDurationSeconds * 1000
  const nowMs = Date.now()
  return nowMs >= startMs && nowMs < endMs
})

function normalizedAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase()
}

// Phase 5: a sponsor cannot register for their own contest — this is
// enforced server-side (the authoritative check), this just avoids showing
// a button that would only come back as a 403.
const isOwnContest = computed(() => {
  if (!user.value || !contest.value) return false
  return normalizedAddress(user.value.address) === normalizedAddress(contest.value.sponsor.address)
})

const requirementsComplete = computed(() => {
  const requirements = contest.value?.entryRequirements ?? []
  return requirements.every((requirement) => completedRequirementIds.value.includes(requirement.id))
})

function toggleRequirement(requirementId: string) {
  completedRequirementIds.value = completedRequirementIds.value.includes(requirementId)
    ? completedRequirementIds.value.filter((id) => id !== requirementId)
    : [...completedRequirementIds.value, requirementId]
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'To be announced'
}

async function loadRegistration() {
  if (!user.value) return
  try {
    const result = await getRegistration(contestId.value)
    registered.value = Boolean(result.registration)
  } catch {
    registered.value = false
  }
}

async function loadLeaderboard() {
  try {
    const result = await getLeaderboard(contestId.value)
    leaderboard.value = result.leaderboard ?? []
  } catch {
    leaderboard.value = []
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    contest.value = await getPublic(contestId.value)
    await Promise.all([loadRegistration(), loadLeaderboard()])
  } catch (err: any) {
    error.value = err?.message ?? 'Contest could not be loaded'
  } finally {
    loading.value = false
  }
}

async function submitRegistration() {
  if (!contest.value || !user.value) return
  submitting.value = true
  error.value = null
  try {
    const result = await register(contest.value.id, completedRequirementIds.value)
    registered.value = Boolean(result.registration)
    registrationMessage.value = result.alreadyRegistered ? 'You are already registered.' : 'Registration confirmed. You are ready when the quiz starts.'
  } catch (err: any) {
    error.value = err?.message ?? 'Registration failed'
  } finally {
    submitting.value = false
  }
}

watch(user, loadRegistration)
onMounted(load)
</script>

<template>
  <main class="page">
    <p v-if="loading">Loading contest…</p>
    <p v-else-if="error && !contest" class="error">{{ error }}</p>
    <template v-else-if="contest">
      <router-link to="/" class="back">← All contests</router-link>
      <img v-if="contest.imageUrl" :src="contest.imageUrl" :alt="contest.title" class="hero" />
      <div class="topline">
        <span v-if="contest.isFree" class="badge">NO PRIZE — FREE CONTEST</span>
        <span v-else class="badge">{{ contest.prizePoolNim }} NIM prize pool</span>
      </div>
      <h1>{{ contest.title }}</h1>
      <p class="description">{{ contest.description }}</p>
      <section class="details">
        <p><strong>Sponsor:</strong> {{ contest.sponsor.username ?? contest.sponsor.address }}</p>
        <p><strong>Registration:</strong> {{ date(contest.registrationOpenAt) }} – {{ date(contest.registrationCloseAt) }}</p>
        <p><strong>Quiz starts:</strong> {{ date(contest.quizStartAt) }}</p>
        <p><strong>Duration:</strong> {{ contest.quizDurationSeconds ? contest.quizDurationSeconds / 60 + ' minutes' : 'To be announced' }}</p>
        <p><strong>Registered participants:</strong> {{ contest.registrationCount }}</p>
        <p v-if="!contest.isFree"><strong>Winners:</strong> {{ contest.winnerCount }}</p>
      </section>
      <section v-if="contest.resources && contest.resources.length > 0" class="resources">
        <h2>📚 What to Study / Study Materials</h2>
        <div v-for="res in contest.resources" :key="res.id" class="resource-card">
          <div class="resource-header">
            <span class="resource-title">{{ res.title }}</span>
            <span class="resource-type">{{ res.type }}</span>
          </div>
          <p v-if="res.description" class="resource-desc">{{ res.description }}</p>
          <a :href="res.url" target="_blank" rel="noopener noreferrer" class="resource-link">
            Open Study Material →
          </a>
        </div>
      </section>

      <section v-if="contest.entryRequirements.length" class="requirements">
        <h2>Before you enter</h2>
        <p class="hint">Complete these tasks to participate.</p>
        <article v-for="requirement in contest.entryRequirements" :key="requirement.id" class="requirement-card" :class="{ complete: completedRequirementIds.includes(requirement.id) }">
          <div>
            <strong>{{ requirement.title }}</strong>
            <p v-if="requirement.description">{{ requirement.description }}</p>
          </div>
          <a :href="requirement.url" target="_blank" rel="noopener noreferrer">Open task ↗</a>
          <button v-if="!registered" type="button" @click="toggleRequirement(requirement.id)">
            {{ completedRequirementIds.includes(requirement.id) ? '✓ Completed' : 'Mark completed' }}
          </button>
        </article>
        <p class="hint">Task completion is confirmed on the honor system for this MVP.</p>
      </section>
      <section class="registration">
        <div v-if="registered" class="registered-box">
          <p class="success">{{ registrationMessage ?? 'You are registered for this contest.' }}</p>
          <router-link v-if="canEnterQuiz" :to="`/contests/${contest.id}/play`" class="play-btn">
            🎮 Enter Quiz Now
          </router-link>
          <p v-else-if="contest.quizStartAt && new Date(contest.quizStartAt).getTime() > Date.now()" class="hint">
            Quiz has not started yet. Starts at {{ date(contest.quizStartAt) }}.
          </p>
          <p v-else class="hint">
            Quiz timing has closed or not active.
          </p>
        </div>
        <p v-else-if="!user" class="hint">Connect your wallet and set a username to register.</p>
        <p v-else-if="isOwnContest" class="hint">You created this contest, so you can't register or compete in it.</p>
        <button v-else :disabled="submitting || !requirementsComplete" @click="submitRegistration">
          {{ submitting ? 'Registering…' : 'Register for contest' }}
        </button>
        <p v-if="error" class="error">{{ error }}</p>
      </section>

      <section class="leaderboard-section">
        <h2>🏆 Official Leaderboard</h2>
        <LeaderboardTable :leaderboard="leaderboard" :is-free="contest.isFree" />
      </section>
    </template>
  </main>
</template>


<style scoped>
.page { max-width: 700px; margin: 0 auto; padding: 2rem 1rem; }
.back, .hint { color: var(--rova-ink-muted); }
.hero { width: 100%; max-height: 280px; object-fit: cover; border-radius: var(--rova-radius); margin: 1rem 0; }
.topline { margin-top: 1rem; }
.badge {
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-line);
  border-radius: 999px;
  padding: .2rem .55rem;
  font-size: .75rem;
  font-weight: 700;
  color: var(--rova-navy-900);
}
h1 { margin: .7rem 0; color: var(--rova-navy-900); }
.description { white-space: pre-wrap; }
.details, .requirements, .registration, .resources {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1rem;
  margin-top: 1rem;
}
.details p { margin: .4rem 0; }
.requirements h2, .resources h2 { font-size: 1rem; margin-bottom: 0.75rem; color: var(--rova-navy-900); }
.requirements label { display: block; margin-top: .75rem; }
.registration button {
  padding: .6rem 1.2rem;
  border: 0;
  border-radius: 999px;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  font-weight: 700;
  cursor: pointer;
}
.registration button:disabled { opacity: .6; cursor: not-allowed; }
.error { color: var(--rova-red-600); }
.success { color: var(--rova-navy-900); font-weight: 700; }
.play-btn {
  display: inline-block;
  margin-top: 0.75rem;
  padding: 0.75rem 1.4rem;
  background: var(--rova-red-500);
  color: var(--rova-on-red);
  font-weight: 700;
  border-radius: 999px;
  text-decoration: none;
}
.resource-card {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}
.resource-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.resource-title { font-weight: 600; font-size: 0.95rem; }
.resource-type {
  font-size: 0.7rem;
  text-transform: uppercase;
  background: var(--rova-surface-alt);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  color: var(--rova-ink-muted);
}
.resource-desc { font-size: 0.85rem; color: var(--rova-ink-muted); margin: 0.25rem 0 0.5rem 0; }
.resource-link { display: inline-block; font-size: 0.85rem; color: var(--rova-navy-700); text-decoration: none; font-weight: 600; }
.resource-link:hover { text-decoration: underline; }
.requirement-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: .6rem;
  align-items: center;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  padding: .75rem;
  margin: .65rem 0;
}
.requirement-card p { margin: .25rem 0 0; color: var(--rova-ink-muted); font-size: .85rem; }
.requirement-card a { color: var(--rova-navy-700); font-size: .85rem; }
.requirement-card button {
  grid-column: 2;
  padding: .4rem .8rem;
  border: 1px solid var(--rova-navy-900);
  border-radius: 999px;
  background: transparent;
  color: var(--rova-navy-900);
  font-weight: 600;
  cursor: pointer;
}
.requirement-card.complete { border-color: var(--rova-navy-900); background: var(--rova-surface-alt); }
</style>
