<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '../composables/useSession'

const emit = defineEmits<{ done: [] }>()

const { setUsername } = useSession()

const value = ref('')
const submitting = ref(false)
const localError = ref<string | null>(null)

async function submit() {
  submitting.value = true
  localError.value = null
  try {
    await setUsername(value.value.trim())
    emit('done')
  } catch (err: any) {
    localError.value = err?.message ?? 'Failed to set username'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="prompt-overlay">
    <div class="prompt-card">
      <h2>Choose a username</h2>
      <p class="hint">3-20 characters, letters/digits/underscore, starting with a letter.</p>
      <form @submit.prevent="submit">
        <input v-model="value" type="text" placeholder="username" autofocus />
        <button type="submit" :disabled="submitting || value.trim().length === 0">
          {{ submitting ? 'Saving…' : 'Save' }}
        </button>
      </form>
      <p v-if="localError" class="error-text">{{ localError }}</p>
    </div>
  </div>
</template>

<style scoped>
.prompt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 27, 51, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.prompt-card {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1.5rem;
  width: min(320px, 90vw);
  box-shadow: 0 8px 32px rgba(15, 27, 51, 0.18);
}

.prompt-card h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: var(--rova-navy-900);
}

.hint {
  margin: 0 0 1rem 0;
  font-size: 0.8rem;
  color: var(--rova-ink-muted);
}

form {
  display: flex;
  gap: 0.5rem;
}

input {
  flex: 1;
  padding: 0.5rem 0.7rem;
  border-radius: var(--rova-radius-sm);
  border: 1px solid var(--rova-line);
  background: var(--rova-surface-alt);
  color: var(--rova-ink);
}

button {
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  border: none;
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-text {
  margin: 0.75rem 0 0 0;
  color: var(--rova-red-600);
  font-size: 0.85rem;
}
</style>
