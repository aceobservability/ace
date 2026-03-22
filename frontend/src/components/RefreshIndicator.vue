<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import StatusDot from './StatusDot.vue'

const props = defineProps<{
  lastRefreshed: Date | null
  autoRefreshInterval: number
  onIntervalChange: (ms: number) => void
}>()

const dropdownOpen = ref(false)
const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

const intervalOptions = [
  { label: '15s', value: 15000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: '5m', value: 300000 },
  { label: 'Off', value: 0 },
]

const currentLabel = computed(() => {
  const match = intervalOptions.find((o) => o.value === props.autoRefreshInterval)
  return match ? match.label : 'Off'
})

const secondsAgo = computed(() => {
  if (!props.lastRefreshed) return null
  return Math.max(0, Math.floor((now.value - props.lastRefreshed.getTime()) / 1000))
})

const isStale = computed(() => {
  if (!props.lastRefreshed || props.autoRefreshInterval <= 0) return false
  const elapsed = now.value - props.lastRefreshed.getTime()
  return elapsed > props.autoRefreshInterval * 2
})

const isAutoRefreshing = computed(() => props.autoRefreshInterval > 0)

function selectInterval(ms: number) {
  props.onIntervalChange(ms)
  dropdownOpen.value = false
}

function formatAgo(seconds: number | null): string {
  if (seconds === null) return 'Never'
  if (seconds < 60) return `${seconds}s ago`
  const mins = Math.floor(seconds / 60)
  return `${mins}m ago`
}

onMounted(() => {
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
})
</script>

<template>
  <div class="flex items-center gap-3 text-sm">
    <StatusDot
      :status="isAutoRefreshing ? 'healthy' : 'info'"
      :pulse="isAutoRefreshing"
      :size="6"
    />

    <span
      :style="{
        color: isStale ? 'var(--color-tertiary)' : 'var(--color-on-surface-variant)',
      }"
    >
      Last refreshed {{ formatAgo(secondsAgo) }}
      <template v-if="isStale"> &mdash; Data may be stale</template>
    </span>

    <div class="relative">
      <button
        data-testid="refresh-dropdown-toggle"
        class="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
        :style="{
          borderColor: 'var(--color-outline-variant)',
          color: 'var(--color-on-surface-variant)',
          backgroundColor: 'var(--color-surface-container-low)',
        }"
        @click="dropdownOpen = !dropdownOpen"
      >
        {{ currentLabel }}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          :style="{ color: 'var(--color-outline)' }"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <div
        v-if="dropdownOpen"
        class="absolute right-0 top-full mt-1 rounded-lg border py-1 shadow-lg"
        :style="{
          backgroundColor: 'var(--color-surface-bright)',
          borderColor: 'var(--color-outline-variant)',
          minWidth: '80px',
          zIndex: 50,
        }"
      >
        <button
          v-for="opt in intervalOptions"
          :key="opt.value"
          data-testid="refresh-option"
          class="block w-full px-3 py-1.5 text-left text-xs transition-colors hover:opacity-80"
          :style="{
            color:
              opt.value === autoRefreshInterval
                ? 'var(--color-primary)'
                : 'var(--color-on-surface-variant)',
            backgroundColor:
              opt.value === autoRefreshInterval
                ? 'var(--color-surface-container-high)'
                : 'transparent',
          }"
          @click="selectInterval(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
  </div>
</template>
