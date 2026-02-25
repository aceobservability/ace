<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart as EChartsBarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'

// Register ECharts components
use([
  CanvasRenderer,
  EChartsBarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
])

interface DataPoint {
  timestamp: number // Unix timestamp in seconds
  value: number
}

interface ChartSeries {
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
  }
)

const chartRef = ref<typeof VChart | null>(null)

// Colors for the chart bars
const barColors = [
  '#F59E0B',
  '#60A5FA',
  '#f59e0b',
  '#fb7185',
  '#22d3ee',
  '#a3e635',
  '#f97316',
  '#D97706',
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
    type: 'bar' as const,
    barMaxWidth: 30,
    itemStyle: {
      color: {
        type: 'linear' as const,
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: barColors[index % barColors.length] },
          { offset: 1, color: `${barColors[index % barColors.length]}88` },
        ],
      },
      borderRadius: [3, 3, 0, 0],
    },
    emphasis: {
      itemStyle: {
        color: barColors[index % barColors.length],
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
            color: '#f5f5f5',
            fontSize: 13,
            fontWeight: 500,
          },
        }
      : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1a1a',
      borderColor: '#2a2a2a',
      borderWidth: 1,
      textStyle: {
        color: '#f5f5f5',
        fontSize: 12,
      },
      formatter: (params: TooltipParam[]) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const timestamp = params[0]!.data![0]
        const timeStr = formatFullDateTime(timestamp / 1000)
        let result = `<div style="font-weight: 500; margin-bottom: 6px; color: #a0a0a0; font-size: 11px;">${timeStr}</div>`
        for (const param of params) {
          const value = typeof param.data[1] === 'number'
            ? param.data[1].toFixed(4)
            : param.data[1]
          result += `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: ${param.color}; border-radius: 2px;"></span>
            <span style="color: #a0a0a0; font-size: 12px;">${param.seriesName}:</span>
            <span style="font-weight: 600; color: #f5f5f5;">${value}</span>
          </div>`
        }
        return result
      },
    },
    legend: {
      show: props.series.length > 1,
      bottom: 0,
      textStyle: {
        color: '#a0a0a0',
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
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: '#666666',
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: number) => formatTime(value / 1000),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#1a1a1a',
          type: 'solid',
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: '#666666',
        fontSize: 10,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#1a1a1a',
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
  <div class="w-full min-h-[200px]" :style="{ height: typeof height === 'number' ? `${height}px` : height }">
    <VChart
      ref="chartRef"
      :option="chartOption"
      :autoresize="true"
      class="w-full h-full"
    />
  </div>
</template>

