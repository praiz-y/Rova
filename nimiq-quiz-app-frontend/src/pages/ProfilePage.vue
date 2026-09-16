<script setup lang="ts">
import { useSession } from '../composables/useSession'

// Stub for Phase 1. Contest/participation/win history is built in Phase 9.
// Session is restored globally in App.vue (D030), no need to refresh here too.
const { user } = useSession()
</script>

<template>
  <main class="page">
    <h1>Profile</h1>
    <div v-if="user" class="profile-card">
      <p><strong>Username:</strong> {{ user.username ?? '(not set)' }}</p>
      <p><strong>Address:</strong> <code>{{ user.address }}</code></p>
    </div>
    <p v-else class="placeholder">Connect your wallet to see your profile.</p>
  </main>
</template>

<style scoped>
.page {
  padding: 2rem 1rem;
  max-width: 480px;
  margin: 0 auto;
}

h1 {
  font-size: 1.5rem;
  margin: 0 0 1rem 0;
  color: var(--rova-navy-900);
}

.profile-card {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1rem;
}

.profile-card code {
  font-size: 0.8rem;
  word-break: break-all;
}

.placeholder {
  color: var(--rova-ink-muted);
}
</style>
