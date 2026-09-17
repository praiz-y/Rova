<script setup lang="ts">
import { ref, watch } from 'vue'
import { useContests, type Contest } from '../composables/useContests'
import { useSession } from '../composables/useSession'
import ContestStatusBadge from '../components/ContestStatusBadge.vue'
import ShareContestLink from '../components/ShareContestLink.vue'
import { canShare } from '../composables/contestStatus'

const { listMine, remove } = useContests()
const { user } = useSession()

const contests = ref<Contest[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    contests.value = await listMine()
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to load contests'
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: string) {
  if (!confirm('Delete this draft? This cannot be undone.')) return
  try {
    await remove(id)
    contests.value = contests.value.filter((c) => c.id !== id)
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to delete contest'
  }
}

/**
 * Wait for the session before asking for the list.
 *
 * App.vue restores the session in its own onMounted, which can resolve after
 * this page has mounted. Loading on mount raced that, and when the session had
 * not landed yet the page fell through to "Connect your wallet" instead of
 * showing contests that were there all along. Watching also means the list
 * appears the moment a reconnect completes, with no reload.
 */
watch(
  user,
  (current) => {
    if (!current) {
      contests.value = []
      loading.value = false
      return
    }
    load()
  },
  { immediate: true }
)
</script>

<template>
  <main class="page">
    <div class="header-row">
      <h1 class="rova-page-title">My Contests</h1>
      <router-link to="/contests/new" class="new-button">+ New Contest</router-link>
    </div>

    <!-- error is checked before !user deliberately. A 401 from
         /api/contests/mine clears the session (invalidateSession in
         useContests.ts), and the old order fell through to "Connect your
         wallet" — which hid the failure behind a message that looked like a
         normal state. -->
    <p v-if="loading" class="placeholder">Loading…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="!user" class="placeholder">Connect your wallet to create and manage contests.</p>

    <div v-else-if="contests.length === 0" class="empty-state">
      <p class="empty-title">No contests yet</p>
      <p class="empty-hint">Create one to get a shareable link and a deposit address.</p>
      <router-link to="/contests/new" class="new-button">+ New Contest</router-link>
    </div>

    <ul v-else class="contest-list">
      <li v-for="contest in contests" :key="contest.id" class="contest-card">
        <div class="card-head">
          <router-link :to="`/contests/${contest.id}/edit`" class="contest-title">
            {{ contest.title || '(untitled draft)' }}
          </router-link>
          <ContestStatusBadge :status="contest.status" />
        </div>

        <div class="card-actions">
          <router-link :to="`/contests/${contest.id}/edit`" class="ghost-btn">Edit</router-link>
          <button class="danger-btn" @click="handleDelete(contest.id)">Delete</button>
        </div>

        <!-- Shares the public page, so it is absent while the contest is still
             a draft or has been cancelled — see canShare. -->
        <div v-if="canShare(contest.status)" class="card-share">
          <ShareContestLink :contest-id="contest.id" :title="contest.title" />
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.page {
  padding: 2rem 1rem;
  max-width: 640px;
  margin: 0 auto;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.new-button {
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  text-decoration: none;
  font-weight: var(--rova-fw-bold);
  font-size: 0.88rem;
  white-space: nowrap;
}

.placeholder {
  color: var(--rova-ink-muted);
}

.error-text {
  color: var(--rova-red-600);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  text-align: center;
  padding: 2.5rem 1rem;
  background: var(--rova-surface);
  border: 1px dashed var(--rova-line);
  border-radius: var(--rova-radius);
}

.empty-title {
  margin: 0;
  font-weight: var(--rova-fw-bold);
  color: var(--rova-navy-900);
}

.empty-hint {
  margin: 0 0 0.85rem;
  font-size: var(--rova-fs-sm);
  color: var(--rova-ink-muted);
}

.contest-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

/* Was one flex row: title, raw status, Delete — with the title free to wrap
   under the badges. Two rows instead, so the title always gets the full
   measure and the actions sit in a predictable place. */
.contest-card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  transition: border-color var(--rova-dur-fast) var(--rova-ease-out);
}

.contest-card:hover {
  border-color: var(--rova-navy-600);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.contest-title {
  min-width: 0;
  color: var(--rova-navy-900);
  text-decoration: none;
  font-weight: var(--rova-fw-bold);
  line-height: var(--rova-lh-snug);
}

.contest-title:hover {
  text-decoration: underline;
}

/* The status pill and its tone classes now live in
   components/ContestStatusBadge.vue, which the contest page renders too. */

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* Separates "manage this contest" from "hand this contest to someone", which
   are different kinds of action and were otherwise three undifferentiated rows
   of controls. */
.card-share {
  border-top: 1px dashed var(--rova-line);
  padding-top: 0.6rem;
}

.ghost-btn,
.danger-btn {
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  font-size: var(--rova-fs-sm);
  font-weight: var(--rova-fw-bold);
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}

.ghost-btn {
  border: 1.5px solid var(--rova-navy-900);
  background: transparent;
  color: var(--rova-navy-900);
}

.danger-btn {
  border: 1.5px solid var(--rova-red-600);
  background: transparent;
  color: var(--rova-red-600);
}
</style>
