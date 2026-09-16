<template>
  <div class="contest-analytics">
    <div class="header-row">
      <h2>Contest Analytics</h2>
      <div v-if="contestId" class="contest-id-badge">Contest: {{ contestId }}</div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading analytics data...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="fetchData">Retry</button>
    </div>

    <div v-else class="charts-grid">
      <!-- Chart 1: Registration Trend -->
      <div class="chart-card">
        <h3>Registration Trend Over Time</h3>
        <div class="chart-container">
          <canvas ref="trendCanvas"></canvas>
        </div>
      </div>

      <!-- Chart 2: Prize Pool & Distribution -->
      <div class="chart-card">
        <h3>Prize Pool & Distribution (NIM)</h3>
        <div class="prize-summary" v-if="analyticsData?.prizeInfo">
          <span>Total Prize Pool: <strong>{{ analyticsData.prizeInfo.prizePoolNim }} NIM</strong></span>
          <span>Winners: <strong>{{ analyticsData.prizeInfo.winnerCount }}</strong></span>
        </div>
        <div class="chart-container">
          <canvas ref="prizeCanvas"></canvas>
        </div>
      </div>

      <!-- Chart 3: Payout Health -->
      <div class="chart-card">
        <h3>Payout Health</h3>
        <div class="payout-summary" v-if="analyticsData?.payoutHealth">
          <span class="p-success">Successful: {{ analyticsData.payoutHealth.successful }}</span>
          <span class="p-pending">Pending: {{ analyticsData.payoutHealth.pending }}</span>
          <span class="p-failed">Failed: {{ analyticsData.payoutHealth.failed }}</span>
        </div>
        <div class="chart-container">
          <canvas ref="payoutCanvas"></canvas>
        </div>
      </div>

      <!-- Chart 4: Completion / Submission Rate -->
      <div class="chart-card">
        <h3>Submission & Completion Rate</h3>
        <div class="rate-summary" v-if="analyticsData?.submissionRate">
          <span>Completion Rate: <strong>{{ analyticsData.submissionRate.completionRatePercentage }}%</strong></span>
        </div>
        <div class="chart-container">
          <canvas ref="submissionCanvas"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';
import Chart from 'chart.js/auto';
import { useAdmin } from '@/composables/useAdmin';

const props = defineProps({
  contestId: { type: String, required: true }
});

const { getContestAnalytics } = useAdmin();

const loading = ref(true);
const error = ref<string | null>(null);
const analyticsData = ref<any>(null);

const trendCanvas = ref<HTMLCanvasElement | null>(null);
const prizeCanvas = ref<HTMLCanvasElement | null>(null);
const payoutCanvas = ref<HTMLCanvasElement | null>(null);
const submissionCanvas = ref<HTMLCanvasElement | null>(null);

let chartInstances: Chart[] = [];

function destroyCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
}

onBeforeUnmount(() => {
  destroyCharts();
});

async function fetchData() {
  if (!props.contestId) {
    error.value = 'Please select a contest to view analytics.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const data = await getContestAnalytics(props.contestId);
    analyticsData.value = data;
    loading.value = false;
    await nextTick();
    renderCharts();
  } catch (err: any) {
    error.value = err.message || 'Failed to load contest analytics.';
    loading.value = false;
  }
}

function renderCharts() {
  destroyCharts();
  if (!analyticsData.value) return;

  // ROVA chart palette. These were white-alpha / near-white values suited to
  // a dark background; on the cream-and-white ROVA surfaces they'd be
  // invisible, so the grid is the brand rule color and text is ink-muted.
  const gridColor = '#e6dcc2';
  const textColor = '#6e6a5e';
  const navy = '#0f1b33';
  const red = '#e9483a';
  const redSoft = 'rgba(233, 72, 58, 0.15)';
  const amber = '#8a5a00';
  const redDeep = '#d23a2e';

  // 1. Registration Trend Chart (Line)
  if (trendCanvas.value) {
    const labels = analyticsData.value.registrationTrend?.map((r: any) => r.date) || [];
    const counts = analyticsData.value.registrationTrend?.map((r: any) => r.count) || [];
    const chart = new Chart(trendCanvas.value, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [{
          label: 'Registrations',
          data: counts.length ? counts : [0],
          borderColor: red,
          backgroundColor: redSoft,
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true }
        }
      }
    });
    chartInstances.push(chart);
  }

  // 2. Prize Distribution Chart (Bar)
  if (prizeCanvas.value) {
    const dist = analyticsData.value.prizeInfo?.distribution || [];
    const labels = dist.length ? dist.map((d: any) => `Rank ${d.rank}`) : ['Prize Pool'];
    const amounts = dist.length ? dist.map((d: any) => parseFloat(d.amountNim || '0')) : [parseFloat(analyticsData.value.prizeInfo?.prizePoolNim || '0')];
    const chart = new Chart(prizeCanvas.value, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Prize Amount (NIM)',
          data: amounts,
          backgroundColor: navy,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true }
        }
      }
    });
    chartInstances.push(chart);
  }

  // 3. Payout Health Chart (Doughnut)
  if (payoutCanvas.value) {
    const ph = analyticsData.value.payoutHealth || { successful: 0, pending: 0, failed: 0 };
    const chart = new Chart(payoutCanvas.value, {
      type: 'doughnut',
      data: {
        labels: ['Successful', 'Pending', 'Failed'],
        datasets: [{
          data: [ph.successful, ph.pending, ph.failed],
          backgroundColor: [navy, amber, redDeep],
          borderWidth: 1,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } }
      }
    });
    chartInstances.push(chart);
  }

  // 4. Submission & Completion Rate Chart (Bar)
  if (submissionCanvas.value) {
    const sr = analyticsData.value.submissionRate || { registered: 0, submitted: 0 };
    const chart = new Chart(submissionCanvas.value, {
      type: 'bar',
      data: {
        labels: ['Registered Users', 'Submitted Quizzes'],
        datasets: [{
          label: 'Count',
          data: [sr.registered, sr.submitted],
          backgroundColor: ['#1d3060', red],
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true }
        }
      }
    });
    chartInstances.push(chart);
  }
}

watch(() => props.contestId, () => {
  fetchData();
});

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.contest-analytics {
  margin-top: 1rem;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.contest-id-badge {
  background: var(--rova-surface-alt);
  color: var(--rova-navy-900);
  border: 1px solid var(--rova-line);
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-family: monospace;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
}

.chart-card {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
}

.chart-card h3 {
  margin-top: 0;
  margin-bottom: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--rova-navy-900);
}

.prize-summary, .payout-summary, .rate-summary {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
  color: var(--rova-ink-muted);
}

.p-success { color: var(--rova-navy-900); }
.p-pending { color: var(--rova-warning-text); }
.p-failed { color: var(--rova-red-600); }

.chart-container {
  position: relative;
  height: 250px;
  width: 100%;
}

.loading-state, .error-state {
  text-align: center;
  padding: 3rem;
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  color: var(--rova-ink-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--rova-red-bg);
  border-top-color: var(--rova-red-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
