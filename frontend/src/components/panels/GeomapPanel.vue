<script setup lang="ts">
// Import ECharts scatter chart components for geo coordinate display
import { ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
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
use([CanvasRenderer, ScatterChart, GridComponent, TooltipComponent, VisualMapComponent])

export interface GeoDataPoint {
  lat: number // latitude
  lon: number // longitude
  value: number // metric value
  label?: string // location name
}

const props = defineProps<{
  points: GeoDataPoint[]
  min?: number
  max?: number
}>()

const chartRef = ref<typeof VChart | null>(null)

const computedMax = computed(() => {
  if (props.max !== undefined) return props.max
  if (props.points.length === 0) return 0
  return Math.max(...props.points.map((p) => p.value))
})

const computedMin = computed(() => {
  if (props.min !== undefined) return props.min
  return 0
})

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: {
    left: '5%',
    right: '8%',
    top: '8%',
    bottom: '10%',
    containLabel: true,
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
    formatter: (params: { data: [number, number, number]; name?: string }) => {
      const [lon, lat, value] = params.data
      const point = props.points.find((p) => p.lon === lon && p.lat === lat)
      const locationLabel = point?.label ?? ''
      return [
        locationLabel ? `<strong>${locationLabel}</strong><br/>` : '',
        `Lat: ${lat.toFixed(4)}°<br/>`,
        `Lon: ${lon.toFixed(4)}°<br/>`,
        `Value: ${value}`,
      ].join('')
    },
  },
  visualMap: {
    type: 'continuous' as const,
    min: computedMin.value,
    max: computedMax.value,
    calculable: true,
    orient: 'horizontal' as const,
    left: 'center',
    bottom: 0,
    inRange: {
      color: [chartPalette[0], chartPalette[1]], // Steel Blue → Rust Orange
    },
    textStyle: {
      color: chartAxisStyle.axisLabel.color,
      fontFamily: chartAxisStyle.axisLabel.fontFamily,
      fontSize: chartAxisStyle.axisLabel.fontSize,
    },
  },
  xAxis: {
    type: 'value' as const,
    min: -180,
    max: 180,
    name: 'Longitude',
    nameTextStyle: {
      color: chartAxisStyle.axisLabel.color,
      fontFamily: chartAxisStyle.axisLabel.fontFamily,
      fontSize: chartAxisStyle.axisLabel.fontSize,
    },
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
      formatter: (value: number) => `${value}°`,
    },
    splitLine: {
      lineStyle: {
        color: chartGridStyle.gridColor,
      },
    },
  },
  yAxis: {
    type: 'value' as const,
    min: -90,
    max: 90,
    name: 'Latitude',
    nameTextStyle: {
      color: chartAxisStyle.axisLabel.color,
      fontFamily: chartAxisStyle.axisLabel.fontFamily,
      fontSize: chartAxisStyle.axisLabel.fontSize,
    },
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
      formatter: (value: number) => `${value}°`,
    },
    splitLine: {
      lineStyle: {
        color: chartGridStyle.gridColor,
      },
    },
  },
  series: [
    {
      type: 'scatter' as const,
      // symbolSize scales proportionally: min 8, max 40, based on value/max
      symbolSize: (data: [number, number, number]) => {
        const value = data[2]
        const maxVal = computedMax.value
        if (maxVal === 0) return 8
        const ratio = Math.min(value / maxVal, 1)
        return 8 + (40 - 8) * ratio
      },
      data: props.points.map((p) => [p.lon, p.lat, p.value]),
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
