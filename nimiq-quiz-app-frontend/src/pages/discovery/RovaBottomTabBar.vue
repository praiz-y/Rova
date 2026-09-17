<script setup lang="ts">
/**
 * App-wide mobile navigation (hidden at >= 768px). It lives in App.vue, not
 * RovaLayout, so every page has the same navigation — it used to exist on only
 * the home and /contests pages.
 */
import RovaIcon from '../../components/RovaIcon.vue'
</script>

<template>
  <nav class="tab-bar">
    <router-link to="/" class="tab">
      <RovaIcon name="home" class="icon" />
      <span class="label">Home</span>
    </router-link>
    <!-- Was href="#live-now", an in-page anchor that only resolved on the home
         page — it did nothing anywhere else. As a global tab it has to be a
         real route. -->
    <router-link to="/contests" class="tab">
      <RovaIcon name="contests" class="icon" />
      <span class="label">Contests</span>
    </router-link>
    <router-link to="/contests/new" class="tab create">
      <span class="create-glyph" aria-hidden="true">+</span>
      <span class="label">Create</span>
    </router-link>
    <router-link to="/profile" class="tab">
      <RovaIcon name="profile" class="icon" />
      <span class="label">Profile</span>
    </router-link>
  </nav>
</template>

<style scoped>
/* Deliberately NOT position:fixed any more. On mobile this is the last item
   in the fixed-height shell's flex column (#app in src/style.css), so it sits
   at the bottom of the *visible* viewport by layout. A fixed bar resolves
   bottom:0 against the layout viewport, which inside an in-app browser sits
   behind that browser's own bottom toolbar — which is exactly why the bar was
   almost invisible until a scroll retracted the toolbar. */
.tab-bar {
  position: relative;
  z-index: var(--rova-z-tabbar);
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--rova-surface);
  border-top: 1px solid var(--rova-line);
  padding: 0.4rem 0.5rem;
  /* The shell's scroller absorbs all the shrinking; the bar must never be
     squashed below its natural height. */
  flex-shrink: 0;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  color: var(--rova-ink-muted);
  text-decoration: none;
  font-size: 0.62rem;
  font-weight: 700;
  min-width: 3.5rem;
}

/* Now that the bar is on every page, it should say which one you're on.
   vue-router matches records, so "/" is not active on "/profile". */
.tab.router-link-active {
  color: var(--rova-navy-900);
}

/* Sizing lives here, not in RovaIcon, so one component can serve both this
   small tab glyph and a much larger mark elsewhere. Specificity is deliberate:
   `.tab .icon[data-v-…]` outranks the icon's own default in RovaIcon. */
.tab .icon,
.create-glyph {
  width: 1.35rem;
  height: 1.35rem;
}

/* Was a 3rem red circle lifted 0.75rem out of the bar. On a phone that read
   as a floating action button that had drifted off the bar rather than as a
   tab: it overflowed the bar's top edge, and it was the only item in the row
   wearing a different colour. A tab bar is a row of peers, so Create is one
   of them now — same glyph footprint, same colour, same label rhythm.
   No colour is set here on purpose: it inherits .tab's, which is what makes
   the active state work like every other tab. */
.create-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  font-weight: var(--rova-fw-bold);
  line-height: 1;
}

@media (min-width: 768px) {
  .tab-bar {
    display: none;
  }
}
</style>
