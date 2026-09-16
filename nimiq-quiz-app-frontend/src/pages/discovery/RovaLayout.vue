<script setup lang="ts">
/**
 * Shared shell for every ROVA-styled route (home, /contests, ...): the
 * token stylesheet, nav, footer, and mobile tab bar in one place so a new
 * ROVA page never has to re-import/re-wire any of it. See
 * CONTESTS_PAGE_PLAN.md Phase A.
 */
import './rova-tokens.css'
import RovaNav from './RovaNav.vue'
import RovaFooter from './RovaFooter.vue'
import RovaBottomTabBar from './RovaBottomTabBar.vue'
</script>

<template>
  <div class="rova-page">
    <RovaNav />
    <main>
      <slot />
    </main>
    <RovaFooter />
    <RovaBottomTabBar />
  </div>
</template>

<style scoped>
.rova-page {
  min-height: 100vh;
  padding-bottom: 4.5rem;
}

@media (min-width: 768px) {
  .rova-page {
    padding-bottom: 0;
  }
}
</style>
