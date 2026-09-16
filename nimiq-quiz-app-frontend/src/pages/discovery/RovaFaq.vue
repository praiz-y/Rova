<script setup lang="ts">
import { ref } from 'vue'

const items = [
  {
    q: 'What is ROVA?',
    a: 'ROVA is a quiz-contest platform for the Nimiq ecosystem. Anyone can create a contest, fund a real NIM prize pool, and open it for participants to compete in for a chance to win.',
  },
  {
    q: 'How do I join a contest?',
    a: 'Connect your Nimiq wallet, open a contest during its registration window, complete any entry requirements the creator has set, and register. When the quiz starts, you can play from the contest page.',
  },
  {
    q: 'Do I need a wallet to participate?',
    a: 'Yes. Your Nimiq wallet is your identity on ROVA — there are no accounts, emails, or passwords. You need it to register for a contest and to receive any prize you win.',
  },
  {
    q: 'How are winners determined?',
    a: 'When a quiz closes, results are ranked by score, then by completion time, then by submission time — calculated automatically from each participant’s real, recorded quiz attempt.',
  },
  {
    q: 'How are prizes distributed?',
    a: 'Sponsors fund a contest’s prize pool in NIM before it opens. Once results are finalized, ROVA signs and broadcasts payout transactions directly to winners’ wallets — no manual claim step.',
  },
  {
    q: 'Can anyone create a contest?',
    a: 'Yes. Any wallet holder can create a contest — set the questions, schedule, entry requirements, and prize distribution, then fund the prize pool to publish it.',
  },
  {
    q: 'What happens if a contest is canceled?',
    a: 'If a sponsor cancels a contest before it completes, any confirmed prize-pool funding is calculated as a refund owed back to the sponsor’s wallet.',
  },
]

const openIndex = ref<number | null>(null)

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i
}
</script>

<template>
  <section class="faq">
    <p class="eyebrow">GOT QUESTIONS?</p>
    <h2>Frequently Asked Questions</h2>

    <div class="list">
      <div v-for="(item, i) in items" :key="item.q" class="item">
        <button type="button" class="question" :aria-expanded="openIndex === i" @click="toggle(i)">
          {{ item.q }}
          <span class="chevron" :class="{ open: openIndex === i }">⌄</span>
        </button>
        <p v-if="openIndex === i" class="answer">{{ item.a }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.faq {
  max-width: 760px;
  margin: 0 auto;
  padding: 2.5rem 1.25rem;
  text-align: center;
}

.eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--rova-red-600);
}

h2 {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  color: var(--rova-navy-900);
}

.list {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.item {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  overflow: hidden;
}

.question {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: none;
  border: none;
  text-align: left;
  padding: 0.9rem 1.1rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--rova-navy-900);
  cursor: pointer;
}

.chevron {
  transition: transform 0.15s ease;
  color: var(--rova-ink-muted);
}

.chevron.open {
  transform: rotate(180deg);
}

.answer {
  margin: 0;
  padding: 0 1.1rem 1rem;
  color: var(--rova-ink-muted);
  font-size: 0.85rem;
  line-height: 1.55;
}
</style>
