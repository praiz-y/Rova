// src/components/PayoutAuditTrail.vue
<template>
  <div class="payout-audit">
    <h2>Payout Audit Trail</h2>
    <table class="audit-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>User</th>
          <th>Rank</th>
          <th>Amount (NIM)</th>
          <th>Status</th>
          <th>Tx Hash</th>
          <th>Created</th>
          <th>Updated</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in payouts" :key="p.id">
          <td>{{ p.id }}</td>
          <td>{{ p.userId }}</td>
          <td>{{ p.rank }}</td>
          <td>{{ p.amountNim }}</td>
          <td>{{ p.status }}</td>
          <td>{{ p.txHash ?? '-' }}</td>
          <td>{{ new Date(p.createdAt).toLocaleString() }}</td>
          <td>{{ new Date(p.updatedAt).toLocaleString() }}</td>
          <td>{{ p.errorMessage ?? '-' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAdmin } from '@/composables/useAdmin';


const props = defineProps({
  contestId: { type: String, required: true }
});

const payouts = ref<any[]>([]);
const { getPayoutsByContest } = useAdmin();

async function load() {
  payouts.value = await getPayoutsByContest(props.contestId);
}

onMounted(load);
</script>

<style scoped>
.payout-audit { margin-top: 1rem; }
.audit-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
}
/* Nine columns of audit data: the vertical rules are load-bearing here, so this
   keeps the full cell grid rather than the row-rule treatment used elsewhere. */
.audit-table th, .audit-table td {
  padding: 0.5rem;
  border: 1px solid var(--rova-line);
  text-align: left;
}
.audit-table th {
  background: var(--rova-surface-alt);
  color: var(--rova-navy-900);
  font-size: 0.85rem;
  white-space: nowrap;
}
.audit-table td { font-size: 0.85rem; }
</style>
