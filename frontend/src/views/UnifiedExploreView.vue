<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCommandContext } from '../composables/useCommandContext'
import LogsExploreTab from './LogsExploreTab.vue'
import MetricsExploreTab from './MetricsExploreTab.vue'
import TracesExploreTab from './TracesExploreTab.vue'

const route = useRoute()
const router = useRouter()
const { registerContext, deregisterContext } = useCommandContext()

type ExploreType = 'metrics' | 'logs' | 'traces'

const tabs: { key: ExploreType; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'logs', label: 'Logs' },
  { key: 'traces', label: 'Traces' },
]

const activeType = computed<ExploreType>(() => {
  const type = route.params.type as string
  if (type === 'logs' || type === 'traces') return type
  return 'metrics'
})

const activeComponent = computed(() => {
  switch (activeType.value) {
    case 'logs':
      return LogsExploreTab
    case 'traces':
      return TracesExploreTab
    default:
      return MetricsExploreTab
  }
})

function navigateToTab(type: ExploreType) {
  if (type === activeType.value) return
  router.push(`/app/explore/${type}`)
}

function handleDatasourceChanged(payload: { id: string; name: string; type: string }) {
  registerContext({
    viewName: 'Explore',
    viewRoute: '/app/explore',
    description: 'Query and visualize metrics, logs, and traces from connected datasources',
    datasourceId: payload.id,
    datasourceName: payload.name,
    datasourceType: payload.type,
  })
}

onMounted(() => {
  registerContext({
    viewName: 'Explore',
    viewRoute: '/app/explore',
    description: 'Query and visualize metrics, logs, and traces from connected datasources',
  })
})

onUnmounted(() => {
  deregisterContext()
})
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 px-8 py-6">
    <!-- Page header -->
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center flex-wrap gap-3">
        <h1
          class="text-2xl font-bold font-display m-0"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Explore
        </h1>
      </div>
    </header>

    <!-- Underline tab sub-nav -->
    <nav
      class="flex gap-1 mb-6"
      :style="{ borderBottom: '1px solid var(--color-outline-variant)' }"
      data-testid="explore-tab-nav"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="px-4 py-2.5 text-sm font-medium transition cursor-pointer bg-transparent"
        :style="{
          color: activeType === tab.key ? 'var(--color-primary)' : 'var(--color-outline)',
          borderBottom: activeType === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
        }"
        :data-testid="`explore-tab-${tab.key}`"
        @click="navigateToTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- Tab content -->
    <component :is="activeComponent" :key="activeType" @datasource-changed="handleDatasourceChanged" />
  </div>
</template>
