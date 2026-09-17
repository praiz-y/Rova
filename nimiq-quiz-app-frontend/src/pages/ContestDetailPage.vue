<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useContests, type PublicContest, type LeaderboardEntry } from '../composables/useContests'
import { useSession } from '../composables/useSession'
import LeaderboardTable from '../components/LeaderboardTable.vue'
import ContestStatusBadge from '../components/ContestStatusBadge.vue'
import ShareContestLink from '../components/ShareContestLink.vue'
import { canShare } from '../composables/contestStatus'

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

/**
 * The gates below are time-based, so they need a ticking clock to re-evaluate.
 * A computed only tracks reactive dependencies, and `Date.now()` is not one —
 * without this the page decides once, on load, whether the quiz has started
 * and never reconsiders however long it stays open. That was already true of
 * canEnterQuiz; the waiting-room gate would have inherited the same bug.
 */
const nowMs = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined

const canEnterQuiz = computed(() => {
  if (!registered.value || !contest.value?.quizStartAt || !contest.value?.quizDurationSeconds) return false
  const startMs = new Date(contest.value.quizStartAt).getTime()
  const endMs = startMs + contest.value.quizDurationSeconds * 1000
  return nowMs.value >= startMs && nowMs.value < endMs
})

/**
 * Registration has closed but the quiz has not opened — the window
 * evaluateContestStatus() calls 'registration_closed'. Derived from the
 * timestamps rather than contest.status, because the lifecycle ticker only
 * re-evaluates every 15s and the button has to appear on time, not up to
 * 15 seconds late.
 */
const canJoinWaitingRoom = computed(() => {
  if (!registered.value || !contest.value?.registrationCloseAt || !contest.value?.quizStartAt) return false
  const closeMs = new Date(contest.value.registrationCloseAt).getTime()
  const startMs = new Date(contest.value.quizStartAt).getTime()
  return nowMs.value >= closeMs && nowMs.value < startMs
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

/**
 * The status the badge shows.
 *
 * Derived from the timestamps rather than read straight off contest.status,
 * for the same reason canJoinWaitingRoom is: the lifecycle ticker only
 * re-evaluates every 15s, so the server value can lag behind the button below
 * it — a badge reading "Registration open" beside a button saying the window
 * has closed is worse than no badge. Terminal states are the exception; no
 * timestamp can express "cancelled" or "completed", so those are authoritative.
 */
const displayStatus = computed(() => {
  const current = contest.value
  if (!current) return ''
  if (current.status === 'cancelled' || current.status === 'completed' || current.status === 'draft') {
    return current.status
  }

  const startMs = current.quizStartAt ? new Date(current.quizStartAt).getTime() : null
  const endMs = startMs !== null && current.quizDurationSeconds ? startMs + current.quizDurationSeconds * 1000 : null
  if (endMs !== null && nowMs.value >= endMs) return 'quiz_closed'
  if (startMs !== null && nowMs.value >= startMs) return 'quiz_started'

  const closeMs = current.registrationCloseAt ? new Date(current.registrationCloseAt).getTime() : null
  if (closeMs !== null && nowMs.value >= closeMs) return 'registration_closed'

  const openMs = current.registrationOpenAt ? new Date(current.registrationOpenAt).getTime() : null
  if (openMs !== null && nowMs.value >= openMs) return 'registration_open'

  return 'published'
})

/**
 * True once the quiz window has ended, which is when the leaderboard stops
 * being a footnote and becomes the reason to open the page.
 */
const isOver = computed(() => displayStatus.value === 'quiz_closed' || displayStatus.value === 'completed')

/**
 * The one genuinely provisional case is a running quiz: submissions are still
 * arriving, so any rank a visitor reads can move. Once the window closes the
 * set of submissions is fixed and the order with it, so nothing is claimed
 * then — and nothing provisional is claimed on a contest that never started.
 */
const leaderboardNote = computed(() =>
  displayStatus.value === 'quiz_started' ? 'Live — still updating as participants submit.' : null
)

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'To be announced'
}

/**
 * 90 seconds used to render as "1.5 minutes". Whole minutes are the common
 * case, so the remainder is shown as seconds rather than a decimal fraction.
 */
function duration(seconds: number | null) {
  if (!seconds) return 'To be announced'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs} seconds`
  if (secs === 0) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  return `${mins} min ${secs} sec`
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
onMounted(() => {
  clock = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
  load()
})
onUnmounted(() => {
  if (clock) clearInterval(clock)
})
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
        <ContestStatusBadge :status="displayStatus" />
      </div>
      <h1 class="rova-page-title">{{ contest.title }}</h1>
      <p class="description">{{ contest.description }}</p>

      <!-- Anyone can share a public contest, not just its creator — so this
           sits with the page's own facts rather than behind the creator-only
           controls. Gated on displayStatus, not contest.status: the server's
           value can lag the lifecycle ticker by up to 15s, and a contest whose
           registration just opened must not hide its own share button. -->
      <ShareContestLink
        v-if="canShare(displayStatus)"
        :contest-id="contest.id"
        :title="contest.title"
        class="share-row"
      />

      <!-- The leaderboard is what a visitor comes for once a contest is over,
           so it moves above the reference material instead of sitting under it.
           Exactly one of these two blocks renders — see isOver. -->
      <section v-if="isOver" class="leaderboard-section">
        <h2><span class="h-mark" aria-hidden="true">🏆</span> Leaderboard</h2>
        <LeaderboardTable :leaderboard="leaderboard" :is-free="contest.isFree" />
      </section>

      <section class="details">
        <h2><span class="h-mark" aria-hidden="true">📋</span> Details</h2>
        <!-- A label/value grid rather than six "**Label:** value" lines. Same
             facts, but scannable rather than a paragraph to parse. -->
        <dl class="facts">
          <div class="fact">
            <dt>Sponsor</dt>
            <dd>{{ contest.sponsor.username ?? contest.sponsor.address }}</dd>
          </div>
          <div class="fact">
            <dt>Registration</dt>
            <dd>{{ date(contest.registrationOpenAt) }} – {{ date(contest.registrationCloseAt) }}</dd>
          </div>
          <div class="fact">
            <dt>Quiz starts</dt>
            <dd>{{ date(contest.quizStartAt) }}</dd>
          </div>
          <div class="fact">
            <dt>Duration</dt>
            <dd>{{ duration(contest.quizDurationSeconds) }}</dd>
          </div>
          <div class="fact">
            <dt>Registered</dt>
            <dd>{{ contest.registrationCount }}</dd>
          </div>
          <div v-if="!contest.isFree" class="fact">
            <dt>Winners</dt>
            <dd>{{ contest.winnerCount }}</dd>
          </div>
        </dl>
      </section>
      <!-- Registration sits above the study material and the entry tasks now:
           it is the one thing this page exists to do, and it used to be ninth
           of ten sections, so on a phone it was a long scroll away. The
           requirements stay directly beneath it because they gate the button. -->
      <section class="registration">
        <div v-if="registered" class="registered-box">
          <p class="success">{{ registrationMessage ?? 'You are registered for this contest.' }}</p>
          <router-link v-if="canEnterQuiz" :to="`/contests/${contest.id}/play`" class="play-btn">
            🎮 Enter Quiz Now
          </router-link>
          <!-- Ordered before the "not started yet" hint below, which is also
               true during this window and would otherwise shadow it. -->
          <router-link
            v-else-if="canJoinWaitingRoom"
            :to="`/contests/${contest.id}/waiting`"
            class="play-btn"
          >
            Join waiting room →
          </router-link>
          <p v-else-if="contest.quizStartAt && new Date(contest.quizStartAt).getTime() > nowMs" class="hint">
            Quiz has not started yet. Starts at {{ date(contest.quizStartAt) }}.
          </p>
          <p v-else class="hint">
            Quiz timing has closed or not active.
          </p>
        </div>
        <p v-else-if="!user" class="hint">Connect your wallet and set a username to register.</p>
        <p v-else-if="isOwnContest" class="hint">You created this contest, so you can't register or compete in it.</p>
        <template v-else>
          <button :disabled="submitting || !requirementsComplete" @click="submitRegistration">
            {{ submitting ? 'Registering…' : 'Register for contest' }}
          </button>
          <!-- The button is disabled until the tasks below are ticked, and
               those tasks are below it — without this a greyed-out button reads
               as a fault rather than as something left to go and do. -->
          <p v-if="contest.entryRequirements.length && !requirementsComplete" class="hint">
            Complete the tasks below to unlock registration.
          </p>
        </template>
        <p v-if="error" class="error">{{ error }}</p>
      </section>

      <section v-if="contest.entryRequirements.length" class="requirements">
        <h2><span class="h-mark" aria-hidden="true">✅</span> Before you enter</h2>
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

      <section v-if="contest.resources && contest.resources.length > 0" class="resources">
        <h2><span class="h-mark" aria-hidden="true">📚</span> What to study</h2>
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

      <!-- Only when the contest is still running; a finished contest shows the
           same table at the top of the page instead (see isOver). -->
      <section v-if="!isOver" class="leaderboard-section">
        <h2><span class="h-mark" aria-hidden="true">🏆</span> Leaderboard</h2>
        <p v-if="leaderboardNote" class="hint">{{ leaderboardNote }}</p>
        <LeaderboardTable :leaderboard="leaderboard" :is-free="contest.isFree" />
      </section>
    </template>
  </main>
</template>


<style scoped>
.page { max-width: 700px; margin: 0 auto; padding: 2rem 1rem; }
.back, .hint { color: var(--rova-ink-muted); }
.hero { width: 100%; max-height: 280px; object-fit: cover; border-radius: var(--rova-radius); margin: 1rem 0; }
.topline { margin-top: 1rem; display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.badge {
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-line);
  border-radius: 999px;
  padding: .2rem .55rem;
  font-size: .75rem;
  font-weight: 700;
  color: var(--rova-navy-900);
}
/* Type comes from .rova-page-title. This rule had no font-size at all, so the
   UA default 2em (32px) applied — a third larger than every other page title.
   Only the margin is page-specific now. */
h1 { margin: .7rem 0; }
.description { white-space: pre-wrap; }
/* .share-row lands on the ShareContestLink root (a scoped parent rule does
   reach a child component's root element), so the component keeps its own
   layout and only the spacing is decided here. */
.share-row { margin-top: .85rem; }
.details, .requirements, .registration, .resources {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1rem;
  margin-top: 1rem;
}
/* One rule for every section heading on the page, so they cannot drift apart
   the way they had (the leaderboard's h2 was previously unstyled). The emoji is
   a separate aria-hidden span rather than part of the heading text — inside the
   text a screen reader announces "books What to study". */
.details h2, .requirements h2, .resources h2, .leaderboard-section h2 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
  color: var(--rova-navy-900);
}
.h-mark { margin-right: .35rem; }
/* Label/value grid. minmax(180px, 1fr) means two columns on a wide page and one
   on a phone, with no breakpoint to maintain. */
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: .85rem 1.25rem;
  margin: 0;
}
.fact { min-width: 0; }
.fact dt {
  font-size: var(--rova-fs-xs);
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--rova-ink-muted);
  margin-bottom: .15rem;
}
/* A Nimiq address is one long unbroken token and would otherwise widen the
   grid column past the card. */
.fact dd { margin: 0; font-weight: var(--rova-fw-bold); color: var(--rova-navy-900); overflow-wrap: anywhere; }
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
/* Sits directly under the button it explains. */
.registration .hint { margin: .6rem 0 0; }
/* Not a card: the leaderboard table draws its own rules, so a border round it
   would be a box inside a box. */
.leaderboard-section { margin-top: 1rem; }
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
  border-radius: 999px;
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
