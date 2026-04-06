<script setup lang="ts">
import { Activity, Star } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'
import EmptyState from '../components/EmptyState.vue'
import StatusDot from '../components/StatusDot.vue'
import { useCommandContext } from '../composables/useCommandContext'
import { useFavorites } from '../composables/useFavorites'

const { registerContext, deregisterContext } = useCommandContext()
const { toggleFavorite, isFavorite } = useFavorites()

interface ServiceMetrics {
  latencyMs: number
  errorRate: number
  throughput: number
}

interface MockService {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  metrics: ServiceMetrics
  aiPrediction?: string
}

const services = ref<MockService[]>([
  {
    name: 'API Gateway',
    status: 'healthy',
    metrics: { latencyMs: 45, errorRate: 0.12, throughput: 1240 },
  },
  {
    name: 'Auth Service',
    status: 'healthy',
    metrics: { latencyMs: 22, errorRate: 0.03, throughput: 890 },
  },
  {
    name: 'Payment Service',
    status: 'warning',
    metrics: { latencyMs: 180, errorRate: 2.4, throughput: 320 },
    aiPrediction: 'Likely to degrade',
  },
  {
    name: 'Search Engine',
    status: 'healthy',
    metrics: { latencyMs: 68, errorRate: 0.08, throughput: 2100 },
  },
  {
    name: 'Notification Service',
    status: 'warning',
    metrics: { latencyMs: 95, errorRate: 1.2, throughput: 450 },
  },
  {
    name: 'Analytics Pipeline',
    status: 'critical',
    metrics: { latencyMs: 520, errorRate: 8.7, throughput: 85 },
  },
])

const showEmptyState = ref(false)

onMounted(() => {
  registerContext({
    viewName: 'Services',
    viewRoute: '/app/services',
    description: 'Services overview with health metrics',
  })
})

onUnmounted(() => {
  deregisterContext()
})
</script>

<template>
  <div class="mx-auto max-w-[1400px] px-6 py-6">
    <div class="mb-6">
      <h1
        class="font-display text-2xl font-bold"
        :style="{ color: 'var(--color-on-surface)' }"
      >
        Services
      </h1>
      <p
        class="mt-1 text-sm"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        Real-time health and performance of your services
      </p>
    </div>

    <EmptyState
      v-if="showEmptyState"
      :icon="Activity"
      title="No services discovered"
      description="Connect a datasource with service discovery to automatically detect your services."
    />

    <div
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div
        v-for="service in services"
        :key="service.name"
        data-testid="service-card"
        class="relative rounded-lg p-5 transition hover:opacity-90"
        :style="{
          backgroundColor: 'var(--color-surface-container-low)',
        }"
      >
        <!-- AI prediction chip -->
        <span
          v-if="service.aiPrediction"
          data-testid="service-ai-chip"
          class="absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-medium"
          :style="{
            backgroundColor: 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)',
            color: 'var(--color-tertiary)',
          }"
        >
          {{ service.aiPrediction }}
        </span>

        <div class="flex items-center gap-3 mb-4">
          <StatusDot :status="service.status" :size="8" />
          <h3
            data-testid="service-name"
            class="font-display text-base font-semibold flex-1"
            :style="{ color: 'var(--color-on-surface)' }"
          >
            {{ service.name }}
          </h3>
          <button
            class="shrink-0 bg-transparent border-none cursor-pointer p-1"
            :data-testid="`favorite-svc-${service.name}`"
            :title="isFavorite(`svc::${service.name}`) ? 'Remove from favorites' : 'Add to favorites'"
            @click.stop="toggleFavorite({ id: `svc::${service.name}`, title: service.name, type: 'service' })"
          >
            <Star
              :size="14"
              :fill="isFavorite(`svc::${service.name}`) ? 'currentColor' : 'none'"
              :style="{ color: isFavorite(`svc::${service.name}`) ? 'var(--color-primary)' : 'var(--color-outline)' }"
            />
          </button>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span
              class="text-xs"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >Latency</span>
            <span
              data-testid="service-metric"
              class="font-mono text-sm font-medium"
              :style="{ color: 'var(--color-on-surface)' }"
            >
              {{ service.metrics.latencyMs }} ms
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span
              class="text-xs"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >Error Rate</span>
            <span
              data-testid="service-metric"
              class="font-mono text-sm font-medium"
              :style="{
                color: service.metrics.errorRate > 5
                  ? 'var(--color-error)'
                  : service.metrics.errorRate > 1
                    ? 'var(--color-tertiary)'
                    : 'var(--color-on-surface)',
              }"
            >
              {{ service.metrics.errorRate }}%
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span
              class="text-xs"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >Throughput</span>
            <span
              data-testid="service-metric"
              class="font-mono text-sm font-medium"
              :style="{ color: 'var(--color-on-surface)' }"
            >
              {{ service.metrics.throughput }} req/s
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
