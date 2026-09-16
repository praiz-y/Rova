<script setup lang="ts">
import { useSession } from '../composables/useSession'
import { useUserHistory } from '../composables/useUser'
import { onMounted } from 'vue'

const { user } = useSession()
const userId = user?.value?.id ?? ''

const { loading, error, data, fetch } = useUserHistory(userId)

onMounted(() => {
  if (userId) fetch()
})
</script>

<template>
  <main class="page">
    <h1>History</h1>
    <div v-if="!user">
      <p class="placeholder">Please connect your wallet to view your history.</p>
    </div>
    <div v-else>
      <div v-if="loading">Loading...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="data">
        <section>
          <h2>Registrations</h2>
          <table>
            <thead><tr><th>Contest</th><th>Registered At</th></tr></thead>
            <tbody>
              <tr v-for="reg in data.registrations" :key="reg.id">
                <td>{{ reg.title }}</td>
                <td>{{ new Date(reg.registered_at).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2>Quiz Attempts</h2>
          <table>
            <thead><tr><th>Contest</th><th>Score</th><th>Started</th><th>Submitted</th></tr></thead>
            <tbody>
              <tr v-for="att in data.attempts" :key="att.id">
                <td>{{ att.contest_id }}</td>
                <td>{{ att.score ?? '—' }}</td>
                <td>{{ new Date(att.started_at).toLocaleString() }}</td>
                <td>{{ att.submitted_at ? new Date(att.submitted_at).toLocaleString() : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2>Payouts</h2>
          <table>
            <thead><tr><th>Contest</th><th>Amount (NIM)</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="p in data.payouts" :key="p.id">
                <td>{{ p.contest_id }}</td>
                <td>{{ p.amount_nim }}</td>
                <td>{{ p.status }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.page { padding: 2rem 1rem; max-width: 800px; margin: 0 auto; }
h1 { font-size: 1.8rem; margin-bottom: 1rem; }
section { margin-top: 2rem; }
h2 { font-size: 1.4rem; margin-bottom: 0.5rem; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid var(--border); padding: 0.5rem; text-align: left; }
.error { color: var(--error); }
.placeholder { color: var(--text-muted); }
</style>
