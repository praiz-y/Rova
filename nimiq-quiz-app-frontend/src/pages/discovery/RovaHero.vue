<script setup lang="ts">
import type { PublicContestStats } from '../../composables/useContests'
import RovaStatsRow from './RovaStatsRow.vue'

defineProps<{
  stats: PublicContestStats | null
  statsLoading: boolean
}>()
</script>

<template>
  <section class="hero">
    <span class="badge">⚡ WEB3 TRUST LAYER · REAL, ON-CHAIN NIM PRIZE POOLS</span>
    <h1>ROVA</h1>
    <p class="tagline">Create. Compete. Win.</p>
    <p class="description">
      ROVA is a quiz-contest platform for the Nimiq ecosystem. Anyone can create a contest, fund a real NIM prize
      pool, and open it for participants to compete for a chance to win.
    </p>
    <div class="cta-row">
      <a href="#live-now" class="cta-primary">Explore Contests</a>
      <router-link to="/contests/new" class="cta-secondary">Create a Contest</router-link>
    </div>
    <RovaStatsRow :stats="stats" :loading="statsLoading" />
  </section>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
  padding: 2.5rem 1.25rem 2.75rem;
  max-width: 760px;
  margin: 0 auto;
}

.badge {
  display: inline-block;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--rova-navy-700);
}

h1 {
  font-size: clamp(2.75rem, 12vw, 4.5rem);
  font-weight: var(--rova-fw-bold);
  letter-spacing: -0.03em;
  color: var(--rova-navy-900);
  margin: 0;
  line-height: 1;
}

.tagline {
  font-size: clamp(1rem, 3vw, 1.35rem);
  font-weight: 700;
  color: var(--rova-ink);
  margin: 0;
}

.description {
  color: var(--rova-ink-muted);
  font-size: 0.95rem;
  line-height: 1.5;
  max-width: 520px;
  margin: 0;
}

.cta-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin: 0.25rem 0 0.5rem;
}

.cta-primary,
.cta-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.75rem 1.5rem;
  font-weight: 700;
  font-size: 0.92rem;
  text-decoration: none;
}

.cta-primary {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
}

.cta-secondary {
  background: transparent;
  color: var(--rova-navy-900);
  border: 1.5px solid var(--rova-navy-900);
}

@media (min-width: 768px) {
  .hero {
    padding: 4rem 1.25rem 3.5rem;
  }
}
</style>
