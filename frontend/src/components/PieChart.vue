<script setup lang="ts">
import { PieChart as EChartsPieChart } from 'echarts/charts'
import { LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { chartPalette, chartColors } from '../utils/chartTheme'

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
  },
)

const chartRef = ref<typeof VChart | null>(null)

interface PieFormatterParam {
  name: string
  value: number
  color?: string
}

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
            color: chartColors.text,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: chartColors.fontDisplay,
          },
        }
      : undefined,
    tooltip: {
      trigger: 'item',
      backgroundColor: chartColors.tooltipBg,
      borderColor: chartColors.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: chartColors.text,
        fontSize: 12,
      },
      formatter: (params: PieFormatterParam) => {
        const percent = getPercentage(params.value)
        return `<div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; background: ${params.color || chartPalette[0]}; border-radius: 50%;"></span>
          <span style="color: ${chartColors.label};">${params.name}</span>
        </div>
        <div style="margin-top: 4px; font-weight: 600; font-family: ${chartColors.fontMono}; color: #F3F1EA;">
          ${params.value.toLocaleString()} (${percent})
        </div>`
      },
    },
    legend: {
      show: props.showLegend,
      orient: 'horizontal',
      bottom: 0,
      textStyle: {
        color: chartColors.label,
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
          borderColor: chartColors.surface,
          borderWidth: 2,
        },
        label: {
          show: props.showLabels,
          position: 'outside',
          color: chartColors.label,
          fontSize: 11,
          formatter: (params: PieFormatterParam) => {
            const percent = getPercentage(params.value)
            return `${params.name}\n${percent}`
          },
        },
        labelLine: {
          show: props.showLabels,
          lineStyle: {
            color: 'rgba(71,72,74,0.3)',
          },
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.3)',
          },
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 600,
            color: '#F3F1EA',
          },
        },
        data: props.data.map((item, index) => ({
          ...item,
          itemStyle: {
            color: chartPalette[index % chartPalette.length],
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
  <div class="h-full w-full" :style="{ height: typeof height === 'number' ? `${height}px` : height }">
    <VChart ref="chartRef" :option="chartOption" :autoresize="true" class="h-full w-full" />
  </div>
</template>
