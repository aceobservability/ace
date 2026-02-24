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
    return '#f5f5f5' // Default text color
  }

  const sortedThresholds = [...props.thresholds].sort((a, b) => a.value - b.value)
  let color = '#f5f5f5' // Default

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
    class="stat-panel"
    :style="{
      height: typeof height === 'number' ? `${height}px` : height,
      backgroundColor: backgroundColor,
    }"
  >
    <div class="stat-content">
      <div class="stat-value" :style="{ color: valueColor }">
        {{ formattedValue }}
      </div>

      <div v-if="label" class="stat-label">
        {{ label }}
      </div>

      <div v-if="showTrend && trend !== 'neutral'" class="stat-trend" :class="`trend-${trend}`">
        <TrendingUp v-if="trend === 'up'" :size="16" />
        <TrendingDown v-if="trend === 'down'" :size="16" />
        <Minus v-if="(trend as string) === 'neutral'" :size="16" />
        <span v-if="trendPercentage" class="trend-value">
          {{ trend === 'up' ? '+' : '' }}{{ trendPercentage }}%
        </span>
      </div>
    </div>

    <div v-if="showSparkline && hasSparklineData" class="stat-sparkline">
      <VChart
        ref="chartRef"
        :option="sparklineOption"
        :autoresize="true"
        class="sparkline-chart"
      />
    </div>
  </div>
</template>

<style>
.stat-panel {
  width: 100%;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.stat-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  z-index: 1;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-text-1);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  margin-top: 0.25rem;
}

.trend-up {
  color: #4ecdc4;
}

.trend-down {
  color: #ff6b6b;
}

.trend-neutral {
  color: var(--color-text-2);
}

.trend-value {
  font-variant-numeric: tabular-nums;
}

.stat-sparkline {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40%;
  opacity: 0.5;
  pointer-events: none;
}

.sparkline-chart {
  width: 100%;
  height: 100%;
}
</style>
