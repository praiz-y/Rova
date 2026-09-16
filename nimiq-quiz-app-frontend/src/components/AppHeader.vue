<script setup lang="ts">
import { ref } from 'vue'
import { useProviders } from '../composables/useProviders'
import { useSession } from '../composables/useSession'
import UsernamePrompt from './UsernamePrompt.vue'

const { nimiqReady, nimiqConnecting, nimiqError, walletMode } = useProviders()
const { user, connecting, error, connect } = useSession()

const showUsernamePrompt = ref(false)

async function handleConnect() {
  try {
    await connect()
    if (user.value && !user.value.username) {
      showUsernamePrompt.value = true
    }
  } catch {
    // error is already surfaced via useSession().error
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
</script>

<template>
  <header class="app-header">
    <router-link to="/" class="brand">ROVA</router-link>

    <nav class="nav">
      <router-link to="/">Discover</router-link>
      <router-link v-if="user" to="/contests/mine">My Contests</router-link>
      <router-link to="/profile">Profile</router-link>
    </nav>

    <div class="wallet-area">
      <span v-if="nimiqConnecting" class="status-text">Detecting wallet…</span>
      <span v-else-if="!nimiqReady" class="status-text warning">Wallet unavailable — reload to try again</span>
      <template v-else-if="!user">
        <button @click="handleConnect" :disabled="connecting">
          {{ connecting ? 'Connecting…' : 'Connect Wallet' }}
        </button>
        <span class="status-text wallet-mode">{{ walletMode === 'hub' ? 'via Nimiq Hub' : 'via Nimiq Pay' }}</span>
      </template>
      <button v-else class="identity" @click="showUsernamePrompt = !user.username">
        {{ user.username ?? shortAddress(user.address) }}
      </button>
    </div>

    <p v-if="error" class="error-banner">{{ error }}</p>
    <p v-else-if="nimiqError" class="error-banner">{{ nimiqError }}</p>

    <UsernamePrompt v-if="showUsernamePrompt" @done="showUsernamePrompt = false" />
  </header>
</template>

<style scoped>
/* Mirrors RovaNav.vue's treatment (sticky cream bar, navy wordmark, pill
   buttons) so the two headers stay visually consistent. They are separate
   components by design — this one serves every non-ROVA route. */
.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.85rem 1.25rem;
  background: var(--rova-bg);
  border-bottom: 1px solid var(--rova-line);
  position: sticky;
  top: 0;
  z-index: 20;
}

.brand {
  font-size: 1.3rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--rova-navy-900);
  text-decoration: none;
  flex-shrink: 0;
}

.nav {
  display: flex;
  gap: 1rem;
  flex: 1;
}

.nav a {
  color: var(--rova-ink-muted);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 600;
}

.nav a:hover,
.nav a.router-link-active {
  color: var(--rova-navy-900);
}

.wallet-area button {
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  border: none;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.wallet-area button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-text {
  font-size: 0.85rem;
  color: var(--rova-ink-muted);
}

.status-text.warning {
  color: var(--rova-warning-text);
}

.status-text.wallet-mode {
  margin-left: 0.5rem;
}

.error-banner {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.5rem 1rem;
  background: var(--rova-red-bg);
  color: var(--rova-red-600);
  font-size: 0.85rem;
}

@media (max-width: 640px) {
  .app-header {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .nav {
    order: 3;
    flex-basis: 100%;
    overflow-x: auto;
    gap: 0.75rem;
    padding-bottom: 0.15rem;
  }

  .wallet-area {
    margin-left: auto;
  }
}
</style>
