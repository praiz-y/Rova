<template>
  <div class="analytics-dashboard">
    <h2>Platform Stats Overview</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Contests</h3>
        <p>{{ stats.totalContests }}</p>
      </div>
      <div class="stat-card">
        <h3>Total Participants</h3>
        <p>{{ stats.totalParticipants }}</p>
      </div>
      <div class="stat-card">
        <h3>Total Payouts</h3>
        <p>{{ stats.totalPayouts }}</p>
      </div>
      <div class="stat-card">
        <h3>Successful Payouts</h3>
        <p>{{ stats.successfulPayouts }}</p>
      </div>
      <div class="stat-card">
        <h3>Payout Success Rate</h3>
        <p>{{ stats.payoutSuccessRate ? stats.payoutSuccessRate.toFixed(1) : 0 }} %</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const stats = ref({
  totalContests: 0,
  totalParticipants: 0,
  totalPayouts: 0,
  successfulPayouts: 0,
  payoutSuccessRate: 0,
});
</script>

<style scoped>
.analytics-dashboard { padding: 1rem; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.stat-card { background: var(--surface); padding: 1rem; border-radius: 8px; text-align: center; }
.stat-card h3 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--text-muted); }
.stat-card p { margin: 0; font-size: 1.4rem; font-weight: 600; color: var(--accent); }
</style>
