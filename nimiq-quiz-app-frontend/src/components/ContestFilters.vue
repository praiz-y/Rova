// src/components/ContestFilters.vue
<template>
  <div class="filters">
    <div class="filter-row">
      <label>Status:</label>
      <select v-model="filters.status">
        <option value="">Any</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="registration_open">Reg Open</option>
        <option value="registration_closed">Reg Closed</option>
        <option value="quiz_started">Quiz Started</option>
        <option value="quiz_closed">Quiz Closed</option>
        <option value="payouts">Payouts</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <div class="filter-row">
      <label>Title:</label>
      <input type="text" v-model="filters.title" placeholder="Contains…" />
    </div>
    <div class="filter-row">
      <label>Sponsor:</label>
      <input type="text" v-model="filters.sponsor" placeholder="Sponsor username" />
    </div>
    <div class="filter-row">
      <label>Date From:</label>
      <input type="date" v-model="filters.dateFrom" />
    </div>
    <div class="filter-row">
      <label>Date To:</label>
      <input type="date" v-model="filters.dateTo" />
    </div>
    <button @click="apply" class="apply-btn">Apply Filters</button>
    <button @click="reset" class="reset-btn">Reset</button>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

const emit = defineEmits(['filter-changed']);

const filters = reactive({
  status: '' as string,
  title: '' as string,
  sponsor: '' as string,
  dateFrom: '' as string,
  dateTo: '' as string,
});

function apply() {
  emit('filter-changed', { ...filters });
}

function reset() {
  filters.status = '';
  filters.title = '';
  filters.sponsor = '';
  filters.dateFrom = '';
  filters.dateTo = '';
  apply();
}
</script>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
  background: var(--rova-surface);
  border: 1px solid var(--rova-line);
  padding: 1rem;
  border-radius: var(--rova-radius);
}
.filter-row {
  display: flex;
  flex-direction: column;
  min-width: 120px;
}
.filter-row label {
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
  color: var(--rova-ink-muted);
}
.apply-btn,
.reset-btn {
  align-self: flex-end;
  margin-top: 1.5rem;
  padding: 0.4rem 0.9rem;
  border: none;
  border-radius: 999px;
  font-weight: 700;
  cursor: pointer;
}
.apply-btn { background: var(--rova-navy-900); color: var(--rova-on-navy); }
.reset-btn { background: var(--rova-surface-alt); color: var(--rova-navy-900); }
</style>
