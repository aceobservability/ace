import { BarChart as EChartsBarChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { connect, init, type ECharts, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useRef } from 'react'
import { useCrosshairSync } from '@/contexts/CrosshairSyncContext'
import { chartColors, chartPalette, crosshairPointerStyle } from '@/utils/chartTheme'
import type { ChartSeries } from '@/components/LineChart'

use([CanvasRenderer, EChartsBarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

type BarChartProps = {
  series: ChartSeries[]
  title?: string
  height?: string | number
}

type TooltipParam = {
  data: [number, number | string]
  color: string
  seriesName: string
}

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

function buildChartOption(series: ChartSeries[], title: string) {
  const seriesData = series.map((item, index) => ({
    name: item.name,
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
          { offset: 0, color: chartPalette[index % chartPalette.length] },
          { offset: 1, color: `${chartPalette[index % chartPalette.length]}88` },
        ],
      },
      borderRadius: [3, 3, 0, 0],
    },
    emphasis: {
      itemStyle: {
        color: chartPalette[index % chartPalette.length],
      },
    },
    data: item.data.map(point => [point.timestamp * 1000, point.value]),
  }))

  return {
    backgroundColor: 'transparent',
    title: title
      ? {
          text: title,
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
      trigger: 'axis',
      axisPointer: {
        type: 'line' as const,
        ...crosshairPointerStyle,
      },
      backgroundColor: chartColors.tooltipBg,
      borderColor: chartColors.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: chartColors.text,
        fontSize: 12,
      },
      formatter: (params: TooltipParam[]) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const timestamp = params[0].data[0]
        const timeStr = formatFullDateTime(timestamp / 1000)
        let result = `<div style="font-weight: 500; margin-bottom: 6px; color: ${chartColors.label}; font-size: 11px;">${timeStr}</div>`
        for (const param of params) {
          const value = typeof param.data[1] === 'number' ? param.data[1].toFixed(4) : param.data[1]
          result += `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: ${param.color}; border-radius: 2px;"></span>
            <span style="color: ${chartColors.label}; font-size: 12px;">${param.seriesName}:</span>
            <span style="font-weight: 600; font-family: JetBrains Mono, monospace; color: #F3F1EA;">${value}</span>
          </div>`
        }
        return result
      },
    },
    legend: {
      show: series.length > 1,
      bottom: 0,
      textStyle: {
        color: chartColors.label,
        fontSize: 11,
      },
      itemWidth: 16,
      itemHeight: 8,
    },
    grid: {
      left: '3%',
      right: '4%',
      top: title ? '15%' : '8%',
      bottom: series.length > 1 ? '15%' : '8%',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      axisLine: {
        show: true,
        lineStyle: { color: chartColors.grid },
      },
      axisTick: { show: false },
      axisLabel: {
        color: chartColors.label,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: number) => formatTime(value / 1000),
      },
      splitLine: {
        show: true,
        lineStyle: { color: chartColors.grid, type: 'solid' },
      },
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: true,
        lineStyle: { color: chartColors.grid },
      },
      axisTick: { show: false },
      axisLabel: {
        color: chartColors.label,
        fontSize: 10,
      },
      splitLine: {
        show: true,
        lineStyle: { color: chartColors.grid, type: 'solid' },
      },
    },
    series: seriesData,
  }
}

export function BarChart({ series, title = '', height = '100%' }: BarChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)
  const { groupId } = useCrosshairSync()
  const chartOption = useMemo(() => buildChartOption(series, title), [series, title])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = init(containerRef.current)
    chartRef.current = chart

    if (groupId) {
      chart.group = groupId
      connect(groupId)
    }

    const resizeObserver = new ResizeObserver(() => {
      chart.resize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      // Do not call disconnect(groupId) here: that tears down the whole
      // ECharts connect group. chart.dispose() drops this instance from the
      // group; CrosshairSyncProvider owns group-level teardown.
      resizeObserver.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [groupId])

  useEffect(() => {
    chartRef.current?.setOption(chartOption, true)
  }, [chartOption])

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div className="relative h-full w-full" style={{ height: resolvedHeight }} data-testid="bar-chart">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}