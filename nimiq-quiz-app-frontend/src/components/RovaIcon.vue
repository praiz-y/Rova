<script setup lang="ts">
/**
 * RovaIcon — inline SVG for app chrome.
 *
 * Replaces the Unicode glyphs the tab bar rendered (⌂ ▤ ◍). Those are not
 * icons in any real sense: they resolve through whatever symbol font the OS
 * falls back to, so the shape, weight and optical size differed on every
 * platform, and none of them matched the 1.75px stroke the UI is drawn at.
 *
 * `stroke="currentColor"` so an icon inherits the colour of whatever contains
 * it — that's what lets one component serve both the active (navy) and
 * inactive (muted) tab states with no extra prop.
 *
 * Sizing is intentionally left to the consumer (see .rova-icon's default
 * below) rather than fixed here, so the same icon can be a tab glyph or a
 * 3rem empty-state mark without a size prop.
 *
 * Inlined rather than added to public/icons.svg: at three icons, a sprite
 * would cost a network request and a lookup indirection to save nothing.
 * public/icons.svg is unrelated Vite scaffold — bluesky/discord/github/x
 * symbols in the old Vite purple, referenced by nothing. It still ships in
 * dist/ because everything in public/ is copied verbatim; it is safe to
 * delete.
 */
type IconName = 'home' | 'contests' | 'profile'

defineProps<{ name: IconName }>()
</script>

<template>
  <svg
    class="rova-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <!-- <g> rather than <template>: a real SVG element, so there is no
         namespace ambiguity for the template compiler to resolve. -->
    <g v-if="name === 'home'">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </g>
    <g v-else-if="name === 'contests'">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 13.5h4" />
    </g>
    <g v-else-if="name === 'profile'">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
    </g>
  </svg>
</template>

<style scoped>
.rova-icon {
  display: block;
  width: 1.25rem;
  height: 1.25rem;
}
</style>
