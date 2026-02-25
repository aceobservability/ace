<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import type { EChartsOption } from 'echarts'

// Register ECharts components for sparkline
use([CanvasRenderer, LineChart, GridComponent])

interface Threshold {
  value: number
  color: string
  background?: string
}

export interface DataPoint {
  timestamp: number
  value: number
}

const props = withDefaults(
  defineProps<{
    value: number
    previousValue?: number
    data?: DataPoint[]
    label?: string
    unit?: string
    decimals?: number
    thresholds?: Threshold[]
    showTrend?: boolean
    showSparkline?: boolean
    height?: string | number
  }>(),
  {
    previousValue: undefined,
    data: () => [],
    label: '',
    unit: '',
    decimals: 2,
    thresholds: () => [],
    showTrend: true,
    showSparkline: true,
    height: '100%',
  }
)

const chartRef = ref<typeof VChart | null>(null)

// Format value with decimals and unit, with human-readable suffixes
function formatValue(value: number): string {
  if (Math.abs(value) >= 1000000000) {
    return `${(value / 1000000000).toFixed(props.decimals)}B${props.unit}`
  }
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(props.decimals)}M${props.unit}`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(props.decimals)}K${props.unit}`
  }
  return `${value.toFixed(props.decimals)}${props.unit}`
}

// Get the color based on thresholds
function getValueColor(): string {
  if (!props.thresholds || props.thresholds.length === 0) {
    return '#0f172a' // Default text color (slate-900)
  }

  const sortedThresholds = [...props.thresholds].sort((a, b) => a.value - b.value)
  let color = '#0f172a' // Default (slate-900)

  for (const threshold of sortedThresholds) {
    if (props.value >= threshold.value) {
      color = threshold.color
    }
  }
  return color
}

// Get the background color based on thresholds
function getBackgroundColor(): string {
  if (!props.thresholds || props.thresholds.length === 0) {
    return 'transparent'
  }

  const sortedThresholds = [...props.thresholds].sort((a, b) => a.value - b.value)
  let background = 'transparent'

  for (const threshold of sortedThresholds) {
    if (props.value >= threshold.value && threshold.background) {
      background = threshold.background
    }
  }
  return background
}

// Calculate trend
const trend = computed(() => {
  if (props.previousValue === undefined || props.previousValue === null) {
    return 'neutral'
  }
  if (props.value > props.previousValue) {
    return 'up'
  }
  if (props.value < props.previousValue) {
    return 'down'
  }
  return 'neutral'
})

// Calculate trend percentage
const trendPercentage = computed(() => {
  if (props.previousValue === undefined || props.previousValue === null || props.previousValue === 0) {
    return null
  }
  const change = ((props.value - props.previousValue) / Math.abs(props.previousValue)) * 100
  return change.toFixed(1)
})

// Sparkline chart option
const sparklineOption = computed<EChartsOption>(() => {
  if (!props.data || props.data.length === 0) {
    return {}
  }

  const valueColor = getValueColor()

  return {
    backgroundColor: 'transparent',
    grid: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    xAxis: {
      type: 'category',
      show: false,
      data: props.data.map((d) => d.timestamp),
    },
    yAxis: {
      type: 'value',
      show: false,
      min: 'dataMin',
      max: 'dataMax',
    },
    series: [
      {
        type: 'line',
        data: props.data.map((d) => d.value),
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: valueColor,
        },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${valueColor}40` },
              { offset: 1, color: `${valueColor}05` },
            ],
          },
        },
      },
    ],
  }
})

const formattedValue = computed(() => formatValue(props.value))
const valueColor = computed(() => getValueColor())
const backgroundColor = computed(() => getBackgroundColor())
const hasSparklineData = computed(() => props.data && props.data.length > 0)

// Handle resize
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (chartRef.value) {
    const container = chartRef.value.$el?.parentElement
    if (container) {
      resizeObserver = new ResizeObserver(() => {
        chartRef.value?.resize()
      })
      resizeObserver.observe(container)
    }
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <div
    class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg p-4"
    :style="{
      height: typeof height === 'number' ? `${height}px` : height,
      backgroundColor: backgroundColor,
    }"
  >
    <div class="z-10 flex flex-col items-center gap-1">
      <div class="text-center text-3xl font-bold leading-tight" :style="{ color: valueColor }">
        {{ formattedValue }}
        <span v-if="unit" class="ml-1 text-lg font-medium text-slate-400">{{ unit }}</span>
      </div>

      <div v-if="label" class="mt-1 max-w-full truncate text-sm text-slate-500">
        {{ label }}
      </div>

      <div
        v-if="showTrend && trend !== 'neutral'"
        class="mt-1 flex items-center gap-1 text-xs font-medium"
        :class="{
          'text-emerald-600': trend === 'up',
          'text-rose-500': trend === 'down',
          'text-slate-400': trend === 'neutral',
        }"
      >
        <TrendingUp v-if="trend === 'up'" :size="16" />
        <TrendingDown v-if="trend === 'down'" :size="16" />
        <Minus v-if="trend === 'neutral'" :size="16" />
        <span v-if="trendPercentage" class="tabular-nums">
          {{ trend === 'up' ? '+' : '' }}{{ trendPercentage }}%
        </span>
      </div>
    </div>

    <div v-if="showSparkline && hasSparklineData" class="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 opacity-50">
      <VChart
        ref="chartRef"
        :option="sparklineOption"
        :autoresize="true"
        class="h-full w-full"
      />
    </div>
  </div>
</template>
