<script setup lang="ts">
/**
 * The one header for every route — home, /contests, and every inner page.
 * It replaced RovaNav.vue, which used to serve only the ROVA-layout routes;
 * two headers meant two places to keep in sync and they had already drifted
 * (different link sets, different identity treatment). Layout follows the
 * desktop reference: links left, wordmark centred, actions right.
 *
 * The identity pill is the wallet control, not a profile link. Hovering it
 * (mouse) or tapping it (touch) is how you disconnect. Profile is its own
 * link in the right rail (and a tab in the bottom bar on mobile), and the
 * username is set from ProfilePage — deliberately, so this pill has exactly
 * one job.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useProviders } from '../composables/useProviders'
import { useSession } from '../composables/useSession'
import UsernamePrompt from './UsernamePrompt.vue'

const { nimiqReady, nimiqConnecting, nimiqError, walletMode } = useProviders()
const { user, connecting, error, connect, logout } = useSession()

const showUsernamePrompt = ref(false)
const identityHovered = ref(false)
const disconnectMenuOpen = ref(false)
const identityWrap = ref<HTMLElement | null>(null)

/**
 * (hover: hover) separates a real pointer from a touch screen. This must be a
 * media query rather than mouseenter alone: several mobile browsers fire
 * mouseenter on the first tap, and since hover means "disconnect" here, that
 * would turn an ambiguous tap into an irreversible action.
 */
const HOVER_QUERY = '(hover: hover) and (pointer: fine)'
const canHover = ref(window.matchMedia(HOVER_QUERY).matches)

let hoverQuery: MediaQueryList | null = null

function syncHover(e: MediaQueryList | MediaQueryListEvent) {
  canHover.value = e.matches
}

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

async function handleDisconnect() {
  disconnectMenuOpen.value = false
  identityHovered.value = false
  try {
    await logout()
  } catch {
    // logout() clears the local session in a finally block, so the header has
    // already reverted to "Connect Wallet". A failed server call isn't worth
    // an error banner on a deliberate disconnect.
  }
}

function onIdentityEnter() {
  if (canHover.value) identityHovered.value = true
}

function onIdentityLeave() {
  identityHovered.value = false
}

/**
 * Mouse: reaching a click means the pointer is over the pill, so the label
 * already reads "Disconnect" — the click means what the label says.
 * Touch: no hover state exists, so the tap opens the menu instead.
 */
function onIdentityClick() {
  if (canHover.value) handleDisconnect()
  else disconnectMenuOpen.value = !disconnectMenuOpen.value
}

function onDocumentClick(e: MouseEvent) {
  if (!disconnectMenuOpen.value) return
  // The pill lives inside the wrapper, so its own tap doesn't close the menu
  // it just opened; anything outside does.
  if (identityWrap.value && !identityWrap.value.contains(e.target as Node)) {
    disconnectMenuOpen.value = false
  }
}

onMounted(() => {
  hoverQuery = window.matchMedia(HOVER_QUERY)
  hoverQuery.addEventListener('change', syncHover)
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  hoverQuery?.removeEventListener('change', syncHover)
  document.removeEventListener('click', onDocumentClick)
})

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <nav class="nav-left">
        <a href="/#how-it-works">How It Works</a>
        <router-link to="/contests">Contests</router-link>
      </nav>

      <!-- The mark carries alt="" deliberately: the word "ROVA" sits right
           beside it in the same link, so a label here would have screen
           readers announce the brand twice. -->
      <router-link to="/" class="brand">
        <img src="/rova-mark.png" alt="" class="brand-mark" />
        <span>ROVA</span>
      </router-link>

      <div class="nav-right">
        <router-link to="/contests/new" class="create-link">
          <span class="plus" aria-hidden="true">+</span> Create
        </router-link>

        <!-- Profile sits in the right rail beside the identity pill: it is an
             account action, not a browse destination, so it belongs with the
             wallet rather than with How It Works and Contests.
             "My Contests" is gone from the header entirely — it is reached
             from inside Profile now. A header slot for a list you own was
             crowding out the two links that actually describe the product. -->
        <router-link v-if="user" to="/profile" class="nav-link">Profile</router-link>

        <span v-if="nimiqConnecting" class="status-text">Detecting wallet…</span>
        <span v-else-if="!nimiqReady" class="status-text warning">Wallet unavailable</span>
        <template v-else-if="!user">
          <button @click="handleConnect" :disabled="connecting" class="connect-btn">
            {{ connecting ? 'Connecting…' : 'Connect Wallet' }}
          </button>
          <span class="status-text wallet-mode">
            {{ walletMode === 'hub' ? 'via Hub' : 'via Nimiq Pay' }}
          </span>
        </template>
        <!-- Continues the chain above: reached only when a user is connected. -->
        <template v-else>
          <div
            ref="identityWrap"
            class="identity-wrap"
            @mouseenter="onIdentityEnter"
            @mouseleave="onIdentityLeave"
          >
            <button
              class="identity"
              :class="{ danger: identityHovered }"
              @click="onIdentityClick"
            >
              {{ identityHovered ? 'Disconnect' : (user.username ?? shortAddress(user.address)) }}
            </button>

            <!-- Touch only — the tap above opens this instead of disconnecting
                 outright, so a stray tap can't drop the session. -->
            <button
              v-if="disconnectMenuOpen"
              class="disconnect"
              @click="handleDisconnect"
            >
              Disconnect Wallet
            </button>
          </div>
        </template>
      </div>
    </div>

    <p v-if="error" class="error-banner">{{ error }}</p>
    <p v-else-if="nimiqError" class="error-banner">{{ nimiqError }}</p>

    <!-- Teleported to <body> deliberately. .app-header carries a
         backdrop-filter (see the @supports block in the styles), and
         backdrop-filter makes an element a containing block for its
         position:fixed descendants — so this overlay was being sized to the
         header instead of the viewport. It also keeps the overlay clear of the
         mobile shell's overflow:hidden. This is now the only place the prompt
         is mounted, so it has to be right here. -->
    <Teleport to="body">
      <Transition name="prompt">
        <UsernamePrompt v-if="showUsernamePrompt" @done="showUsernamePrompt = false" />
      </Transition>
    </Teleport>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--rova-z-header);
  background: var(--rova-bg);
  border-bottom: 1px solid var(--rova-line);
  /* No env(safe-area-inset-*) padding here on purpose. It was tried and it
     made the header visibly too tall: the in-app browsers this runs in
     already inset their own chrome above the page, so safe-area-inset-top
     was double-counting the status bar. index.html therefore does not set
     viewport-fit=cover. */
}

/*
 * Content scrolling under the header blurs instead of being sliced off at an
 * opaque edge. Guarded rather than declared outright: without backdrop-filter
 * a translucent bar lets the page show through *behind the link text*, which
 * reads as a rendering fault rather than a design. An engine that can't blur
 * keeps the opaque cream above and is simply correct, not degraded.
 *
 * The tab bar is deliberately not treated this way — it is a solid base the
 * content scrolls to, not a window onto it.
 */
@supports (backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px)) {
  .app-header {
    background: var(--rova-bg-translucent);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
  }
}

/* Symmetric 1fr rails around an `auto` centre column. This is what actually
   centres the wordmark: with flex, a long link list on one side would push
   ROVA off-centre, which is the bug the reference layout avoids. */
.header-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1.5rem;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.85rem 1.25rem;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  justify-self: start;
  min-width: 0;
}

/* Both rails share one link treatment. This can no longer be scoped to
   .nav-left alone — Profile moved across to the right rail. */
.nav-left a,
.nav-right .nav-link {
  color: var(--rova-ink-muted);
  text-decoration: none;
  font-size: 0.92rem;
  /* Was 600. Space Grotesk has no 600, so it resolved *up* to 700 — the same
     weight as the wordmark and the buttons. Written truthfully at the ceiling
     rather than silently rounded to it. */
  font-weight: var(--rova-fw-bold);
  white-space: nowrap;
}

.nav-left a:hover,
.nav-left a.router-link-active,
.nav-right .nav-link:hover,
.nav-right .nav-link.router-link-active {
  color: var(--rova-navy-900);
}

.brand {
  justify-self: center;
  /* inline-flex so the mark and the wordmark sit on one baseline; the grid
     column above still centres the pair as a unit. */
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 1.3rem;
  font-weight: var(--rova-fw-bold);
  letter-spacing: -0.02em;
  color: var(--rova-navy-900);
  text-decoration: none;
}

/* Sized in rem against the 1.3rem wordmark rather than fixed px, so the two
   scale together if the wordmark ever changes. Slightly taller than the type
   because the rings read small at cap height. */
.brand-mark {
  height: 1.55rem;
  width: auto;
  display: block;
}

.nav-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.85rem;
  justify-self: end;
  min-width: 0;
}

.create-link {
  color: var(--rova-navy-700);
  text-decoration: none;
  font-weight: var(--rova-fw-bold);
  font-size: 0.9rem;
  white-space: nowrap;
}

.plus {
  font-size: 1rem;
  line-height: 1;
}

.connect-btn {
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  border: none;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  font-weight: var(--rova-fw-bold);
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.identity-wrap {
  position: relative;
}

/* One control in two states: the username normally, "Disconnect" while
   hovered. The colour transition keeps the swap from reading as a glitch. */
.identity {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 999px;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  font-weight: var(--rova-fw-bold);
  font-size: 0.85rem;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--rova-dur-fast) var(--rova-ease-out),
    color var(--rova-dur-fast) var(--rova-ease-out);
}

.identity.danger {
  background: var(--rova-red-500);
  color: var(--rova-on-red);
}

.disconnect {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  padding: 0.5rem 1rem;
  border: 1px solid var(--rova-line);
  border-radius: 999px;
  background: var(--rova-surface);
  color: var(--rova-red-600);
  font-weight: var(--rova-fw-bold);
  font-size: 0.8rem;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: var(--rova-shadow-overlay);
}

.status-text {
  font-size: 0.85rem;
  color: var(--rova-ink-muted);
  white-space: nowrap;
}

.status-text.warning {
  color: var(--rova-warning-text);
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

/*
 * The username prompt appears unprompted, immediately after a successful
 * wallet connect. A hard cut reads as something having gone wrong; fading in
 * reads as the app asking. Only the overlay fades — the card inside it is
 * UsernamePrompt's own element and is targeted through :deep() to scale up
 * into place, which is what gives the entrance a direction.
 */
.prompt-enter-active,
.prompt-leave-active {
  transition: opacity var(--rova-dur-base) var(--rova-ease-out);
}

.prompt-enter-active :deep(.prompt-card) {
  transition: transform var(--rova-dur-slow) var(--rova-ease-spring);
}

.prompt-enter-from,
.prompt-leave-to {
  opacity: 0;
}

.prompt-enter-from :deep(.prompt-card) {
  transform: scale(0.94);
}

/* Mobile is deliberately minimal: wordmark left, wallet control right. Links
   and "+ Create" are dropped — the fixed bottom tab bar carries both, and
   duplicating them in the header would just be two navs for one screen. */
@media (max-width: 767px) {
  .header-inner {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .nav-left,
  .create-link,
  .nav-link,
  .wallet-mode {
    display: none;
  }

  /* margin-right:auto pins the wordmark left and pushes the actions to the
     far right; the grid's justify-self doesn't apply once this is flex. */
  .brand {
    margin-right: auto;
  }
}
</style>
