<script setup lang="ts">
import { LineChart as EChartsLineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VChart from 'vue-echarts'

// Register ECharts components
use([
  CanvasRenderer,
  EChartsLineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
])

export interface DataPoint {
  timestamp: number // Unix timestamp in seconds
  value: number
}

export interface ChartSeries {
  name: string
  data: DataPoint[]
}

interface TooltipParam {
  data: [number, number | string]
  color: string
  seriesName: string
}

const props = withDefaults(
  defineProps<{
    series: ChartSeries[]
    title?: string
    height?: string | number
  }>(),
  {
    title: '',
    height: '100%',
  },
)

const chartRef = ref<typeof VChart | null>(null)

// Stitch Kinetic palette
const gridColor = 'rgba(71,72,74,0.15)' // outline-variant at 15%
const labelColor = '#757578' // outline
const textColor = '#ababad' // on-surface-variant
const tooltipBg = '#2b2c2f' // surface-bright
const tooltipBorder = 'rgba(71,72,74,0.15)'

// Dashboard palette for line series
const lineColors = [
  '#a3a6ff', // primary
  '#69f6b8', // secondary
  '#ffb148', // tertiary
  '#ff6e84', // error
  '#6063ee', // primary-dim
  '#58e7ab', // secondary-dim
  '#e79400', // tertiary-dim
]

// Format timestamp for display (compact format for axis labels)
function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatFullDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const chartOption = computed(() => {
  const seriesData = props.series.map((s, index) => ({
    name: s.name,
    type: 'line' as const,
    smooth: true,
    showSymbol: false,
    lineStyle: {
      width: 2,
      color: lineColors[index % lineColors.length],
    },
    itemStyle: {
      color: lineColors[index % lineColors.length],
    },
    areaStyle: {
      color: {
        type: 'linear' as const,
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: `${lineColors[index % lineColors.length]}33` },
          { offset: 1, color: `${lineColors[index % lineColors.length]}05` },
        ],
      },
    },
    data: s.data.map((d) => [d.timestamp * 1000, d.value]),
  }))

  return {
    backgroundColor: 'transparent',
    title: props.title
      ? {
          text: props.title,
          left: 'center',
          textStyle: {
            color: textColor,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'Space Grotesk, Inter, sans-serif',
          },
        }
      : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: textColor,
        fontSize: 12,
      },
      formatter: (params: TooltipParam[]) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const timestamp = params[0].data[0]
        const timeStr = formatFullDateTime(timestamp / 1000)
        let result = `<div style="font-weight: 500; margin-bottom: 6px; color: ${labelColor}; font-size: 11px;">${timeStr}</div>`
        for (const param of params) {
          const value = typeof param.data[1] === 'number' ? param.data[1].toFixed(4) : param.data[1]
          result += `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: ${param.color}; border-radius: 50%;"></span>
            <span style="color: ${labelColor}; font-size: 12px;">${param.seriesName}:</span>
            <span style="font-weight: 600; font-family: JetBrains Mono, monospace; color: #fdfbfe;">${value}</span>
          </div>`
        }
        return result
      },
    },
    legend: {
      show: props.series.length > 1,
      bottom: 0,
      textStyle: {
        color: labelColor,
        fontSize: 11,
      },
      itemWidth: 16,
      itemHeight: 8,
    },
    grid: {
      left: '3%',
      right: '4%',
      top: props.title ? '15%' : '8%',
      bottom: props.series.length > 1 ? '15%' : '8%',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      axisLine: {
        show: true,
        lineStyle: {
          color: gridColor,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: labelColor,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: number) => formatTime(value / 1000),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: gridColor,
          type: 'solid',
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: true,
        lineStyle: {
          color: gridColor,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: labelColor,
        fontSize: 10,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: gridColor,
          type: 'solid',
        },
      },
    },
    series: seriesData,
  }
})

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
  <div class="h-full w-full" :style="{ height: typeof height === 'number' ? `${height}px` : height }">
    <VChart
      ref="chartRef"
      :option="chartOption"
      :autoresize="true"
      class="h-full w-full"
    />
  </div>
</template>
