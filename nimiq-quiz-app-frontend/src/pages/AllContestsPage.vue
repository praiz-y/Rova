<script setup lang="ts">
/**
 * /contests — browse every publicly visible contest in one place. See
 * Nimiq app/.ai/CONTESTS_PAGE_PLAN.md for the full spec this implements.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RovaLayout from './discovery/RovaLayout.vue'
import RovaContestCard from './discovery/RovaContestCard.vue'
import { useAllContestsData, type ContestStatusTab, type TaggedContest } from './discovery/useAllContestsData'

const route = useRoute()
const router = useRouter()

const {
  live,
  upcoming,
  completed,
  liveLoading,
  upcomingLoading,
  completedLoading,
  liveError,
  upcomingError,
  completedError,
  load,
  loadLive,
  loadUpcoming,
  loadCompleted,
  combined,
} = useAllContestsData()

onMounted(load)

const TABS: Array<{ key: ContestStatusTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
]

const activeTab = computed<ContestStatusTab>(() => {
  const status = route.query.status
  if (status === 'live' || status === 'upcoming' || status === 'completed') return status
  return 'all'
})

function setTab(tab: ContestStatusTab) {
  router.replace({ query: { ...route.query, status: tab === 'all' ? undefined : tab } })
}

const search = ref('')
const paymentFilter = ref<'all' | 'free' | 'prize'>('all')
const registrationFilter = ref<'all' | 'open'>('all')

function isRegistrationOpen(contest: TaggedContest['contest'], now = new Date()): boolean {
  if (!contest.registrationOpenAt || !contest.registrationCloseAt) return false
  const opens = new Date(contest.registrationOpenAt).getTime()
  const closes = new Date(contest.registrationCloseAt).getTime()
  const current = now.getTime()
  return current >= opens && current < closes
}

const tabItems = computed<TaggedContest[]>(() => {
  switch (activeTab.value) {
    case 'live':
      return live.value.map((contest) => ({ contest, variant: 'live' as const }))
    case 'upcoming':
      return upcoming.value.map((contest) => ({ contest, variant: 'upcoming' as const }))
    case 'completed':
      return completed.value.map((contest) => ({ contest, variant: 'completed' as const }))
    default:
      return combined()
  }
})

const filteredItems = computed<TaggedContest[]>(() => {
  const q = search.value.trim().toLowerCase()
  return tabItems.value.filter(({ contest }) => {
    if (q) {
      const haystack = `${contest.title} ${contest.description} ${contest.sponsor.username ?? ''} ${contest.sponsor.address}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (paymentFilter.value === 'free' && !contest.isFree) return false
    if (paymentFilter.value === 'prize' && contest.isFree) return false
    if (registrationFilter.value === 'open' && !isRegistrationOpen(contest)) return false
    return true
  })
})

const hasAnyFilter = computed(() => !!search.value.trim() || paymentFilter.value !== 'all' || registrationFilter.value !== 'all')

function clearFilters() {
  search.value = ''
  paymentFilter.value = 'all'
  registrationFilter.value = 'all'
}

const relevantLoading = computed(() => {
  switch (activeTab.value) {
    case 'live':
      return liveLoading.value
    case 'upcoming':
      return upcomingLoading.value
    case 'completed':
      return completedLoading.value
    default:
      return liveLoading.value || upcomingLoading.value || completedLoading.value
  }
})

const failedSources = computed(() => {
  const items: Array<{ key: ContestStatusTab; label: string; retry: () => void }> = []
  if (liveError.value && (activeTab.value === 'all' || activeTab.value === 'live')) {
    items.push({ key: 'live', label: 'Live contests failed to load.', retry: loadLive })
  }
  if (upcomingError.value && (activeTab.value === 'all' || activeTab.value === 'upcoming')) {
    items.push({ key: 'upcoming', label: 'Upcoming contests failed to load.', retry: loadUpcoming })
  }
  if (completedError.value && (activeTab.value === 'all' || activeTab.value === 'completed')) {
    items.push({ key: 'completed', label: 'Completed contests failed to load.', retry: loadCompleted })
  }
  return items
})

const hasAnyContests = computed(() => live.value.length + upcoming.value.length + completed.value.length > 0)
</script>

<template>
  <RovaLayout>
    <div class="rova-page-body">
      <header class="page-header">
        <div>
          <p class="eyebrow">EXPLORE</p>
          <h1 class="rova-page-title">All Contests</h1>
          <p class="subtext">Find a contest to join, follow live results, or revisit completed competitions.</p>
        </div>
        <router-link to="/contests/new" class="create-btn">Create a Contest</router-link>
      </header>

      <div class="tabs" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="setTab(tab.key)"
        >
          <span v-if="tab.key === 'live'" class="live-dot" />
          {{ tab.label }}
        </button>
      </div>

      <div class="filters">
        <input v-model="search" type="search" placeholder="Search by title, description, or sponsor…" class="search-input" />
        <div class="filter-group">
          <select v-model="paymentFilter" class="filter-select">
            <option value="all">Free &amp; Prize pool</option>
            <option value="free">Free only</option>
            <option value="prize">Prize pool only</option>
          </select>
          <select v-model="registrationFilter" class="filter-select">
            <option value="all">All registration states</option>
            <option value="open">Registration open</option>
          </select>
        </div>
      </div>

      <div v-if="failedSources.length > 0" class="error-banners">
        <div v-for="source in failedSources" :key="source.key" class="error-banner">
          <span>{{ source.label }}</span>
          <button type="button" @click="source.retry">Retry</button>
        </div>
      </div>

      <div v-if="relevantLoading" class="grid">
        <div v-for="n in 6" :key="n" class="skeleton-card rova-skeleton" />
      </div>

      <div v-else-if="filteredItems.length === 0 && hasAnyFilter" class="empty-state">
        <p class="empty-title">No contests match these filters.</p>
        <button type="button" class="empty-cta" @click="clearFilters">Clear filters</button>
      </div>

      <div v-else-if="filteredItems.length === 0 && !hasAnyContests" class="empty-state">
        <p class="empty-title">No contests exist yet.</p>
        <p class="empty-body">Be the first to create one.</p>
        <router-link to="/contests/new" class="empty-cta">Create a Contest</router-link>
      </div>

      <div v-else-if="filteredItems.length === 0" class="empty-state">
        <p class="empty-title">No contests in this view right now.</p>
      </div>

      <div v-else class="grid">
        <RovaContestCard v-for="item in filteredItems" :key="item.contest.id" :contest="item.contest" :variant="item.variant" />
      </div>
    </div>
  </RovaLayout>
</template>

<style scoped>
.rova-page-body {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.3rem;
  font-size: 0.7rem;
  font-weight: var(--rova-fw-bold);
  letter-spacing: 0.06em;
  color: var(--rova-red-600);
}

h1 {
  margin: 0 0 0.35rem;
}

.subtext {
  margin: 0;
  color: var(--rova-ink-muted);
  font-size: 0.9rem;
  max-width: 480px;
}

.create-btn {
  display: inline-flex;
  border-radius: 999px;
  padding: 0.7rem 1.4rem;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.88rem;
  white-space: nowrap;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.1rem;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--rova-line);
  background: var(--rova-surface);
  color: var(--rova-ink-muted);
  border-radius: 999px;
  padding: 0.5rem 1rem;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.tab.active {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  border-color: var(--rova-navy-900);
}

.live-dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--rova-red-500);
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
}

.search-input {
  border: 1px solid var(--rova-line);
  background: var(--rova-surface);
  border-radius: var(--rova-radius-sm);
  padding: 0.65rem 0.9rem;
  font-size: 0.88rem;
  color: var(--rova-ink);
  width: 100%;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-select {
  border: 1px solid var(--rova-line);
  background: var(--rova-surface);
  border-radius: var(--rova-radius-sm);
  padding: 0.55rem 0.7rem;
  font-size: 0.82rem;
  color: var(--rova-ink);
}

.error-banners {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid var(--rova-red-500);
  background: var(--rova-red-bg);
  color: var(--rova-red-600);
  border-radius: var(--rova-radius-sm);
  padding: 0.7rem 1rem;
  font-size: 0.85rem;
}

.error-banner button {
  border: 1px solid var(--rova-red-600);
  background: transparent;
  color: var(--rova-red-600);
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

/* Geometry only. The gradient, background-size, border, radius and the
   shimmer animation all come from .rova-skeleton in src/primitives.css. */
.skeleton-card {
  height: 12rem;
}

.empty-state {
  border: 1px dashed var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 2.5rem 1.25rem;
  text-align: center;
  background: var(--rova-surface);
}

.empty-title {
  margin: 0 0 0.35rem;
  font-weight: 700;
  color: var(--rova-navy-900);
}

.empty-body {
  margin: 0 0 1rem;
  color: var(--rova-ink-muted);
  font-size: 0.88rem;
}

.empty-cta {
  display: inline-flex;
  border: none;
  border-radius: 999px;
  padding: 0.6rem 1.2rem;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

@media (min-width: 640px) {
  .filters {
    flex-direction: row;
    align-items: center;
  }

  .search-input {
    flex: 1;
  }
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1120px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
