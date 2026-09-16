<script setup lang="ts">
import { onMounted } from 'vue'
import RovaLayout from './discovery/RovaLayout.vue'
import { useDiscoveryData } from './discovery/useDiscoveryData'
import { useContestStats } from './discovery/useContestStats'
import RovaHero from './discovery/RovaHero.vue'
import RovaContestSection from './discovery/RovaContestSection.vue'
import RovaHowItWorks from './discovery/RovaHowItWorks.vue'
import RovaSponsorCta from './discovery/RovaSponsorCta.vue'
import RovaFaq from './discovery/RovaFaq.vue'

const { ongoing, upcoming, ongoingLoading, upcomingLoading, ongoingError, upcomingError, load, loadOngoing, loadUpcoming } =
  useDiscoveryData()
const { stats, loading: statsLoading, load: loadStats } = useContestStats()

onMounted(() => {
  load()
  loadStats()
})
</script>

<template>
  <RovaLayout>
    <RovaHero :stats="stats" :stats-loading="statsLoading" />

    <RovaContestSection
      id="live-now"
      eyebrow="LIVE NOW"
      live
      title="Live Now"
      subtext="Competitions happening right now."
      :contests="ongoing"
      :loading="ongoingLoading"
      :error="ongoingError"
      empty-title="No contests are live right now."
      empty-body="Check Upcoming below, or check back soon."
      view-all-to="/contests?status=live"
      card-variant="live"
      @retry="loadOngoing"
    />

    <RovaContestSection
      id="upcoming"
      eyebrow="UPCOMING"
      title="Upcoming"
      subtext="Get ready for what's coming next."
      :contests="upcoming"
      :loading="upcomingLoading"
      :error="upcomingError"
      empty-title="No contests are open for registration yet."
      empty-body="Be the first to create one."
      empty-cta-to="/contests/new"
      empty-cta-label="Create a Contest"
      view-all-to="/contests?status=upcoming"
      card-variant="upcoming"
      @retry="loadUpcoming"
    />

    <RovaHowItWorks />
    <RovaSponsorCta />
    <RovaFaq />
  </RovaLayout>
</template>
