<script setup lang="ts">
import { onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import RovaBottomTabBar from './pages/discovery/RovaBottomTabBar.vue'
import { useSession } from './composables/useSession'

// D030: reconnecting/reloading must not reset identity — restore the
// session from the existing cookie (if any) before anything else renders.
const { refresh } = useSession()
onMounted(() => {
  refresh()
})

// One header and one tab bar for every route. Both used to vary by route
// (ROVA-layout pages rendered their own RovaNav, and the tab bar lived inside
// RovaLayout), which meant the navigation changed shape as you moved around
// the app. They now live here and are identical everywhere.
</script>

<template>
  <AppHeader />
  <router-view v-slot="{ Component }">
    <Transition name="view" mode="out-in">
      <component :is="Component" class="app-view" />
    </Transition>
  </router-view>
  <RovaBottomTabBar />
</template>

<style scoped>
/* #app is already a flex column (see src/style.css), so growing the view
   fills the viewport below the header. This is what lets ROVA pages drop
   their old `min-height: 100vh`, which double-counted the header and left
   every ROVA page scrollable by ~50px of empty space. */
.app-view {
  flex: 1;
}

/*
 * A short cross-fade between routes.
 *
 * `mode="out-in"` is not cosmetic: these pages are in normal flow, so with the
 * default simultaneous mode both would be in the document at once and the page
 * would be briefly twice as tall, jumping the scrollbar. Out-in removes the
 * outgoing page before mounting the incoming one.
 *
 * Scrolling: on desktop the window scrolls and scrollBehavior in
 * src/router/index.ts handles it. On mobile the scroller is .app-view (see
 * #app in src/style.css), which the window cannot reach — but a route change
 * there still starts at the top for free, because <component :is> mounts a
 * brand new element at scrollTop 0. The one thing that does NOT survive is
 * savedPosition on back/forward, which is documented at the router.
 */
.view-enter-active,
.view-leave-active {
  transition: opacity var(--rova-dur-fast) var(--rova-ease-out);
}

.view-enter-from,
.view-leave-to {
  opacity: 0;
}

/* Mobile only: this element is the scroll container inside the fixed-height
   shell (see #app in src/style.css). The tab bar is a flow item after it, so
   a page's last row now sits above the bar instead of underneath it — the old
   4.5rem clearance padding is no longer needed. */
@media (max-width: 767px) {
  .app-view {
    /* Load-bearing. A flex item defaults to min-height:auto, which would let
       this grow to its content height rather than scroll inside the shell.
       The page would then overflow #app and, because that is overflow:hidden,
       the bottom of the content would be unreachable. */
    min-height: 0;
    overflow-y: auto;
  }
}
</style>
