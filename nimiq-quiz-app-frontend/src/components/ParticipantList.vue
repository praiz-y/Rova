<template>
  <div class="participant-list">
    <h2>Participants</h2>
    <div class="filters">
      <input v-model="search" placeholder="Search by user ID or username" @input="loadParticipants" />
      <button @click="exportCsv">Export CSV</button>
    </div>
    <table class="admin-table">
      <thead>
        <tr>
          <th>User ID</th>
          <th>Username</th>
          <th>Status</th>
          <th>Registered At</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in participants" :key="p.id">
          <td>{{ p.userId }}</td>
          <td>{{ p.username ?? '-' }}</td>
          <td>
            <span :class="['status-badge', p.requirementsConfirmed ? 'status-confirmed' : 'status-pending']">
              {{ p.requirementsConfirmed ? 'Confirmed' : 'Pending' }}
            </span>
          </td>
          <td>{{ new Date(p.createdAt).toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
    <div class="pagination">
      <button @click="prevPage" :disabled="page <= 1">Prev</button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button @click="nextPage" :disabled="page >= totalPages">Next</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAdmin } from '@/composables/useAdmin';

const props = defineProps({
  contestId: { type: String, required: true }
});

const page = ref(1);
const limit = 50;
const total = ref(0);
const search = ref('');


const participants = ref<any[]>([]);

const totalPages = computed(() => Math.ceil(total.value / limit));

const { listRegistrationsByContest } = useAdmin(); // helper to be added in backend

async function loadParticipants() {
  const { participants: list, total: cnt } = await listRegistrationsByContest({
    contestId: props.contestId,
    search: search.value,
    page: page.value,
    limit,
  });
  participants.value = list;
  total.value = cnt;
}


function prevPage() { if (page.value > 1) { page.value--; loadParticipants(); } }
function nextPage() { if (page.value < totalPages.value) { page.value++; loadParticipants(); } }

function exportCsv() {
  const headers = ['User ID', 'Username', 'Status', 'Registered At'];
  const rows = participants.value.map(p => [
    p.userId,
    p.username ?? '',
    p.requirementsConfirmed ? 'Confirmed' : 'Pending',
    new Date(p.createdAt).toISOString()
  ]);
  const csvContent = [headers, ...rows]
    .map(e => e.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `participants_contest_${props.contestId}.csv`);
  link.click();
}

watch([page, search], () => { loadParticipants(); });

loadParticipants();
</script>

<style scoped>
.participant-list { margin-top: 1rem; }
.filters { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
.status-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}
.status-confirmed {
  background: var(--rova-surface-alt);
  color: var(--rova-navy-900);
  border: 1px solid var(--rova-line);
}
.status-pending {
  background: var(--rova-surface-alt);
  color: var(--rova-warning-text);
  border: 1px solid var(--rova-warning-text);
}
</style>
