<script setup lang="ts">
const steps = ['Create', 'Rules', 'Fund Prize', 'Publish', 'Compete']
</script>

<template>
  <section class="sponsor-cta">
    <div class="inner">
      <p class="eyebrow">FOR COMMUNITIES &amp; SPONSORS</p>
      <h2>Have a community? Give them something to compete for.</h2>
      <p class="body">
        Create a contest around your community, product, or event. Set the rules, fund the prize pool, and give
        your audience something worth competing for.
      </p>
      <ol class="breadcrumb">
        <li v-for="step in steps" :key="step">{{ step }}</li>
      </ol>
      <router-link to="/contests/new" class="cta">Launch Community Contest</router-link>
    </div>
  </section>
</template>

<style scoped>
.sponsor-cta {
  background: var(--rova-navy-900);
  color: var(--rova-on-navy);
  border-radius: var(--rova-radius);
  max-width: 1280px;
  margin: 1rem 1.25rem 2.5rem;
  padding: 2.25rem 1.5rem;
}

.inner {
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}

.eyebrow {
  margin: 0 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--rova-red-500);
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.4rem;
}

.body {
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  color: rgba(245, 241, 230, 0.75);
  line-height: 1.55;
}

.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  list-style: none;
  margin: 0 0 1.5rem;
  padding: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(245, 241, 230, 0.65);
}

.breadcrumb li:not(:last-child)::after {
  content: '→';
  margin-left: 0.4rem;
  color: rgba(245, 241, 230, 0.4);
}

.cta {
  display: inline-flex;
  border-radius: 999px;
  padding: 0.75rem 1.6rem;
  background: var(--rova-red-500);
  color: #fff;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.92rem;
}

@media (min-width: 1280px) {
  .sponsor-cta {
    margin-left: auto;
    margin-right: auto;
  }
}
</style>
