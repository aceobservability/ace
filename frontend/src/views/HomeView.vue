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
  return localStorage.getItem('ace-has-datasources') === 'true'
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
    type: 'anomaly' as const,
  },
  {
    title: 'Optimization Suggestion',
    description: 'Database query latency can be reduced by 30% with index on users.email.',
    timestamp: '15 minutes ago',
    type: 'optimization' as const,
  },
  {
    title: 'Capacity Forecast',
    description: 'Message Queue will reach 80% capacity in approximately 3 days at current growth rate.',
    timestamp: '1 hour ago',
    type: 'forecast' as const,
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
  <div v-else class="px-6 py-8 max-w-[1600px] mx-auto space-y-8 relative overflow-hidden">
    <!-- Ambient radial glow -->
    <div
      class="absolute pointer-events-none"
      :style="{
        top: '-60px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
        height: '300px',
        background: 'radial-gradient(ellipse 60% 50%, rgba(229,160,13,0.10), rgba(229,160,13,0.03) 50%, transparent 80%)',
        zIndex: 0,
      }"
    />

    <!-- 1. Hero AI Command Input -->
    <div
      data-testid="ai-command-input"
      class="rounded-2xl p-8 text-center relative overflow-hidden animate-fade-in"
      :style="{
        background: 'linear-gradient(180deg, var(--color-surface-container-low) 0%, var(--color-surface) 100%)',
        border: '1px solid rgba(229,160,13,0.12)',
        zIndex: 1,
      }"
    >
      <!-- Amber glow line -->
      <div
        class="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-[200px]"
        :style="{
          background: 'linear-gradient(90deg, transparent, var(--color-primary), transparent)',
        }"
      />

      <h1
        class="font-display font-bold mb-4"
        :style="{
          color: 'var(--color-on-surface)',
          fontSize: '32px',
          letterSpacing: '-0.04em',
        }"
      >
        Ask Ace anything
      </h1>
      <div
        class="mx-auto max-w-[480px] rounded-xl px-4 py-3 text-left text-sm cursor-pointer transition-colors flex items-center justify-between"
        :style="{
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface-variant)',
          border: '1px solid var(--color-outline-variant)',
        }"
      >
        <span class="opacity-60">Search services, query data, generate dashboards...</span>
        <kbd
          class="text-[9px] shrink-0 ml-3 px-1.5 py-0.5 rounded"
          :style="{
            border: '1px solid var(--color-outline-variant)',
            color: 'var(--color-outline)',
          }"
        >&#8984;K</kbd>
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

    <!-- 5. Two-Column Panels -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Left Panel: System Health -->
      <section
        data-testid="system-health-grid"
        class="rounded-xl p-5 animate-fade-in"
        :style="{
          backgroundColor: 'var(--color-surface-container-low)',
          border: '1px solid var(--color-outline-variant)',
        }"
      >
        <div class="flex items-center justify-between mb-4">
          <span
            class="text-[11px] uppercase tracking-widest font-semibold"
            :style="{ color: 'var(--color-secondary)' }"
          >
            System Health
          </span>
          <span
            class="text-[11px]"
            :style="{ color: 'var(--color-on-surface-variant)' }"
          >
            {{ healthServices.length }} services
          </span>
        </div>
        <div class="flex flex-col gap-1.5">
          <div
            v-for="service in healthServices"
            :key="service.name"
            data-testid="health-card"
            class="flex items-center gap-3 rounded-lg px-3 py-2"
            :style="{
              backgroundColor:
                service.status === 'critical'
                  ? 'rgba(239,68,68,0.08)'
                  : service.status === 'warning'
                    ? 'rgba(249,115,22,0.08)'
                    : 'var(--color-surface-container-high)',
              border:
                service.status === 'critical'
                  ? '1px solid rgba(239,68,68,0.12)'
                  : service.status === 'warning'
                    ? '1px solid rgba(249,115,22,0.12)'
                    : '1px solid transparent',
            }"
          >
            <StatusDot :status="service.status" :size="6" />
            <span
              class="text-sm flex-1"
              :style="{ color: 'var(--color-on-surface)' }"
            >
              {{ service.name }}
            </span>
            <span
              class="font-mono text-[13px]"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >
              {{ service.latency }}
            </span>
            <span
              class="font-mono text-[13px]"
              :style="{
                color:
                  service.status === 'critical'
                    ? 'var(--color-error)'
                    : service.status === 'warning'
                      ? 'var(--color-tertiary)'
                      : 'var(--color-secondary)',
              }"
            >
              {{ service.uptime }}
            </span>
          </div>
        </div>
      </section>

      <!-- Right Panel: AI Insights -->
      <section
        class="rounded-xl p-5 animate-fade-in"
        :style="{
          backgroundColor: 'var(--color-surface-container-low)',
          border: '1px solid rgba(229,160,13,0.08)',
          animationDelay: '50ms',
        }"
      >
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <span
              class="inline-block shrink-0"
              :style="{
                width: '10px',
                height: '10px',
                borderRadius: '3px',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              }"
            />
            <span
              class="text-[11px] uppercase tracking-widest font-semibold"
              :style="{ color: 'var(--color-primary)' }"
            >
              AI Insights
            </span>
          </div>
          <span
            class="text-[11px]"
            :style="{ color: 'var(--color-outline)' }"
          >
            {{ aiInsights.length }} insights
          </span>
        </div>
        <div class="flex flex-col gap-2">
          <AiInsightCard
            v-for="(insight, index) in aiInsights"
            :key="index"
            :title="insight.title"
            :description="insight.description"
            :timestamp="insight.timestamp"
            :type="insight.type"
          />
        </div>
      </section>
    </div>
  </div>
</template>
