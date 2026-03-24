<script setup lang="ts">
// Import ECharts bar chart components
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
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
use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])

const props = defineProps<{
  buckets: Array<{ label: string; count: number }>
  color?: string
}>()

const chartRef = ref<typeof VChart | null>(null)

const barColor = computed(() => props.color ?? chartPalette[0])

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
    trigger: 'axis' as const,
    axisPointer: {
      type: 'shadow' as const,
    },
    backgroundColor: chartTooltipStyle.backgroundColor,
    borderColor: chartTooltipStyle.borderColor,
    borderWidth: 1,
    textStyle: {
      color: chartTooltipStyle.textStyle.color,
      fontFamily: chartTooltipStyle.textStyle.fontFamily,
      fontSize: chartTooltipStyle.textStyle.fontSize,
    },
    formatter: (params: Array<{ name: string; value: number }>) => {
      const p = params[0]
      return `${p.name}: ${p.value}`
    },
  },
  xAxis: {
    type: 'category' as const,
    data: props.buckets.map((b) => b.label),
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
    type: 'value' as const,
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
      type: 'bar' as const,
      barWidth: '90%',
      data: props.buckets.map((b) => b.count),
      itemStyle: {
        color: barColor.value,
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
