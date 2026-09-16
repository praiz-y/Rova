<script setup lang="ts">
import type { PublicContest } from '../../composables/useContests'
import RovaContestCard from './RovaContestCard.vue'

const props = defineProps<{
  id: string
  eyebrow: string
  live?: boolean
  title: string
  subtext: string
  contests: PublicContest[]
  loading: boolean
  error: string | null
  emptyTitle: string
  emptyBody: string
  emptyCtaTo?: string
  emptyCtaLabel?: string
  viewAllTo: string
  cardVariant: 'live' | 'upcoming'
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <section :id="id" class="contest-section">
    <div class="section-head">
      <div>
        <p class="eyebrow"><span v-if="live" class="live-dot" />{{ eyebrow }}</p>
        <h2>{{ title }}</h2>
        <p class="subtext">{{ subtext }}</p>
      </div>
      <router-link v-if="contests.length > 0" :to="viewAllTo" class="view-all">View all ({{ contests.length }})</router-link>
    </div>

    <div v-if="loading" class="grid">
      <div v-for="n in 3" :key="n" class="skeleton-card" />
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button type="button" @click="$emit('retry')">Try again</button>
    </div>

    <div v-else-if="contests.length === 0" class="empty-state">
      <p class="empty-title">{{ emptyTitle }}</p>
      <p class="empty-body">{{ emptyBody }}</p>
      <router-link v-if="emptyCtaTo" :to="emptyCtaTo" class="empty-cta">{{ emptyCtaLabel }}</router-link>
    </div>

    <div v-else class="grid">
      <RovaContestCard v-for="contest in contests" :key="contest.id" :contest="contest" :variant="cardVariant" />
    </div>
  </section>
</template>

<style scoped>
.contest-section {
  max-width: 1280px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem;
  scroll-margin-top: 4.5rem;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1.1rem;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.25rem;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--rova-red-600);
}

.live-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--rova-red-500);
}

h2 {
  margin: 0 0 0.2rem;
  font-size: 1.4rem;
  color: var(--rova-navy-900);
}

.subtext {
  margin: 0;
  color: var(--rova-ink-muted);
  font-size: 0.85rem;
}

.view-all {
  color: var(--rova-navy-700);
  font-weight: 700;
  font-size: 0.85rem;
  text-decoration: none;
  white-space: nowrap;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.skeleton-card {
  height: 12rem;
  border-radius: var(--rova-radius);
  background: linear-gradient(90deg, var(--rova-surface) 25%, var(--rova-surface-alt) 50%, var(--rova-surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border: 1px solid var(--rova-line);
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.error-state {
  border: 1px solid var(--rova-red-500);
  background: var(--rova-red-bg);
  border-radius: var(--rova-radius);
  padding: 1rem;
  color: var(--rova-red-600);
}

.error-state button {
  margin-top: 0.5rem;
  border: 1px solid var(--rova-red-600);
  background: transparent;
  color: var(--rova-red-600);
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.empty-state {
  border: 1px dashed var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 2rem 1.25rem;
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
  border-radius: 999px;
  padding: 0.6rem 1.2rem;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.85rem;
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
