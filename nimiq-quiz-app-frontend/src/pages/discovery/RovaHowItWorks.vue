<script setup lang="ts">
const steps = [
  {
    number: '01',
    title: 'Create',
    tag: 'Fully Configurable',
    body: 'Anyone can create a contest, define the questions and rules, choose the schedule, select the number of winners, and set the prize distribution.',
  },
  {
    number: '02',
    title: 'Compete',
    tag: 'Real-time Verification',
    body: 'Connect your wallet, register before the deadline, and take part when the contest begins. Your score and completion time determine your position on the leaderboard.',
  },
  {
    number: '03',
    title: 'Win',
    tag: 'Verified On-Chain Finality',
    body: "Participants who finish at the top win according to the contest's published prize distribution. Once results are finalized, winners receive their rewards directly.",
  },
]
</script>

<template>
  <section id="how-it-works" class="how">
    <p class="eyebrow">SIMPLE &amp; TRUSTWORTHY</p>
    <h2>How ROVA Works</h2>

    <div class="steps">
      <div v-for="step in steps" :key="step.number" class="step">
        <span class="number">{{ step.number }}</span>
        <h3>{{ step.title }}</h3>
        <p class="body">{{ step.body }}</p>
        <span class="tag">{{ step.tag }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.how {
  max-width: 1280px;
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
  margin: 0 0 1.75rem;
  font-size: 1.6rem;
  color: var(--rova-navy-900);
}

.steps {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  text-align: left;
}

.step {
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius);
  padding: 1.5rem;
}

.number {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--rova-red-600);
}

h3 {
  margin: 0.4rem 0 0.5rem;
  font-size: 1.1rem;
  color: var(--rova-navy-900);
}

.body {
  margin: 0 0 0.9rem;
  font-size: 0.85rem;
  color: var(--rova-ink-muted);
  line-height: 1.5;
}

.tag {
  display: inline-block;
  background: var(--rova-surface-alt);
  color: var(--rova-navy-700);
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 700;
}

@media (min-width: 1120px) {
  .steps {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
