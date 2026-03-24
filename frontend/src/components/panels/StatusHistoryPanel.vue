<script setup lang="ts">
// Import ECharts heatmap components
import { HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VChart from 'vue-echarts'
import {
  chartAxisStyle,
  chartPalette,
  chartTooltipStyle,
  thresholdColors,
} from '../../utils/chartTheme'

// Register ECharts components
use([CanvasRenderer, HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent])

export interface StatusCell {
  entity: string  // y-axis label (e.g., "api-1", "api-2", "db-primary")
  bucket: string  // x-axis label (e.g., "10:00", "10:05", "10:10")
  state: string   // "up", "down", "degraded", etc.
}

/** Numeric mapping: up=0, degraded=1, down=2, unknown=3 */
const STATE_TO_NUM: Record<string, number> = {
  up: 0,
  healthy: 0,
  ok: 0,
  degraded: 1,
  warning: 1,
  down: 2,
  error: 2,
  critical: 2,
}

const props = defineProps<{
  cells: StatusCell[]
  stateColors?: Record<string, string>  // override state→color mapping
}>()

/** Resolve the color for a state, checking custom overrides first. */
function resolveStateColor(state: string): string {
  if (props.stateColors?.[state]) {
    return props.stateColors[state]
  }
  const s = state.toLowerCase()
  if (s === 'up' || s === 'healthy' || s === 'ok') return thresholdColors.good
  if (s === 'down' || s === 'error' || s === 'critical') return thresholdColors.critical
  if (s === 'degraded' || s === 'warning') return thresholdColors.warning
  return chartPalette[7]
}

/** Map a state string to its numeric value for visualMap. */
function stateToNum(state: string): number {
  const s = state.toLowerCase()
  return STATE_TO_NUM[s] ?? 3
}

const chartRef = ref<typeof VChart | null>(null)

/** Unique bucket labels, preserving insertion order. */
const buckets = computed(() => {
  const seen = new Set<string>()
  for (const cell of props.cells) {
    seen.add(cell.bucket)
  }
  return Array.from(seen)
})

/** Unique entity names, preserving insertion order. */
const entities = computed(() => {
  const seen = new Set<string>()
  for (const cell of props.cells) {
    seen.add(cell.entity)
  }
  return Array.from(seen)
})

/** Series data: [bucketIndex, entityIndex, stateNumericValue] */
const seriesData = computed(() =>
  props.cells.map((cell) => [
    buckets.value.indexOf(cell.bucket),
    entities.value.indexOf(cell.entity),
    stateToNum(cell.state),
  ]),
)

/** Build the piecewise visualMap pieces using resolved colors. */
const visualMapPieces = computed(() => [
  { value: 0, label: 'Up', color: resolveStateColor('up') },
  { value: 1, label: 'Degraded', color: resolveStateColor('degraded') },
  { value: 2, label: 'Down', color: resolveStateColor('down') },
  { value: 3, label: 'Unknown', color: chartPalette[7] },
])

/** Build state name lookup for tooltip (numeric → state label). */
const numToStateName = computed(() => {
  const map = new Map<number, string>()
  for (const cell of props.cells) {
    const num = stateToNum(cell.state)
    if (!map.has(num)) {
      map.set(num, cell.state)
    }
  }
  return map
})

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: {
    left: '3%',
    right: '8%',
    top: '8%',
    bottom: '12%',
    containLabel: true,
  },
  tooltip: {
    trigger: 'item' as const,
    backgroundColor: chartTooltipStyle.backgroundColor,
    borderColor: chartTooltipStyle.borderColor,
    borderWidth: 1,
    textStyle: {
      color: chartTooltipStyle.textStyle.color,
      fontFamily: chartTooltipStyle.textStyle.fontFamily,
      fontSize: chartTooltipStyle.textStyle.fontSize,
    },
    formatter: (params: { data: [number, number, number] }) => {
      const [bucketIdx, entityIdx, stateNum] = params.data
      const entity = entities.value[entityIdx] ?? '?'
      const bucket = buckets.value[bucketIdx] ?? '?'
      const stateName = numToStateName.value.get(stateNum) ?? 'unknown'
      return `${entity}<br/>Time: <b>${bucket}</b><br/>State: <b>${stateName}</b>`
    },
  },
  visualMap: {
    type: 'piecewise' as const,
    pieces: visualMapPieces.value,
    orient: 'horizontal' as const,
    left: 'center',
    bottom: 0,
    show: true,
    textStyle: {
      color: chartAxisStyle.axisLabel.color,
      fontFamily: chartAxisStyle.axisLabel.fontFamily,
      fontSize: chartAxisStyle.axisLabel.fontSize,
    },
  },
  xAxis: {
    type: 'category' as const,
    data: buckets.value,
    axisLine: {
      lineStyle: {
        color: chartAxisStyle.axisLine.lineStyle.color,
      },
    },
    axisTick: {
      show: chartAxisStyle.axisTick.show,
    },
    axisLabel: {
      color: chartAxisStyle.axisLabel.color,
      fontFamily: chartAxisStyle.axisLabel.fontFamily,
      fontSize: chartAxisStyle.axisLabel.fontSize,
    },
    splitLine: {
      lineStyle: {
        color: chartAxisStyle.splitLine.lineStyle.color,
      },
    },
  },
  yAxis: {
    type: 'category' as const,
    data: entities.value,
    axisLine: {
      lineStyle: {
        color: chartAxisStyle.axisLine.lineStyle.color,
      },
    },
    axisTick: {
      show: chartAxisStyle.axisTick.show,
    },
    axisLabel: {
      color: chartAxisStyle.axisLabel.color,
      fontFamily: chartAxisStyle.axisLabel.fontFamily,
      fontSize: chartAxisStyle.axisLabel.fontSize,
    },
    splitLine: {
      lineStyle: {
        color: chartAxisStyle.splitLine.lineStyle.color,
      },
    },
  },
  series: [
    {
      type: 'heatmap' as const,
      data: seriesData.value,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
        },
      },
    },
  ],
}))

// Handle resize
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const container = chartRef.value?.$el?.parentElement
  if (container) {
    resizeObserver = new ResizeObserver(() => {
      chartRef.value?.resize()
    })
    resizeObserver.observe(container)
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
  <div class="h-full w-full">
    <VChart
      ref="chartRef"
      :option="chartOption"
      :autoresize="true"
      class="h-full w-full"
    />
  </div>
</template>
