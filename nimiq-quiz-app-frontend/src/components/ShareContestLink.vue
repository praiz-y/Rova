<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

const props = defineProps<{ contestId: string; title: string }>()

/**
 * Derived from the current origin rather than a configured domain, so one build
 * produces the right link on localhost, on a Vercel preview, and in production.
 */
const url = computed(() => new URL(`/contests/${props.contestId}`, window.location.origin).href)

const state = ref<'idle' | 'copied' | 'manual'>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  // clipboard is absent entirely on an insecure origin, and writeText can still
  // be refused by the embedder on a secure one — which is the norm inside an
  // in-app browser, not the exception. Either way the answer is the same: show
  // the link in something the user can select by hand.
  if (!navigator.clipboard) {
    state.value = 'manual'
    return
  }
  try {
    await navigator.clipboard.writeText(url.value)
    state.value = 'copied'
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      state.value = 'idle'
    }, 2000)
  } catch {
    state.value = 'manual'
  }
}

/* The field is readonly, so focusing it and selecting the whole link is the
   most useful thing focus can do. */
function selectAll(event: FocusEvent) {
  const input = event.target as HTMLInputElement
  input.select()
}

onUnmounted(() => {
  if (resetTimer) clearTimeout(resetTimer)
})

const message = computed(() => {
  if (state.value === 'copied') return 'Link copied.'
  if (state.value === 'manual') return 'Copying is blocked here — select the link and copy it manually.'
  return ''
})
</script>

<template>
  <div class="share">
    <!-- The visible text is kept inside the accessible name: several of these
         can be on one page (one per contest card), so "Copy link" alone would
         be ambiguous out of context. -->
    <button type="button" class="share-btn" :aria-label="`Copy link to ${title}`" @click="copy">
      Copy link
    </button>
    <!-- Always rendered, so the live region is in the DOM before its text
         changes. The button is first and left-aligned, so the message arriving
         beside it moves nothing. -->
    <span class="share-status" role="status">{{ message }}</span>
    <input
      v-if="state === 'manual'"
      class="share-input"
      type="text"
      readonly
      :value="url"
      :aria-label="`Link to ${title}`"
      @focus="selectAll"
    />
  </div>
</template>

<style scoped>
.share {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* Same outline pill as .ghost-btn in MyContestsPage: sharing is an ordinary
   action, not the primary one on any page it appears on. */
.share-btn {
  padding: 0.35rem 0.85rem;
  border: 1.5px solid var(--rova-navy-900);
  border-radius: 999px;
  background: transparent;
  color: var(--rova-navy-900);
  font-size: var(--rova-fs-sm);
  font-weight: var(--rova-fw-bold);
  cursor: pointer;
  white-space: nowrap;
}

.share-btn:hover {
  background: var(--rova-surface-alt);
}

.share-status {
  font-size: var(--rova-fs-xs);
  color: var(--rova-ink-muted);
}

.share-input {
  /* Takes the whole row rather than competing with the button for space. */
  flex-basis: 100%;
  min-width: 0;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  background: var(--rova-surface-alt);
  color: var(--rova-ink);
  font-family: inherit;
  font-size: var(--rova-fs-xs);
}
</style>
