import { GaugeChart as EChartsGaugeChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent } from 'echarts/components'
import { init, type ECharts, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useRef } from 'react'
import { chartColors, chartPalette } from '@/utils/chartTheme'

use([CanvasRenderer, EChartsGaugeChart, TitleComponent, TooltipComponent])

export interface Threshold {
  value: number
  color: string
}

type GaugeChartProps = {
  value: number
  min?: number
  max?: number
  thresholds?: Threshold[]
  unit?: string
  decimals?: number
  title?: string
  height?: string | number
}

function formatValue(value: number, decimals: number, unit: string): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}M${unit}`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(decimals)}K${unit}`
  return `${value.toFixed(decimals)}${unit}`
}

function buildAxisLineColors(min: number, max: number, thresholds: Threshold[]): Array<[number, string]> {
  if (thresholds.length === 0) return [[1, chartPalette[0]]]

  const range = max - min
  const colors: Array<[number, string]> = []
  const sorted = [...thresholds].sort((left, right) => left.value - right.value)
  let prevStop = 0
  let prevColor: string = chartPalette[0]

  for (const threshold of sorted) {
    const stop = (threshold.value - min) / range
    if (stop > prevStop && stop <= 1) {
      colors.push([stop, prevColor])
      prevColor = threshold.color
    }
    prevStop = stop
  }

  if (prevStop < 1) colors.push([1, prevColor])
  return colors.length > 0 ? colors : [[1, chartPalette[0]]]
}

function getValueColor(value: number, thresholds: Threshold[]): string {
  if (thresholds.length === 0) return chartPalette[0]
  const sorted = [...thresholds].sort((left, right) => left.value - right.value)
  let color: string = chartPalette[0]
  for (const threshold of sorted) {
    if (value >= threshold.value) color = threshold.color
  }
  return color
}

function buildChartOption({
  value,
  min,
  max,
  thresholds,
  unit,
  decimals,
  title,
}: Required<Pick<GaugeChartProps, 'value' | 'min' | 'max' | 'thresholds' | 'unit' | 'decimals' | 'title'>>) {
  const valueColor = getValueColor(value, thresholds)

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
      formatter: () =>
        `<div style="font-weight: 600; font-family: JetBrains Mono, monospace; color: #F3F1EA;">${formatValue(value, decimals, unit)}</div>`,
    },
    series: [
      {
        type: 'gauge',
        center: ['50%', '60%'],
        radius: '90%',
        startAngle: 200,
        endAngle: -20,
        min,
        max,
        splitNumber: 5,
        itemStyle: { color: valueColor },
        progress: {
          show: true,
          width: 20,
          itemStyle: { color: valueColor },
        },
        pointer: {
          show: true,
          length: '60%',
          width: 6,
          itemStyle: { color: '#F3F1EA' },
        },
        axisLine: {
          lineStyle: {
            width: 20,
            color: buildAxisLineColors(min, max, thresholds).map(([stop, color]) => [stop, `${color}30`]),
          },
        },
        axisTick: {
          show: true,
          distance: -30,
          lineStyle: { color: chartColors.grid, width: 1 },
        },
        splitLine: {
          show: true,
          distance: -35,
          length: 10,
          lineStyle: { color: chartColors.grid, width: 2 },
        },
        axisLabel: {
          show: true,
          distance: 10,
          color: chartColors.label,
          fontSize: 10,
          formatter: (axisValue: number) => {
            if (Math.abs(axisValue) >= 1000) return `${Math.round(axisValue / 1000)}K`
            return Math.round(axisValue).toString()
          },
        },
        anchor: {
          show: true,
          size: 12,
          itemStyle: {
            color: '#121316',
            borderColor: valueColor,
            borderWidth: 3,
          },
        },
        title: {
          show: !!title,
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
          formatter: () => formatValue(value, decimals, unit),
          color: '#F3F1EA',
        },
        data: [{ value, name: title }],
      },
    ],
  }
}

export function GaugeChart({
  value,
  min = 0,
  max = 100,
  thresholds = [],
  unit = '',
  decimals = 2,
  title = '',
  height = '100%',
}: GaugeChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)
  const chartOption = useMemo(
    () => buildChartOption({ value, min, max, thresholds, unit, decimals, title }),
    [decimals, max, min, thresholds, title, unit, value],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const chart = init(containerRef.current)
    chartRef.current = chart

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(chartOption, true)
  }, [chartOption])

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div className="h-full w-full" style={{ height: resolvedHeight }} data-testid="gauge-chart">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}