<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import EmptyState from '../components/EmptyState.vue'
import StatusDot from '../components/StatusDot.vue'
import AiInsightCard from '../components/AiInsightCard.vue'
import OnboardingBanner from '../components/OnboardingBanner.vue'
import { useCommandContext } from '../composables/useCommandContext'
import { useFavorites } from '../composables/useFavorites'

const { registerContext, deregisterContext } = useCommandContext()
const { favorites, recentDashboards } = useFavorites()

// Data source flag — in a real app this would come from an API/store.
// For now, check localStorage for a mock flag.
const hasDataSources = computed(() => {
  return localStorage.getItem('ace-has-datasources') !== 'false'
})

// Onboarding banner visibility — check if user dismissed it
const onboardingDismissed = computed(() => {
  return localStorage.getItem('ace-onboarding-dismissed') === 'true'
})

// Mock health data
const healthServices = [
  { name: 'API Gateway', status: 'healthy' as const, uptime: '99.98%', latency: '12ms' },
  { name: 'Auth Service', status: 'healthy' as const, uptime: '99.95%', latency: '8ms' },
  { name: 'Database Primary', status: 'warning' as const, uptime: '99.80%', latency: '45ms' },
  { name: 'Cache Layer', status: 'healthy' as const, uptime: '99.99%', latency: '2ms' },
  { name: 'Message Queue', status: 'healthy' as const, uptime: '99.97%', latency: '5ms' },
  { name: 'Search Engine', status: 'critical' as const, uptime: '98.50%', latency: '120ms' },
]

// Mock AI insights
const aiInsights = [
  {
    title: 'Anomaly Detected',
    description: 'CPU usage on API Gateway spiked 40% above baseline at 14:32 UTC.',
    timestamp: '2 minutes ago',
  },
  {
    title: 'Optimization Suggestion',
    description: 'Database query latency can be reduced by 30% with index on users.email.',
    timestamp: '15 minutes ago',
  },
  {
    title: 'Capacity Forecast',
    description: 'Message Queue will reach 80% capacity in approximately 3 days at current growth rate.',
    timestamp: '1 hour ago',
  },
]

onMounted(() => {
  registerContext({
    viewName: 'Home',
    viewRoute: '/app',
    description: 'Command center — overview of services, dashboards, and AI insights.',
  })
})

onUnmounted(() => {
  deregisterContext()
})
</script>

<template>
  <!-- Empty state when no data sources -->
  <div v-if="!hasDataSources" class="flex items-center justify-center min-h-[60vh]">
    <EmptyState
      :icon="Sparkles"
      title="Welcome to Ace"
      description="Connect your first data source to get started"
      action-label="Add Data Source"
      action-route="/app/settings/datasources"
    />
  </div>

  <!-- Normal state -->
  <div v-else class="px-6 py-8 max-w-[1600px] mx-auto space-y-8">
    <!-- 1. AI Command Input -->
    <div
      data-testid="ai-command-input"
      class="rounded-2xl p-8 text-center"
      :style="{
        backgroundColor: 'color-mix(in srgb, var(--color-surface-container-highest) 80%, transparent)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--color-outline-variant)',
      }"
    >
      <h1
        class="font-display text-2xl font-semibold mb-4"
        :style="{ color: 'var(--color-on-surface)' }"
      >
        Ask Ace anything
      </h1>
      <div
        class="mx-auto max-w-xl rounded-xl px-5 py-3 text-left text-sm cursor-pointer transition-colors"
        :style="{
          backgroundColor: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface-variant)',
          border: '1px solid var(--color-outline-variant)',
        }"
      >
        <span class="opacity-60">Search services, query data, generate dashboards...</span>
      </div>
    </div>

    <!-- 2. Onboarding Banner (conditional) -->
    <OnboardingBanner v-if="!onboardingDismissed" />

    <!-- 3. Pinned Dashboards -->
    <section v-if="favorites.length > 0" data-testid="pinned-dashboards">
      <h2
        class="font-display text-lg font-semibold mb-4"
        :style="{ color: 'var(--color-on-surface)' }"
      >
        Pinned Dashboards
      </h2>
      <div class="flex gap-3 overflow-x-auto pb-2">
        <router-link
          v-for="favId in favorites"
          :key="favId"
          :to="`/app/dashboards/${favId}`"
          class="shrink-0 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:opacity-90 no-underline"
          :style="{
            backgroundColor: 'var(--color-surface-container)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
            minWidth: '160px',
          }"
        >
          {{ favId }}
        </router-link>
      </div>
    </section>

    <!-- 4. Recently Viewed -->
    <section v-if="recentDashboards.length > 0" data-testid="recently-viewed">
      <h2
        class="font-display text-lg font-semibold mb-4"
        :style="{ color: 'var(--color-on-surface)' }"
      >
        Recently Viewed
      </h2>
      <div class="flex gap-3 overflow-x-auto pb-2">
        <router-link
          v-for="dashboard in recentDashboards"
          :key="dashboard.id"
          :to="`/app/dashboards/${dashboard.id}`"
          class="shrink-0 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:opacity-90 no-underline"
          :style="{
            backgroundColor: 'var(--color-surface-container)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
            minWidth: '160px',
          }"
        >
          {{ dashboard.title }}
        </router-link>
      </div>
    </section>

    <!-- 5. System Health Grid -->
    <section data-testid="system-health-grid">
      <h2
        class="font-display text-lg font-semibold mb-4"
        :style="{ color: 'var(--color-on-surface)' }"
      >
        System Health
      </h2>
      <div class="grid grid-cols-2 2xl:grid-cols-3 gap-4">
        <div
          v-for="service in healthServices"
          :key="service.name"
          data-testid="health-card"
          class="rounded-lg p-4"
          :style="{
            backgroundColor: 'var(--color-surface-container-low)',
            border: '1px solid var(--color-outline-variant)',
          }"
        >
          <div class="flex items-center gap-2 mb-2">
            <StatusDot :status="service.status" :size="8" />
            <span
              class="font-display text-sm font-semibold"
              :style="{ color: 'var(--color-on-surface)' }"
            >
              {{ service.name }}
            </span>
          </div>
          <div class="flex items-center gap-4 text-xs">
            <span :style="{ color: 'var(--color-on-surface-variant)' }">
              Uptime:
              <span class="font-mono" :style="{ color: 'var(--color-on-surface)' }">
                {{ service.uptime }}
              </span>
            </span>
            <span :style="{ color: 'var(--color-on-surface-variant)' }">
              Latency:
              <span class="font-mono" :style="{ color: 'var(--color-on-surface)' }">
                {{ service.latency }}
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. Recent AI Insights -->
    <section>
      <h2
        class="font-display text-lg font-semibold mb-4"
        :style="{ color: 'var(--color-on-surface)' }"
      >
        Recent AI Insights
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AiInsightCard
          v-for="(insight, index) in aiInsights"
          :key="index"
          :title="insight.title"
          :description="insight.description"
          :timestamp="insight.timestamp"
        />
      </div>
    </section>
  </div>
</template>
