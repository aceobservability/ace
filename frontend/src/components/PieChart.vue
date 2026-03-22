<script setup lang="ts">
import { PieChart as EChartsPieChart } from 'echarts/charts'
import { LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VChart from 'vue-echarts'

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

// Stitch Kinetic palette
const labelColor = '#757578' // outline
const textColor = '#ababad' // on-surface-variant
const tooltipBg = '#2b2c2f' // surface-bright
const tooltipBorder = 'rgba(71,72,74,0.15)'
const surfaceLow = '#121316' // surface-container-low

// Color palette matching the Stitch theme
const pieColors = [
  '#a3a6ff', // primary
  '#69f6b8', // secondary
  '#ffb148', // tertiary
  '#ff6e84', // error
  '#6063ee', // primary-dim
  '#58e7ab', // secondary-dim
  '#e79400', // tertiary-dim
  '#a3a6ff', // wrap
  '#69f6b8',
  '#ffb148',
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
            color: textColor,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'Space Grotesk, Inter, sans-serif',
          },
        }
      : undefined,
    tooltip: {
      trigger: 'item',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: textColor,
        fontSize: 12,
      },
      formatter: (params: PieFormatterParam) => {
        const percent = getPercentage(params.value)
        return `<div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; background: ${params.color || '#a3a6ff'}; border-radius: 50%;"></span>
          <span style="color: ${labelColor};">${params.name}</span>
        </div>
        <div style="margin-top: 4px; font-weight: 600; font-family: JetBrains Mono, monospace; color: #fdfbfe;">
          ${params.value.toLocaleString()} (${percent})
        </div>`
      },
    },
    legend: {
      show: props.showLegend,
      orient: 'horizontal',
      bottom: 0,
      textStyle: {
        color: labelColor,
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
          borderColor: surfaceLow,
          borderWidth: 2,
        },
        label: {
          show: props.showLabels,
          position: 'outside',
          color: labelColor,
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
            color: '#fdfbfe',
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
  <div class="h-full w-full" :style="{ height: typeof height === 'number' ? `${height}px` : height }">
    <VChart ref="chartRef" :option="chartOption" :autoresize="true" class="h-full w-full" />
  </div>
</template>
