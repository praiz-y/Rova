// src/pages/NotFoundPage.vue
<template>
  <main class="not-found">
    <p class="code">404</p>
    <h1 class="rova-page-title">Page not found</h1>
    <p class="lead">
      There's nothing at <code>{{ path }}</code>. It may have been moved, or the
      link may be out of date.
    </p>
    <div class="actions">
      <router-link to="/" class="btn primary">Back to home</router-link>
      <router-link to="/contests" class="btn secondary">Browse contests</router-link>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
// Route params are not user-authored content, but they are echoed into the DOM,
// so keep it to the path string and let Vue's text interpolation escape it.
const path = computed(() => route.fullPath);
</script>

<style scoped>
.not-found {
  max-width: 560px;
  margin: 0 auto;
  padding: 5rem 2rem;
  text-align: center;
}
.code {
  font-size: 0.85rem;
  font-weight: var(--rova-fw-bold);
  letter-spacing: 0.12em;
  color: var(--rova-red-500);
  margin: 0 0 0.5rem;
}
.not-found h1 {
  margin: 0 0 0.75rem;
}
.lead {
  color: var(--rova-ink-muted);
  margin: 0 0 2rem;
}
.lead code {
  background: var(--rova-surface-alt);
  border: 1px solid var(--rova-line);
  border-radius: var(--rova-radius-sm);
  padding: 0.1rem 0.4rem;
  font-size: 0.9em;
  word-break: break-all;
}
.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}
.btn {
  padding: 0.6rem 1.3rem;
  border-radius: 999px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
}
.btn.primary { background: var(--rova-navy-900); color: var(--rova-on-navy); }
.btn.secondary {
  background: var(--rova-surface);
  color: var(--rova-navy-900);
  border-color: var(--rova-line);
}
</style>
