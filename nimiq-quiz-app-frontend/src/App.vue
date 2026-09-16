<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import { useSession } from './composables/useSession'

// D030: reconnecting/reloading must not reset identity — restore the
// session from the existing cookie (if any) before anything else renders.
const { refresh } = useSession()
onMounted(() => {
  refresh()
})

// ROVA-styled routes (home, /contests, ...) provide their own header via
// RovaLayout.vue — skip the global one there so they never double up.
// Every other route is untouched. See router/index.ts's rovaLayout meta.
const route = useRoute()
</script>

<template>
  <AppHeader v-if="!route.meta.rovaLayout" />
  <router-view />
</template>
