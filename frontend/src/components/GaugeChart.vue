<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { GaugeChart as EChartsGaugeChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { chartPalette, chartColors } from '../utils/chartTheme'

// Register ECharts components
use([CanvasRenderer, EChartsGaugeChart, TitleComponent, TooltipComponent])

export interface Threshold {
  value: number
  color: string
}

const props = withDefaults(
  defineProps<{
    value: number
    min?: number
    max?: number
    thresholds?: Threshold[]
    unit?: string
    decimals?: number
    title?: string
    height?: string | number
  }>(),
  {
    min: 0,
    max: 100,
    thresholds: () => [],
    unit: '',
    decimals: 2,
    title: '',
    height: '100%',
  },
)

const chartRef = ref<typeof VChart | null>(null)

// Format value with decimals and unit
function formatValue(value: number): string {
  // Handle very large numbers
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(props.decimals)}M${props.unit}`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(props.decimals)}K${props.unit}`
  }
  return `${value.toFixed(props.decimals)}${props.unit}`
}

// Build color stops for gauge based on thresholds
function buildAxisLineColors(): Array<[number, string]> {
  if (!props.thresholds || props.thresholds.length === 0) {
    return [[1, chartPalette[0]]]
  }

  const range = props.max - props.min
  const colors: Array<[number, string]> = []
  const sortedThresholds = [...props.thresholds].sort((a, b) => a.value - b.value)

  // Add segments based on thresholds
  let prevStop = 0
  let prevColor = chartPalette[0]

  for (const threshold of sortedThresholds) {
    const stop = (threshold.value - props.min) / range
    if (stop > prevStop && stop <= 1) {
      colors.push([stop, prevColor])
      prevColor = threshold.color
    }
    prevStop = stop
  }

  // Add final segment
  if (prevStop < 1) {
    colors.push([1, prevColor])
  }

  return colors.length > 0 ? colors : [[1, chartPalette[0]]]
}

// Get color for current value
function getValueColor(): string {
  if (!props.thresholds || props.thresholds.length === 0) {
    return chartPalette[0]
  }

  const sortedThresholds = [...props.thresholds].sort((a, b) => a.value - b.value)

  // Find the highest threshold that is below or equal to the value
  let color = chartPalette[0]
  for (const threshold of sortedThresholds) {
    if (props.value >= threshold.value) {
      color = threshold.color
    }
  }
  return color
}

const chartOption = computed<EChartsOption>(() => {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      backgroundColor: chartColors.tooltipBg,
      borderColor: chartColors.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: chartColors.text,
        fontSize: 12,
      },
      formatter: () => {
        return `<div style="font-weight: 600; font-family: JetBrains Mono, monospace; color: #F3F1EA;">${formatValue(props.value)}</div>`
      },
    },
    series: [
      {
        type: 'gauge',
        center: ['50%', '60%'],
        radius: '90%',
        startAngle: 200,
        endAngle: -20,
        min: props.min,
        max: props.max,
        splitNumber: 5,
        itemStyle: {
          color: getValueColor(),
        },
        progress: {
          show: true,
          width: 20,
          itemStyle: {
            color: getValueColor(),
          },
        },
        pointer: {
          show: true,
          length: '60%',
          width: 6,
          itemStyle: {
            color: '#F3F1EA',
          },
        },
        axisLine: {
          lineStyle: {
            width: 20,
            color: buildAxisLineColors().map(([stop, color]) => [stop, `${color}30`]), // Add transparency
          },
        },
        axisTick: {
          show: true,
          distance: -30,
          lineStyle: {
            color: chartColors.grid,
            width: 1,
          },
        },
        splitLine: {
          show: true,
          distance: -35,
          length: 10,
          lineStyle: {
            color: chartColors.grid,
            width: 2,
          },
        },
        axisLabel: {
          show: true,
          distance: 10,
          color: chartColors.label,
          fontSize: 10,
          formatter: (value: number) => {
            if (Math.abs(value) >= 1000) {
              return `${Math.round(value / 1000)}K`
            }
            return Math.round(value).toString()
          },
        },
        anchor: {
          show: true,
          size: 12,
          itemStyle: {
            color: '#121316',
            borderColor: getValueColor(),
            borderWidth: 3,
          },
        },
        title: {
          show: !!props.title,
          offsetCenter: [0, '80%'],
          color: chartColors.label,
          fontSize: 12,
          fontWeight: 500,
        },
        detail: {
          show: true,
          valueAnimation: true,
          width: '60%',
          lineHeight: 40,
          borderRadius: 8,
          offsetCenter: [0, '35%'],
          fontSize: 24,
          fontWeight: 600,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: () => formatValue(props.value),
          color: '#F3F1EA',
        },
        data: [
          {
            value: props.value,
            name: props.title,
          },
        ],
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
