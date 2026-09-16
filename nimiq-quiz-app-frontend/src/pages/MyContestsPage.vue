<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useContests, type Contest } from '../composables/useContests'
import { useSession } from '../composables/useSession'

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

onMounted(load)
</script>

<template>
  <main class="page">
    <div class="header-row">
      <h1>My Contests</h1>
      <router-link to="/contests/new" class="new-button">+ New Contest</router-link>
    </div>

    <p v-if="!user" class="placeholder">Connect your wallet to create and manage contests.</p>
    <p v-else-if="loading" class="placeholder">Loading…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="contests.length === 0" class="placeholder">
      No contests yet. Create your first one.
    </p>

    <ul v-else class="contest-list">
      <li v-for="contest in contests" :key="contest.id" class="contest-row">
        <router-link :to="`/contests/${contest.id}/edit`" class="contest-title">
          {{ contest.title || '(untitled draft)' }}
        </router-link>
        <span class="status-badge">{{ contest.status }}</span>
        <button class="delete-button" @click="handleDelete(contest.id)">Delete</button>
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
  margin-bottom: 1.5rem;
}

h1 {
  font-size: 1.5rem;
  color: var(--rova-navy-900);
}

.new-button {
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.88rem;
  white-space: nowrap;
}

.placeholder {
  color: var(--rova-ink-muted);
}

.error-text {
  color: var(--rova-red-600);
}

.contest-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.contest-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
}

.contest-title {
  flex: 1;
  color: var(--rova-ink);
  text-decoration: none;
  font-weight: 600;
}

.status-badge {
  font-size: 0.75rem;
  color: var(--rova-ink-muted);
  background: var(--rova-surface-alt);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

.delete-button {
  border: 1px solid var(--rova-red-600);
  background: transparent;
  color: var(--rova-red-600);
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
