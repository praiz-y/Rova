<script setup lang="ts">
/**
 * Shared shell for every ROVA-styled route (home, /contests, ...): the token
 * stylesheet and the footer, so a new ROVA page never has to re-import or
 * re-wire them. See CONTESTS_PAGE_PLAN.md Phase A.
 *
 * The header and the bottom tab bar deliberately do NOT live here — they are
 * app-wide now (see App.vue). When they were route-scoped, navigation changed
 * shape depending on where you were, and the tab bar existed on only two pages.
 */
import './rova-tokens.css'
import RovaFooter from './RovaFooter.vue'
</script>

<template>
  <div class="rova-page">
    <main>
      <slot />
    </main>
    <RovaFooter />
  </div>
</template>

<style scoped>
/* No min-height here: App.vue gives this element flex:1 inside the #app
   column, so it already fills the viewport below the header. A 100vh
   min-height would add the header's height on top and leave every ROVA page
   with a strip of dead scroll. The bottom clearance for the fixed tab bar is
   also applied there, so it can't be forgotten on a non-ROVA page. */
.rova-page {
  display: flex;
  flex-direction: column;
}

.rova-page main {
  flex: 1;
}
</style>
