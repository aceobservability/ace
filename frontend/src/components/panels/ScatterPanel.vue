<script setup lang="ts">
// Import ECharts scatter chart components
import { ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VChart from 'vue-echarts'
import {
  chartAxisStyle,
  chartGridStyle,
  chartLegendStyle,
  chartTooltipStyle,
  getSeriesColor,
} from '../../utils/chartTheme'

// Register ECharts components
use([CanvasRenderer, ScatterChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps<{
  series: Array<{
    name: string
    data: Array<[number, number]> // [x, y] pairs
  }>
}>()

const chartRef = ref<typeof VChart | null>(null)

const showLegend = computed(() => props.series.length > 1)

const axisStyle = {
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
}

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: {
    left: '3%',
    right: '4%',
    top: showLegend.value ? '12%' : '8%',
    bottom: '8%',
    containLabel: true,
  },
  legend: {
    show: showLegend.value,
    textStyle: {
      color: chartLegendStyle.textStyle.color,
      fontFamily: chartLegendStyle.textStyle.fontFamily,
      fontSize: chartLegendStyle.textStyle.fontSize,
    },
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
    formatter: (params: { seriesName: string; value: [number, number] }) => {
      return `${params.seriesName}<br/>x: ${params.value[0]}<br/>y: ${params.value[1]}`
    },
  },
  xAxis: axisStyle,
  yAxis: axisStyle,
  series: props.series.map((s, index) => ({
    name: s.name,
    type: 'scatter' as const,
    symbolSize: 8,
    data: s.data,
    itemStyle: {
      color: getSeriesColor(index),
    },
  })),
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
