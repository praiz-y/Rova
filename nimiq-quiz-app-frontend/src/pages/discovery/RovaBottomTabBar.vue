<script setup lang="ts"></script>

<template>
  <nav class="tab-bar">
    <router-link to="/" class="tab">
      <span class="icon">⌂</span>
      <span class="label">Home</span>
    </router-link>
    <a href="#live-now" class="tab">
      <span class="icon">▤</span>
      <span class="label">Contests</span>
    </a>
    <router-link to="/contests/new" class="tab create">
      <span class="create-circle">+</span>
    </router-link>
    <router-link to="/profile" class="tab">
      <span class="icon">◍</span>
      <span class="label">Profile</span>
    </router-link>
  </nav>
</template>

<style scoped>
.tab-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--rova-surface);
  border-top: 1px solid var(--rova-line);
  padding: 0.4rem 0.5rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
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

.icon {
  font-size: 1.1rem;
  line-height: 1;
}

.tab.create {
  position: relative;
  top: -0.75rem;
}

.create-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  background: var(--rova-red-500);
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
  box-shadow: 0 4px 10px rgba(233, 72, 58, 0.35);
}

@media (min-width: 768px) {
  .tab-bar {
    display: none;
  }
}
</style>
