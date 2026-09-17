<script setup lang="ts">
/**
 * A contest's lifecycle status, as a pill.
 *
 * Shared rather than written twice because two surfaces render it and must not
 * drift: the creator's list (MyContestsPage) and the badge on a public contest
 * (ContestDetailPage). The values are the ones evaluateContestStatus writes —
 * see nimiq-quiz-app-backend/src/contests/lifecycle.ts.
 */
defineProps<{ status: string }>()

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  quiz_started: 'Live now',
  quiz_closed: 'Scoring',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** Groups the eight statuses into the five tones the palette actually has. */
const STATUS_TONES: Record<string, string> = {
  draft: 'is-neutral',
  published: 'is-open',
  registration_open: 'is-open',
  registration_closed: 'is-neutral',
  quiz_started: 'is-live',
  quiz_closed: 'is-warn',
  completed: 'is-done',
  cancelled: 'is-cancelled',
}

// Falls back to de-underscoring rather than to a blank pill, so a status added
// on the backend later still renders as something readable.
function label(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

function tone(status: string): string {
  return STATUS_TONES[status] ?? 'is-neutral'
}
</script>

<template>
  <span class="status-badge" :class="tone(status)">
    <span v-if="status === 'quiz_started'" class="live-dot" aria-hidden="true"></span>
    {{ label(status) }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  /* 0.75rem rather than 2xs: on the contest page this pill sits beside the
     prize badge, and at 2xs the two read as different kinds of object. */
  font-size: var(--rova-fs-xs);
  font-weight: var(--rova-fw-bold);
  letter-spacing: 0.03em;
  white-space: nowrap;
}

/* Red is reserved for live/urgent, so only quiz_started gets it; the rest read
   as navy (in play), amber (something to check), or quiet grey. */
.status-badge.is-neutral {
  background: var(--rova-surface-alt);
  color: var(--rova-ink-muted);
}

.status-badge.is-open {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
}

.status-badge.is-live {
  background: var(--rova-red-bg);
  color: var(--rova-red-600);
}

.status-badge.is-warn {
  background: var(--rova-surface-alt);
  color: var(--rova-warning-text);
}

.status-badge.is-done {
  background: var(--rova-surface-alt);
  color: var(--rova-navy-900);
}

.status-badge.is-cancelled {
  background: var(--rova-surface-alt);
  color: var(--rova-red-600);
}

.live-dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--rova-red-500);
}
</style>
