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
  chartTooltipStyle,
  getSeriesColor,
} from '../../utils/chartTheme'

// Register ECharts components
use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])

const props = defineProps<{
  items: Array<{ label: string; value: number; max?: number }>
  orientation?: 'horizontal' | 'vertical'
}>()

const chartRef = ref<typeof VChart | null>(null)

const isHorizontal = computed(() => (props.orientation ?? 'horizontal') === 'horizontal')

const categoryLabels = computed(() => props.items.map((item) => item.label))

const backgroundData = computed(() =>
  props.items.map((item) => ({
    value: item.max ?? 100,
    itemStyle: { color: chartGridStyle.gridColor },
  })),
)

const valueData = computed(() =>
  props.items.map((item, index) => ({
    value: item.value,
    itemStyle: { color: getSeriesColor(index) },
  })),
)

const axisStyle = {
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

const categoryAxis = computed(() => ({
  type: 'category' as const,
  data: categoryLabels.value,
  ...axisStyle,
}))

const valueAxis = computed(() => ({
  type: 'value' as const,
  ...axisStyle,
}))

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
    formatter: (params: Array<{ name: string; value: number; seriesId?: string }>) => {
      // Only show the value series in tooltip (not the background)
      const valueParam = params.find((p) => p.seriesId === 'values')
      if (!valueParam) return ''
      const item = props.items.find((i) => i.label === valueParam.name)
      const max = item?.max ?? 100
      return `${valueParam.name}: ${valueParam.value} / ${max}`
    },
  },
  // For horizontal: xAxis = value, yAxis = category
  // For vertical:   xAxis = category, yAxis = value
  xAxis: [isHorizontal.value ? valueAxis.value : categoryAxis.value],
  yAxis: [isHorizontal.value ? categoryAxis.value : valueAxis.value],
  series: [
    {
      id: 'background',
      type: 'bar' as const,
      barWidth: '60%',
      barGap: '-100%', // overlap with value bars
      silent: true,
      data: backgroundData.value,
    },
    {
      id: 'values',
      type: 'bar' as const,
      barWidth: '60%',
      data: valueData.value,
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
