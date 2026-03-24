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
  chartGridStyle,
  chartPalette,
  chartTooltipStyle,
} from '../../utils/chartTheme'

// Register ECharts components
use([CanvasRenderer, HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent])

export interface HeatmapDataPoint {
  x: number | string // x-axis value (timestamp or category)
  y: number | string // y-axis value (bucket/category)
  value: number // heat value
}

const props = defineProps<{
  data: HeatmapDataPoint[]
  xLabels?: string[]
  yLabels?: string[]
  min?: number
  max?: number
}>()

const chartRef = ref<typeof VChart | null>(null)

const computedMax = computed(() => {
  if (props.max !== undefined) return props.max
  if (props.data.length === 0) return 0
  return Math.max(...props.data.map((d) => d.value))
})

const computedMin = computed(() => {
  if (props.min !== undefined) return props.min
  return 0
})

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: {
    left: '3%',
    right: '8%',
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
    formatter: (params: { data: [number | string, number | string, number] }) => {
      const [x, y, value] = params.data
      return `x: ${x}<br/>y: ${y}<br/>value: ${value}`
    },
  },
  visualMap: {
    type: 'continuous' as const,
    min: computedMin.value,
    max: computedMax.value,
    calculable: true,
    orient: 'horizontal' as const,
    left: 'center',
    bottom: 0,
    inRange: {
      color: [chartPalette[0], chartPalette[1]], // Steel Blue → Rust Orange
    },
    textStyle: {
      color: chartAxisStyle.axisLabel.color,
      fontFamily: chartAxisStyle.axisLabel.fontFamily,
      fontSize: chartAxisStyle.axisLabel.fontSize,
    },
  },
  xAxis: {
    type: 'category' as const,
    data: props.xLabels,
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
        color: chartGridStyle.gridColor,
      },
    },
  },
  yAxis: {
    type: 'category' as const,
    data: props.yLabels,
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
        color: chartGridStyle.gridColor,
      },
    },
  },
  series: [
    {
      type: 'heatmap' as const,
      data: props.data.map((d) => [d.x, d.y, d.value]),
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
