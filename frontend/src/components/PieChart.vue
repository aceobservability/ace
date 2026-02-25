<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart as EChartsPieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components'

// Register ECharts components
use([CanvasRenderer, EChartsPieChart, TitleComponent, TooltipComponent, LegendComponent])

export interface PieDataItem {
  name: string
  value: number
}

const props = withDefaults(
  defineProps<{
    data: PieDataItem[]
    displayAs?: 'pie' | 'donut'
    showLegend?: boolean
    showLabels?: boolean
    title?: string
    height?: string | number
  }>(),
  {
    displayAs: 'pie',
    showLegend: true,
    showLabels: true,
    title: '',
    height: '100%',
  }
)

const chartRef = ref<typeof VChart | null>(null)

interface PieFormatterParam {
  name: string
  value: number
  color?: string
}

// Color palette matching the dashboard theme
const pieColors = [
  '#F59E0B',
  '#60A5FA',
  '#f59e0b',
  '#fb7185',
  '#22d3ee',
  '#a3e635',
  '#f97316',
  '#D97706',
  '#14b8a6',
  '#eab308',
]

// Calculate total for percentage display
const total = computed(() => props.data.reduce((sum, item) => sum + item.value, 0))

// Calculate percentage for a value
function getPercentage(value: number): string {
  if (total.value === 0) return '0%'
  return `${((value / total.value) * 100).toFixed(1)}%`
}

const chartOption = computed(() => {
  const radius = props.displayAs === 'donut' ? ['40%', '70%'] : [0, '70%']

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
      trigger: 'item',
      backgroundColor: '#1a1a1a',
      borderColor: '#2a2a2a',
      borderWidth: 1,
      textStyle: {
        color: '#f5f5f5',
        fontSize: 12,
      },
      formatter: (params: PieFormatterParam) => {
        const percent = getPercentage(params.value)
        return `<div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; background: ${params.color || '#F59E0B'}; border-radius: 50%;"></span>
          <span style="color: #a0a0a0;">${params.name}</span>
        </div>
        <div style="margin-top: 4px; font-weight: 600;">
          ${params.value.toLocaleString()} (${percent})
        </div>`
      },
    },
    legend: {
      show: props.showLegend,
      orient: 'horizontal',
      bottom: 0,
      textStyle: {
        color: '#a0a0a0',
        fontSize: 11,
      },
      itemWidth: 12,
      itemHeight: 12,
    },
    series: [
      {
        type: 'pie',
        radius,
        center: ['50%', props.showLegend ? '45%' : '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#1a1a1a',
          borderWidth: 2,
        },
        label: {
          show: props.showLabels,
          position: 'outside',
          color: '#a0a0a0',
          fontSize: 11,
          formatter: (params: PieFormatterParam) => {
            const percent = getPercentage(params.value)
            return `${params.name}\n${percent}`
          },
        },
        labelLine: {
          show: props.showLabels,
          lineStyle: {
            color: '#444444',
          },
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 600,
            color: '#f5f5f5',
          },
        },
        data: props.data.map((item, index) => ({
          ...item,
          itemStyle: {
            color: pieColors[index % pieColors.length],
          },
        })),
      },
    ],
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
    <VChart ref="chartRef" :option="chartOption" :autoresize="true" class="w-full h-full" />
  </div>
</template>

