<script setup lang="ts">
/**
 * Profile owns the username, and it is now the only way in to "My Contests" —
 * that link left the header, because a header slot for a list you own was
 * crowding out the two links that actually describe the product.
 *
 * The username editor is inline rather than the UsernamePrompt modal the
 * header uses after a first connect. Two reasons: the modal is a single-shot
 * "you have no name yet" interruption and has nowhere to put live feedback,
 * and this page needs to support *editing* an existing name, which the modal
 * was never built for. UsernamePrompt is still the post-connect flow; this
 * page no longer uses it.
 *
 * Session is restored globally in App.vue (D030), no need to refresh here too.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useSession } from '../composables/useSession'

const { user, setUsername, checkUsernameAvailable } = useSession()

const editing = ref(false)
const draft = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)

/**
 * 'idle'      — nothing to say (unchanged name, or not editing)
 * 'checking'  — a debounced request is in flight
 * 'available' — server says free; Save is enabled
 * 'taken'     — server says someone has it
 * 'invalid'   — fails the pattern; never sent
 * 'unknown'   — the check itself failed; we must not guess
 */
type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'unknown'
const checkState = ref<CheckState>('idle')

/**
 * Mirrors USERNAME_PATTERN in the backend's src/users/routes.ts. Duplicated on
 * purpose: it gives per-keystroke feedback with no round-trip. The server
 * still validates, and a save that slips through surfaces the server's own
 * message, so drift degrades to a slower error rather than a wrong success.
 */
const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/

const DEBOUNCE_MS = 350

let debounceTimer: ReturnType<typeof setTimeout> | null = null
/** Guards against an older request resolving after a newer one. */
let checkSeq = 0

function startEdit() {
  draft.value = user.value?.username ?? ''
  saveError.value = null
  checkState.value = 'idle'
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  saveError.value = null
  checkState.value = 'idle'
}

watch(draft, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  saveError.value = null

  const candidate = value.trim()

  // Unchanged from what is already saved — nothing to check, and it must not
  // read as "taken" just because the row exists.
  if (candidate === (user.value?.username ?? '')) {
    checkSeq++
    checkState.value = 'idle'
    return
  }

  if (!USERNAME_PATTERN.test(candidate)) {
    checkSeq++
    checkState.value = 'invalid'
    return
  }

  checkState.value = 'checking'
  const seq = ++checkSeq

  // Debounced so a normal typing cadence costs one request at the end of a
  // word instead of one per keystroke.
  debounceTimer = setTimeout(async () => {
    try {
      const available = await checkUsernameAvailable(candidate)
      // A newer keystroke superseded this check; its result is the live one.
      if (seq !== checkSeq) return
      checkState.value = available ? 'available' : 'taken'
    } catch {
      if (seq !== checkSeq) return
      // Never claim a name is free because the check failed. 'unknown' shows a
      // neutral message and leaves Save disabled.
      checkState.value = 'unknown'
    }
  }, DEBOUNCE_MS)
})

const canSave = computed(() => checkState.value === 'available' && !saving.value)

const checkMessage = computed(() => {
  switch (checkState.value) {
    case 'checking':
      return 'Checking…'
    case 'available':
      return 'Available'
    case 'taken':
      return 'That username is already taken'
    case 'invalid':
      return '3–20 characters, start with a letter; letters, digits or underscore only'
    case 'unknown':
      return "Couldn't check availability — try again"
    default:
      return ''
  }
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null
  try {
    await setUsername(draft.value.trim())
    editing.value = false
    checkState.value = 'idle'
  } catch (err: any) {
    // The check is advisory and the POST is the authority: a 409 here means
    // someone claimed the name in the gap.
    saveError.value = err?.message ?? 'Failed to save username'
    checkState.value = 'unknown'
  } finally {
    saving.value = false
  }
}

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <main class="page">
    <h1 class="rova-page-title">Profile</h1>

    <div v-if="user" class="profile-card">
      <div class="row">
        <span class="row-label">Username</span>
        <!-- The current name stays on screen while editing, so the form below
             reads as "change this" rather than replacing it. -->
        <span class="row-value">{{ user.username ?? '(not set)' }}</span>
        <button v-if="!editing" class="ghost-btn" @click="startEdit">
          {{ user.username ? 'Edit' : 'Set username' }}
        </button>
      </div>

      <form v-if="editing" class="editor" @submit.prevent="save">
        <label class="row-label" for="username-input">New username</label>
        <input
          id="username-input"
          v-model="draft"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          :aria-invalid="checkState === 'taken' || checkState === 'invalid'"
          aria-describedby="username-check"
        />
        <!-- role="status" so the verdict is announced as it changes, rather
             than only being visible. -->
        <p
          id="username-check"
          class="check"
          :class="`check--${checkState}`"
          role="status"
        >
          {{ checkMessage }}
        </p>
        <p v-if="saveError" class="save-error">{{ saveError }}</p>
        <div class="editor-actions">
          <button type="submit" class="primary-btn" :disabled="!canSave">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="ghost-btn" @click="cancelEdit">Cancel</button>
        </div>
      </form>

      <div class="row">
        <span class="row-label">Address</span>
        <code class="row-value">{{ user.address }}</code>
      </div>
    </div>

    <p v-else class="placeholder">Connect your wallet to see your profile.</p>

    <router-link v-if="user" to="/contests/mine" class="nav-card">
      <span class="nav-card-title">My Contests</span>
      <span class="nav-card-hint">
        Contests you've created — drafts, live, and finished
      </span>
    </router-link>
  </main>
</template>

<style scoped>
.page {
  padding: 2rem 1rem;
  max-width: 480px;
  margin: 0 auto;
}

h1 {
  margin: 0 0 1rem 0;
}

.profile-card {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1rem;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin: 0 0 0.75rem;
}

.row:last-child {
  margin-bottom: 0;
}

.row-label {
  font-size: var(--rova-fs-xs);
  font-weight: var(--rova-fw-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--rova-ink-muted);
}

.row-value {
  flex: 1;
  min-width: 0;
  color: var(--rova-ink);
}

.profile-card code.row-value {
  font-size: 0.8rem;
  word-break: break-all;
}

.editor {
  margin: 0.25rem 0 0.85rem;
}

.editor input {
  display: block;
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  background: var(--rova-bg);
  color: var(--rova-ink);
  font-size: var(--rova-fs-base);
}

/* Colour only — the message text itself already says which state this is, so
   there is nothing here that a colourblind reader would miss.
   The line is always rendered, message or not: it is a role="status" live
   region, so it has to exist before its text changes for screen readers to
   announce it. Reserving the height also stops the buttons below from jumping
   as the verdict cycles through Checking…/Available. */
.check {
  margin: 0.35rem 0 0;
  min-height: 1.3em;
  font-size: var(--rova-fs-sm);
  color: var(--rova-ink-muted);
}

.check--available {
  color: var(--rova-navy-700);
}

.check--taken,
.check--invalid,
.check--unknown {
  color: var(--rova-red-600);
}

.save-error {
  margin: 0.35rem 0 0;
  font-size: var(--rova-fs-sm);
  color: var(--rova-red-600);
}

.editor-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.primary-btn,
.ghost-btn {
  border-radius: 999px;
  font-weight: var(--rova-fw-bold);
  font-size: var(--rova-fs-sm);
  cursor: pointer;
  white-space: nowrap;
}

.primary-btn {
  padding: 0.45rem 1.1rem;
  border: none;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ghost-btn {
  padding: 0.4rem 0.9rem;
  border: 1.5px solid var(--rova-navy-900);
  background: transparent;
  color: var(--rova-navy-900);
}

/* The row's Edit button sits at the end of a baseline-aligned flex line. */
.row .ghost-btn {
  margin-left: auto;
}

.nav-card {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  text-decoration: none;
  transition: border-color var(--rova-dur-fast) var(--rova-ease-out);
}

.nav-card:hover {
  border-color: var(--rova-navy-600);
}

.nav-card-title {
  font-weight: var(--rova-fw-bold);
  color: var(--rova-navy-900);
}

.nav-card-hint {
  font-size: var(--rova-fs-sm);
  color: var(--rova-ink-muted);
}

.placeholder {
  color: var(--rova-ink-muted);
}
</style>
