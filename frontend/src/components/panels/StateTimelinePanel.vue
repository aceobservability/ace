<script setup lang="ts">
// Import ECharts custom chart components
import { CustomChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
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
use([CanvasRenderer, CustomChart, GridComponent, TooltipComponent, LegendComponent])

export interface StateSegment {
  entity: string // e.g. "api-server", "db-primary"
  state: string // e.g. "up", "down", "degraded"
  start: number // Unix timestamp (seconds)
  end: number // Unix timestamp (seconds)
}

const props = defineProps<{
  segments: StateSegment[]
  stateColors?: Record<string, string> // override state→color mapping
}>()

/** Resolve a state name to its display color. */
function resolveColor(state: string): string {
  // Check custom override first
  if (props.stateColors?.[state]) {
    return props.stateColors[state]
  }
  const s = state.toLowerCase()
  if (s === 'up' || s === 'healthy' || s === 'ok') {
    return thresholdColors.good
  }
  if (s === 'down' || s === 'error' || s === 'critical') {
    return thresholdColors.critical
  }
  if (s === 'degraded' || s === 'warning') {
    return thresholdColors.warning
  }
  return chartPalette[7] // Alloy Silver for unknown states
}

const chartRef = ref<typeof VChart | null>(null)

/** Unique entity names — used as category axis labels. */
const entities = computed(() => {
  const seen = new Set<string>()
  for (const seg of props.segments) {
    seen.add(seg.entity)
  }
  return Array.from(seen)
})

/** Enriched segment data with resolved colors. */
const seriesData = computed(() =>
  props.segments.map((seg) => ({
    ...seg,
    color: resolveColor(seg.state),
    value: [entities.value.indexOf(seg.entity), seg.start, seg.end],
  })),
)

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: {
    left: '3%',
    right: '4%',
    top: '8%',
    bottom: '8%',
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
    formatter: (params: { data: { entity: string; state: string; start: number; end: number } }) => {
      const { entity, state, start, end } = params.data
      const durationSec = end - start
      return `${entity}<br/>State: <b>${state}</b><br/>Duration: ${durationSec}s`
    },
  },
  xAxis: {
    type: 'time' as const,
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
  },
  series: [
    {
      type: 'custom' as const,
      renderItem: (
        _params: { dataIndex: number },
        api: {
          value: (idx: number) => number
          coord: (arr: number[]) => number[]
          size: (arr: number[]) => number[]
          style: () => object
        },
      ) => {
        const entityIndex = api.value(0)
        const start = api.value(1)
        const end = api.value(2)
        const startCoord = api.coord([start, entityIndex])
        const endCoord = api.coord([end, entityIndex])
        const height = (api.size([0, 1])[1] ?? 20) * 0.6
        return {
          type: 'rect',
          shape: {
            x: startCoord[0],
            y: startCoord[1] - height / 2,
            width: endCoord[0] - startCoord[0],
            height,
          },
          style: {
            fill: seriesData.value[_params.dataIndex]?.color ?? chartPalette[7],
          },
        }
      },
      encode: {
        x: [1, 2],
        y: 0,
      },
      data: seriesData.value,
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
