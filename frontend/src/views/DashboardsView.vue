<script setup lang="ts">
import { Plus, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFavorites } from '../composables/useFavorites'
import DashboardList from '../components/DashboardList.vue'

const router = useRouter()
const { favorites } = useFavorites()

const searchQuery = ref('')

const dashboardCountLabel = computed(() => {
  const count = favorites.value.length
  if (count === 0) return 'Explore your dashboards'
  return `${count} pinned dashboard${count === 1 ? '' : 's'}`
})
</script>

<template>
  <div class="px-6 py-8 max-w-[1600px] mx-auto">
    <!-- Page header -->
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1
          class="font-display text-2xl font-semibold"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Dashboards
        </h1>
        <p
          class="mt-1 text-sm"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          {{ dashboardCountLabel }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Search input -->
        <div
          class="flex items-center gap-2 rounded-lg px-3 py-2"
          :style="{
            backgroundColor: 'var(--color-surface-container-low)',
            border: 'none',
          }"
        >
          <Search :size="16" :style="{ color: 'var(--color-outline)' }" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search dashboards..."
            data-testid="dashboard-search"
            class="w-48 border-none bg-transparent text-sm focus:outline-none"
            :style="{
              color: 'var(--color-on-surface)',
            }"
          />
        </div>
        <!-- New Dashboard button -->
        <button
          class="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
          :style="{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
          }"
          data-testid="new-dashboard-btn"
          @click="router.push('/app/dashboards/new/ai')"
        >
          <Plus :size="16" />
          New Dashboard
        </button>
      </div>
    </header>

    <!-- Dashboard list -->
    <DashboardList :search-query="searchQuery" />
  </div>
</template>
