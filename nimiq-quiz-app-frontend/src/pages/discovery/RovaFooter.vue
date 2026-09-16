<script setup lang="ts">
/**
 * COMMUNITY (X/Telegram/GitHub/Brand Assets) from the mockup is replaced
 * with ACCOUNT — no real social/repo links exist yet (see PRODUCT.md), and
 * fabricating them would violate this project's core honesty principle.
 * "Leaderboards" is replaced too: there's no standalone leaderboards page,
 * only per-contest ones. Terms/Privacy/Contact are dropped entirely — none
 * of those routes exist.
 */
import { useSession } from '../../composables/useSession'

const { user, connecting, connect } = useSession()

async function handleConnect() {
  try {
    await connect()
  } catch {
    // error surfaced via useSession().error in RovaNav
  }
}
</script>

<template>
  <footer class="rova-footer">
    <div class="footer-grid">
      <div class="brand-col">
        <p class="brand-word">ROVA <span class="brand-tag">WIN</span></p>
        <p class="tagline">Create. Compete. Win.</p>
        <p class="desc">A quiz-contest platform for the Nimiq ecosystem, paid in real NIM.</p>
      </div>

      <div class="col">
        <p class="col-title">EXPLORE</p>
        <a href="#how-it-works">How It Works</a>
        <a href="#live-now">Live &amp; Upcoming Contests</a>
        <router-link to="/contests/new">Create a Contest</router-link>
      </div>

      <div class="col">
        <p class="col-title">ACCOUNT</p>
        <router-link to="/contests/mine">My Contests</router-link>
        <router-link to="/profile">Profile</router-link>
        <button v-if="!user" type="button" class="link-btn" :disabled="connecting" @click="handleConnect">
          {{ connecting ? 'Connecting…' : 'Connect Wallet' }}
        </button>
      </div>

      <div class="col">
        <p class="col-title">INTEGRITY</p>
        <p class="integrity-line">Designed for Nimiq Pay</p>
        <p class="integrity-line">Custodied NIM prize pools, signed &amp; broadcast on-chain</p>
        <p class="integrity-line">No smart contracts. No unverified claims.</p>
      </div>
    </div>

    <div class="bottom-bar">
      <p>© 2026 ROVA. Designed for Nimiq Pay.</p>
    </div>
  </footer>
</template>

<style scoped>
.rova-footer {
  border-top: 1px solid var(--rova-line);
  background: var(--rova-surface-alt);
  margin-top: 1rem;
}

.footer-grid {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2.25rem 1.25rem 1.5rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.75rem;
}

.brand-word {
  margin: 0 0 0.3rem;
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--rova-navy-900);
}

.brand-tag {
  font-size: 0.6rem;
  font-weight: 800;
  color: var(--rova-red-600);
  background: var(--rova-red-bg);
  border-radius: 999px;
  padding: 0.1rem 0.35rem;
}

.tagline {
  margin: 0 0 0.5rem;
  font-weight: 700;
  color: var(--rova-ink);
  font-size: 0.85rem;
}

.desc {
  margin: 0;
  color: var(--rova-ink-muted);
  font-size: 0.8rem;
  max-width: 320px;
  line-height: 1.5;
}

.col-title {
  margin: 0 0 0.65rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--rova-ink-muted);
}

.col a,
.col .link-btn {
  display: block;
  color: var(--rova-ink);
  text-decoration: none;
  font-size: 0.85rem;
  margin-bottom: 0.55rem;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.col a:hover,
.col .link-btn:hover {
  color: var(--rova-navy-700);
}

.link-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.integrity-line {
  margin: 0 0 0.55rem;
  font-size: 0.8rem;
  color: var(--rova-ink-muted);
  line-height: 1.4;
}

.bottom-bar {
  border-top: 1px solid var(--rova-line);
  padding: 1rem 1.25rem;
  text-align: center;
}

.bottom-bar p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--rova-ink-muted);
}

@media (min-width: 768px) {
  .footer-grid {
    grid-template-columns: 1.4fr 1fr 1fr 1fr;
  }
}
</style>
