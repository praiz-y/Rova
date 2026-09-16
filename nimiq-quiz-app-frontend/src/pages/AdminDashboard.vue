// src/pages/AdminDashboard.vue
<template>
  <div class="admin-dashboard">
    <h1>Admin Dashboard</h1>
    <div class="tabs">
      <button :class="{ active: activeTab === 'contests' }" @click="activeTab = 'contests'">Contests</button>
      <button :class="{ active: activeTab === 'analytics' }" @click="activeTab = 'analytics'">Analytics</button>
      <button :class="{ active: activeTab === 'participants' }" @click="activeTab = 'participants'">Participants</button>
      <button :class="{ active: activeTab === 'deposits' }" @click="activeTab = 'deposits'">Deposits</button>
      <button :class="{ active: activeTab === 'payouts' }" @click="activeTab = 'payouts'">Payouts</button>
    </div>

    <div v-if="selectedContestId" class="selected-contest-banner">
      <span>Active Selected Contest ID: <strong>{{ selectedContestId }}</strong></span>
    </div>

    <section v-if="activeTab === 'contests'" class="tab-content">
      <ContestFilters @filter-changed="onFilterChanged" />
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="c in contests" 
            :key="c.id" 
            :class="['clickable-row', { selected: selectedContestId === c.id }]"
            @click="selectedContestId = c.id"
          >
            <td>{{ c.id }}</td>
            <td>{{ c.title }}</td>
            <td>{{ c.status }}</td>
            <td>{{ new Date(c.createdAt).toLocaleString() }}</td>
            <td>{{ new Date(c.updatedAt).toLocaleString() }}</td>
            <td>
              <button class="select-btn" @click.stop="selectedContestId = c.id; activeTab = 'analytics'">Analytics</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="pagination">
        <button @click="prevPage" :disabled="page <= 1">Prev</button>
        <span>Page {{ page }} of {{ totalPages }}</span>
        <button @click="nextPage" :disabled="page >= totalPages">Next</button>
      </div>
    </section>

    <section v-else-if="activeTab === 'analytics'" class="tab-content">
      <div class="contest-selector" v-if="contests.length">
        <label>Select Contest: </label>
        <select v-model="selectedContestId">
          <option v-for="c in contests" :key="c.id" :value="c.id">{{ c.title }} ({{ c.id.slice(0, 8) }}...)</option>
        </select>
      </div>
      <ContestAnalytics :contestId="selectedContestId" />
    </section>

    <section v-else-if="activeTab === 'participants'" class="tab-content">
      <div class="contest-selector" v-if="contests.length">
        <label>Select Contest: </label>
        <select v-model="selectedContestId">
          <option v-for="c in contests" :key="c.id" :value="c.id">{{ c.title }} ({{ c.id.slice(0, 8) }}...)</option>
        </select>
      </div>
      <ParticipantList v-if="selectedContestId" :contestId="selectedContestId" />
      <p v-else class="empty-msg">Please select a contest from the Contests tab first.</p>
    </section>

    <section v-else-if="activeTab === 'deposits'" class="tab-content">
      <div class="info-card">
        <h3>Deposit Management</h3>
        <p>Deposit & payment architecture is deferred pending finalization of on-chain payment models.</p>
      </div>
    </section>

    <section v-else-if="activeTab === 'payouts'" class="tab-content">
      <div class="contest-selector" v-if="contests.length">
        <label>Select Contest: </label>
        <select v-model="selectedContestId">
          <option v-for="c in contests" :key="c.id" :value="c.id">{{ c.title }} ({{ c.id.slice(0, 8) }}...)</option>
        </select>
      </div>
      <PayoutAuditTrail v-if="selectedContestId" :contestId="selectedContestId" />
      <p v-else class="empty-msg">Please select a contest from the Contests tab first.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ContestFilters from '@/components/ContestFilters.vue';
import ContestAnalytics from '@/components/ContestAnalytics.vue';
import PayoutAuditTrail from '@/components/PayoutAuditTrail.vue';
import ParticipantList from '@/components/ParticipantList.vue';
import { useAdmin } from '@/composables/useAdmin';

const activeTab = ref<'contests' | 'analytics' | 'participants' | 'deposits' | 'payouts'>('contests');

// pagination state
const page = ref(1);
const limit = 50;
const total = ref(0);

const filters = ref({
  status: '' as string,
  title: '' as string,
  sponsor: '' as string,
  dateFrom: '' as string,
  dateTo: '' as string,
});

const { listContests } = useAdmin();

const contests = ref<any[]>([]);
const selectedContestId = ref<string>('');

const totalPages = computed(() => Math.ceil(total.value / limit));

async function loadContests() {
  const { contests: list, total: cnt } = await listContests({
    ...filters.value,
    page: page.value,
    limit,
  });
  contests.value = list;
  total.value = cnt;
  if (list.length > 0 && !selectedContestId.value) {
    selectedContestId.value = list[0].id;
  }
}

function onFilterChanged(newFilters: any) {
  filters.value = newFilters;
  page.value = 1; // reset to first page
  loadContests();
}

function prevPage() {
  if (page.value > 1) {
    page.value--;
    loadContests();
  }
}
function nextPage() {
  if (page.value < totalPages.value) {
    page.value++;
    loadContests();
  }
}

watch([page, filters], () => {
  loadContests();
});

// initial load
loadContests();
</script>

<style scoped>
.admin-dashboard { max-width: 1200px; margin: 0 auto; padding: 2rem; }
.tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.tabs button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--rova-line);
  background: var(--rova-surface);
  color: var(--rova-ink-muted);
  cursor: pointer;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.85rem;
}
.tabs button.active { background: var(--rova-navy-900); color: var(--rova-on-navy); border-color: var(--rova-navy-900); }
.admin-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
.admin-table th, .admin-table td { padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--rova-line); text-align: left; }
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: var(--rova-surface-alt); }
.clickable-row.selected { background: var(--rova-surface-alt); }
.pagination { margin-top: 1rem; display: flex; align-items: center; gap: 1rem; }
.contest-selector { margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
.contest-selector select {
  padding: 0.4rem 0.8rem;
  border-radius: var(--rova-radius-sm);
  background: var(--rova-surface-alt);
  color: var(--rova-ink);
  border: 1px solid var(--rova-line);
}
.selected-contest-banner {
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  font-size: 0.9rem;
  color: var(--rova-navy-900);
}
.select-btn {
  padding: 0.25rem 0.7rem;
  font-size: 0.8rem;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  border: none;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}
.info-card {
  padding: 2rem;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
}
.empty-msg { padding: 2rem; color: var(--rova-ink-muted); }
</style>
