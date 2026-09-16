<script setup lang="ts">
/**
 * This page's own header — replaces the global AppHeader.vue visually only
 * on the discovery route (see App.vue's route-gated <AppHeader v-if>).
 * Wallet-connect logic is ported, not reimplemented: same useProviders()/
 * useSession() calls AppHeader.vue itself uses.
 */
import { ref } from 'vue'
import { useProviders } from '../../composables/useProviders'
import { useSession } from '../../composables/useSession'
import UsernamePrompt from '../../components/UsernamePrompt.vue'

const { nimiqReady, nimiqConnecting, walletMode } = useProviders()
const { user, connecting, connect } = useSession()

const showUsernamePrompt = ref(false)

async function handleConnect() {
  try {
    await connect()
    if (user.value && !user.value.username) {
      showUsernamePrompt.value = true
    }
  } catch {
    // error surfaced via useSession().error elsewhere (RovaFooter's Connect Wallet mirrors this too)
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
</script>

<template>
  <header class="rova-nav">
    <div class="rova-nav-inner">
      <router-link to="/" class="brand">
        <span class="brand-word">ROVA</span>
        <span class="brand-tag">WIN</span>
      </router-link>

      <nav class="links">
        <a href="/#how-it-works">How It Works</a>
        <router-link to="/contests">Contests</router-link>
      </nav>

      <div class="actions">
        <router-link to="/contests/new" class="create-link">+ Create</router-link>
        <span v-if="nimiqConnecting" class="status-text">Detecting wallet…</span>
        <button v-else-if="!user" class="connect-btn" :disabled="connecting || !nimiqReady" @click="handleConnect">
          {{ connecting ? 'Connecting…' : 'Connect Wallet' }}
        </button>
        <router-link v-else to="/profile" class="identity">
          {{ user.username ?? shortAddress(user.address) }}
        </router-link>
        <span v-if="!nimiqConnecting && walletMode" class="wallet-mode">{{ walletMode === 'hub' ? 'via Hub' : 'via Nimiq Pay' }}</span>
      </div>
    </div>

    <UsernamePrompt v-if="showUsernamePrompt" @done="showUsernamePrompt = false" />
  </header>
</template>

<style scoped>
.rova-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--rova-bg);
  border-bottom: 1px solid var(--rova-line);
}

.rova-nav-inner {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.85rem 1.25rem;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  text-decoration: none;
  flex-shrink: 0;
}

.brand-word {
  font-size: 1.3rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--rova-navy-900);
}

.brand-tag {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--rova-red-600);
  background: var(--rova-red-bg);
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
}

.links {
  display: none;
  gap: 1.5rem;
  flex: 1;
}

.links a {
  color: var(--rova-ink-muted);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 600;
}

.links a:hover {
  color: var(--rova-navy-900);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-left: auto;
}

.create-link {
  display: none;
  color: var(--rova-navy-700);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.9rem;
}

.status-text {
  font-size: 0.8rem;
  color: var(--rova-ink-muted);
}

.connect-btn {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1.1rem;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.identity {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  text-decoration: none;
  font-size: 0.68rem;
  font-weight: 700;
  text-align: center;
  padding: 0.25rem;
  overflow: hidden;
}

.wallet-mode {
  display: none;
  font-size: 0.68rem;
  color: var(--rova-ink-muted);
}

@media (min-width: 768px) {
  .links {
    display: flex;
  }

  .create-link {
    display: inline;
  }

  .wallet-mode {
    display: inline;
  }

  .identity {
    width: auto;
    height: auto;
    border-radius: 999px;
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
  }
}
</style>
