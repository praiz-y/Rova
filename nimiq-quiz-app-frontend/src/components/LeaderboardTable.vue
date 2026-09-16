<script setup lang="ts">
import type { LeaderboardEntry, PrizePayout } from '../composables/useContests'

const props = defineProps<{
  leaderboard: LeaderboardEntry[]
  isFree?: boolean
  payouts?: PrizePayout[]
}>()

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇 '
  if (rank === 2) return '🥈 '
  if (rank === 3) return '🥉 '
  return `#${rank}`
}

function getPayoutForEntry(entry: LeaderboardEntry): PrizePayout | undefined {
  if (!props.payouts) return undefined
  return props.payouts.find((p) => p.userId === entry.userId || p.rank === entry.rank)
}
</script>

<template>
  <div class="leaderboard-container">
    <div v-if="!props.leaderboard || props.leaderboard.length === 0" class="empty-state">
      No finalized submissions yet.
    </div>

    <table v-else class="leaderboard-table">
      <thead>
        <tr>
          <th class="rank-col">Rank</th>
          <th class="player-col">Participant</th>
          <th class="score-col">Score</th>
          <th class="time-col">Time</th>
          <th v-if="!props.isFree" class="prize-col">Prize Allocation</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in props.leaderboard"
          :key="entry.userId"
          :class="{ 'top-three': entry.rank <= 3 }"
        >
          <td class="rank-col">
            <span class="rank-badge" :class="`rank-${entry.rank}`">
              {{ rankMedal(entry.rank) }}
            </span>
          </td>
          <td class="player-col">
            <div class="player-info">
              <span class="username">{{ entry.username ?? 'Anonymous Player' }}</span>
              <span class="address">{{ truncateAddress(entry.address) }}</span>
            </div>
          </td>
          <td class="score-col">
            <span class="score-value">{{ entry.score }}</span>
          </td>
          <td class="time-col font-mono">
            {{ formatTime(entry.completionSeconds) }}
          </td>
          <td v-if="!props.isFree" class="prize-col">
            <div v-if="entry.prizeNim" class="prize-box">
              <span class="prize-pill">💰 {{ entry.prizeNim }} NIM</span>
              <span
                v-if="getPayoutForEntry(entry)"
                class="payout-badge"
                :class="getPayoutForEntry(entry)?.status"
              >
                {{ getPayoutForEntry(entry)?.status === 'confirmed' ? 'Paid 🟢' : getPayoutForEntry(entry)?.status }}
              </span>
            </div>
            <span v-else class="no-prize">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>


<style scoped>
.leaderboard-container {
  width: 100%;
  overflow-x: auto;
  margin-top: 1rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--rova-ink-muted);
  font-style: italic;
}

.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.95rem;
}

.leaderboard-table th {
  padding: 0.8rem 1rem;
  border-bottom: 2px solid var(--rova-line);
  color: var(--rova-ink-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.leaderboard-table td {
  padding: 0.9rem 1rem;
  border-bottom: 1px solid var(--rova-line);
}

.leaderboard-table tr:hover {
  background: var(--rova-surface-alt);
}

.player-info {
  display: flex;
  flex-direction: column;
}

.username {
  font-weight: 600;
  color: var(--rova-ink);
}

.address {
  font-size: 0.75rem;
  color: var(--rova-ink-muted);
  font-family: monospace;
}

.score-value {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--rova-navy-900);
}

.font-mono {
  font-family: monospace;
}

.rank-badge {
  font-weight: 700;
}

.prize-pill {
  display: inline-block;
  background: var(--rova-surface-alt);
  color: var(--rova-navy-900);
  border: 1px solid var(--rova-line);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.85rem;
}

.no-prize {
  color: var(--rova-ink-muted);
}
</style>
