<script setup lang="ts">
// Import ECharts candlestick components
import { CandlestickChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { useCrosshairSync } from '../../composables/useCrosshairSync'
import {
  chartAxisStyle,
  chartGridStyle,
  chartTooltipStyle,
  thresholdColors,
} from '../../utils/chartTheme'

const { groupId } = useCrosshairSync()

// Register ECharts components
use([CanvasRenderer, CandlestickChart, GridComponent, TooltipComponent])

export interface CandlestickDataPoint {
  timestamp: number // Unix seconds
  open: number
  close: number
  low: number
  high: number
}

const props = defineProps<{
  data: CandlestickDataPoint[]
}>()

const chartRef = ref<typeof VChart | null>(null)

// ECharts candlestick data format with time axis: [timestamp_ms, open, close, low, high]
const seriesData = computed(() =>
  props.data.map((d) => [d.timestamp * 1000, d.open, d.close, d.low, d.high]),
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
    trigger: 'axis' as const,
    axisPointer: {
      type: 'cross' as const,
    },
    backgroundColor: chartTooltipStyle.backgroundColor,
    borderColor: chartTooltipStyle.borderColor,
    borderWidth: 1,
    textStyle: {
      color: chartTooltipStyle.textStyle.color,
      fontFamily: chartTooltipStyle.textStyle.fontFamily,
      fontSize: chartTooltipStyle.textStyle.fontSize,
    },
    formatter: (
      params: Array<{ data: [number, number, number, number, number] }>,
    ) => {
      const p = params[0]
      if (!p) return ''
      const [ts, open, close, low, high] = p.data
      const date = new Date(ts).toLocaleString()
      return [
        `<b>${date}</b>`,
        `Open: ${open}`,
        `Close: ${close}`,
        `Low: ${low}`,
        `High: ${high}`,
      ].join('<br/>')
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
      type: 'candlestick' as const,
      data: seriesData.value,
      itemStyle: {
        // Up candle (close > open): use thresholdColors.good
        color: thresholdColors.good,
        // Down candle (close < open): use thresholdColors.critical
        color0: thresholdColors.critical,
        borderColor: thresholdColors.good,
        borderColor0: thresholdColors.critical,
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
      :group="groupId ?? undefined"
      class="h-full w-full"
    />
  </div>
</template>
