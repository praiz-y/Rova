<script setup lang="ts">
import type { PublicContestStats } from '../../composables/useContests'

defineProps<{
  stats: PublicContestStats | null
  loading: boolean
}>()
</script>

<template>
  <div class="stats-row">
    <template v-if="loading || !stats">
      <span class="pill skeleton" />
      <span class="pill skeleton" />
      <span class="pill skeleton" />
    </template>
    <template v-else>
      <span class="pill">{{ stats.contestCount }} Contest{{ stats.contestCount === 1 ? '' : 's' }}</span>
      <span class="pill">{{ stats.participantCount }} Participant{{ stats.participantCount === 1 ? '' : 's' }}</span>
      <span class="pill">{{ stats.nimWonNim }} NIM Won</span>
    </template>
  </div>
</template>

<style scoped>
.stats-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
}

.pill {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: 999px;
  padding: 0.45rem 1rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--rova-navy-900);
}

.skeleton {
  width: 7.5rem;
  height: 1.1rem;
  background: linear-gradient(90deg, var(--rova-line) 25%, var(--rova-surface-alt) 50%, var(--rova-line) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  color: transparent;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
