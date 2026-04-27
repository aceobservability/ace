<script setup lang="ts">
import { Activity, AlertCircle, Star } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchDataSourceTraceServices } from '../api/datasources'
import EmptyState from '../components/EmptyState.vue'
import StatusDot from '../components/StatusDot.vue'
import { useCommandContext } from '../composables/useCommandContext'
import { useDatasource } from '../composables/useDatasource'
import { useFavorites } from '../composables/useFavorites'
import { dataSourceTypeLabels, type DataSource } from '../types/datasource'

const { registerContext, deregisterContext } = useCommandContext()
const {
  datasources,
  tracingDatasources,
  loading: datasourcesLoading,
  error: datasourcesError,
} = useDatasource()
const { toggleFavorite, isFavorite } = useFavorites()

interface ServiceInventoryItem {
  id: string
  name: string
  sourceId: string
  sourceName: string
  sourceTypeLabel: string
  status: 'info'
}

const services = ref<ServiceInventoryItem[]>([])
const loadingServices = ref(false)
const discoveryError = ref<string | null>(null)
const hasDataSources = computed(() => datasources.value.length > 0)
const hasTracingSources = computed(() => tracingDatasources.value.length > 0)
let discoveryRun = 0

function labelForDataSource(source: DataSource): string {
  return source.name || dataSourceTypeLabels[source.type]
}

async function loadDiscoveredServices(
  sources: DataSource[],
  signal: AbortSignal,
  runId: number,
): Promise<void> {
  loadingServices.value = true
  discoveryError.value = null

  try {
    const results = await Promise.allSettled(
      sources.map(async (source) => {
        const names = await fetchDataSourceTraceServices(source.id, signal)
        return names
          .map((name) => name.trim())
          .filter(Boolean)
          .map<ServiceInventoryItem>((name) => ({
            id: `${source.id}:${name}`,
            name,
            sourceId: source.id,
            sourceName: labelForDataSource(source),
            sourceTypeLabel: dataSourceTypeLabels[source.type],
            status: 'info',
          }))
      }),
    )

    if (signal.aborted || runId !== discoveryRun) {
      return
    }

    services.value = results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .sort((left, right) => left.name.localeCompare(right.name))

    const failedSources = results.filter((result) => result.status === 'rejected').length
    discoveryError.value = failedSources
      ? `Service discovery failed for ${failedSources} tracing datasource${failedSources === 1 ? '' : 's'}.`
      : null
  } catch (error) {
    if (signal.aborted || runId !== discoveryRun) {
      return
    }
    services.value = []
    discoveryError.value = error instanceof Error ? error.message : 'Failed to discover services'
  } finally {
    if (!signal.aborted && runId === discoveryRun) {
      loadingServices.value = false
    }
  }
}

watch(
  tracingDatasources,
  (sources, _previousSources, onCleanup) => {
    const controller = new AbortController()
    const runId = ++discoveryRun

    onCleanup(() => controller.abort())

    if (sources.length === 0) {
      services.value = []
      discoveryError.value = null
      loadingServices.value = false
      return
    }

    void loadDiscoveredServices(sources, controller.signal, runId)
  },
  { immediate: true },
)

onMounted(() => {
  registerContext({
    viewName: 'Services',
    viewRoute: '/app/services',
    description: 'Services discovered from connected tracing datasources.',
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
        Service inventory discovered from tracing datasources. Ace does not show sample health data here.
      </p>
    </div>

    <div
      v-if="datasourcesLoading || loadingServices"
      data-testid="services-loading"
      class="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg p-6 text-sm"
      :style="{
        backgroundColor: 'var(--color-surface-container-low)',
        color: 'var(--color-on-surface-variant)',
      }"
    >
      <Activity :size="28" />
      Discovering services from tracing datasources…
    </div>

    <div
      v-else-if="datasourcesError"
      data-testid="services-error"
      class="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg p-6 text-sm"
      :style="{
        backgroundColor: 'var(--color-surface-container-low)',
        color: 'var(--color-error)',
      }"
    >
      <AlertCircle :size="28" />
      {{ datasourcesError }}
    </div>

    <EmptyState
      v-else-if="!hasDataSources"
      :icon="Activity"
      title="No service telemetry configured"
      description="Connect a tracing datasource to discover services. Ace will not show hardcoded sample services here."
      action-label="Add Data Source"
      action-route="/app/settings/datasources"
    />

    <EmptyState
      v-else-if="!hasTracingSources"
      :icon="Activity"
      title="No tracing datasource configured"
      description="Services are discovered from Tempo, VictoriaTraces, or ClickHouse tracing data. Add one to populate this view."
      action-label="Add Tracing Source"
      action-route="/app/settings/datasources"
    />

    <div
      v-else-if="discoveryError && services.length === 0"
      data-testid="services-discovery-error"
      class="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg p-6 text-center text-sm"
      :style="{
        backgroundColor: 'var(--color-surface-container-low)',
        color: 'var(--color-on-surface-variant)',
      }"
    >
      <AlertCircle :size="28" :style="{ color: 'var(--color-tertiary)' }" />
      <h2 class="m-0 font-display text-lg" :style="{ color: 'var(--color-on-surface)' }">
        Service discovery unavailable
      </h2>
      <p class="m-0 max-w-md">{{ discoveryError }}</p>
      <p class="m-0 max-w-md">
        Check the tracing datasource connection or use Explore to run a trace query directly.
      </p>
    </div>

    <EmptyState
      v-else-if="services.length === 0"
      :icon="Activity"
      title="No services discovered yet"
      description="Ace queried your tracing datasource but did not find service names in the current backend response. No sample services are shown."
      action-label="Open Traces Explore"
      action-route="/app/explore/traces"
    />

    <div v-else class="space-y-4">
      <div
        v-if="discoveryError"
        data-testid="services-partial-warning"
        class="rounded-lg px-4 py-3 text-sm"
        :style="{
          backgroundColor: 'rgba(249,115,22,0.08)',
          border: '1px solid rgba(249,115,22,0.16)',
          color: 'var(--color-on-surface-variant)',
        }"
      >
        {{ discoveryError }} Showing services from the datasources that responded.
      </div>

      <div
        data-testid="services-data-notice"
        class="rounded-lg px-4 py-3 text-sm"
        :style="{
          backgroundColor: 'var(--color-surface-container-low)',
          border: '1px solid var(--color-outline-variant)',
          color: 'var(--color-on-surface-variant)',
        }"
      >
        Inventory only: health, latency, error rate, and throughput are not inferred on this page until
        they are backed by real telemetry queries.
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="service in services"
          :key="service.id"
          data-testid="service-card"
          class="relative rounded-lg p-5 transition hover:opacity-90"
          :style="{
            backgroundColor: 'var(--color-surface-container-low)',
          }"
        >
          <span
            data-testid="service-inventory-chip"
            class="absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-medium"
            :style="{
              backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
              color: 'var(--color-primary)',
            }"
          >
            Inventory only
          </span>

          <div class="flex items-center gap-3 mb-4 pr-24">
            <StatusDot :status="service.status" :size="8" />
            <h3
              data-testid="service-name"
              class="font-display text-base font-semibold flex-1 truncate"
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
            <div class="flex items-center justify-between gap-3">
              <span
                class="text-xs"
                :style="{ color: 'var(--color-on-surface-variant)' }"
              >Source</span>
              <span
                data-testid="service-field"
                class="truncate text-right font-mono text-sm font-medium"
                :style="{ color: 'var(--color-on-surface)' }"
              >
                {{ service.sourceName }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span
                class="text-xs"
                :style="{ color: 'var(--color-on-surface-variant)' }"
              >Datasource</span>
              <span
                data-testid="service-field"
                class="font-mono text-sm font-medium"
                :style="{ color: 'var(--color-on-surface)' }"
              >
                {{ service.sourceTypeLabel }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span
                class="text-xs"
                :style="{ color: 'var(--color-on-surface-variant)' }"
              >Health</span>
              <span
                data-testid="service-field"
                class="font-mono text-sm font-medium"
                :style="{ color: 'var(--color-on-surface-variant)' }"
              >
                Not evaluated
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
