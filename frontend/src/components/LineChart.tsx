import { LineChart as EChartsLineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { connect, disconnect, init, type ECharts, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useRef } from 'react'
import { chartColors, chartPalette, crosshairPointerStyle } from '@/utils/chartTheme'

use([CanvasRenderer, EChartsLineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

export interface DataPoint {
  timestamp: number
  value: number
}

export interface ChartSeries {
  name: string
  data: DataPoint[]
}

type LineChartProps = {
  series: ChartSeries[]
  title?: string
  height?: string | number
  fill?: 'none' | 'area' | 'stacked-area'
  group?: string
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

function buildChartOption(
  series: ChartSeries[],
  title: string,
  fill: LineChartProps['fill'],
) {
  const gradientAreaStyle = (index: number) => ({
    color: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: `${chartPalette[index % chartPalette.length]}33` },
        { offset: 1, color: `${chartPalette[index % chartPalette.length]}05` },
      ],
    },
  })

  const seriesData = series.map((s, index) => ({
    name: s.name,
    type: 'line' as const,
    smooth: true,
    showSymbol: false,
    lineStyle: {
      width: 2,
      color: chartPalette[index % chartPalette.length],
    },
    itemStyle: {
      color: chartPalette[index % chartPalette.length],
    },
    ...(fill !== 'none' ? { areaStyle: gradientAreaStyle(index) } : {}),
    ...(fill === 'stacked-area' ? { stack: 'total' } : {}),
    data: s.data.map(d => [d.timestamp * 1000, d.value]),
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
      formatter: (params: TooltipParam | TooltipParam[]) => {
        const items = Array.isArray(params) ? params : [params]
        if (items.length === 0) return ''
        const timestamp = items[0].data[0]
        const timeStr = formatFullDateTime(timestamp / 1000)
        let result = `<div style="font-weight: 500; margin-bottom: 6px; color: ${chartColors.label}; font-size: 11px;">${timeStr}</div>`
        for (const param of items) {
          const value =
            typeof param.data[1] === 'number' ? param.data[1].toFixed(4) : param.data[1]
          result += `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: ${param.color}; border-radius: 50%;"></span>
            <span style="color: ${chartColors.label}; font-size: 12px;">${param.seriesName}:</span>
            <span style="font-weight: 600; font-family: JetBrains Mono, monospace; color: #F3F1EA;">${value}</span>
          </div>`
        }
        return result
      },
    },
    legend: {
      show: series.length > 1 && series.length <= 20,
      bottom: 0,
      type: 'scroll',
      textStyle: {
        color: chartColors.label,
        fontSize: 11,
      },
      pageTextStyle: {
        color: chartColors.label,
      },
      pageIconColor: chartColors.label,
      pageIconInactiveColor: chartColors.grid,
      itemWidth: 16,
      itemHeight: 8,
    },
    grid: {
      left: '3%',
      right: '4%',
      top: title ? '15%' : '8%',
      bottom: series.length > 1 && series.length <= 20 ? '15%' : '8%',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      axisLine: {
        show: true,
        lineStyle: {
          color: chartColors.grid,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: chartColors.label,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: number) => formatTime(value / 1000),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: chartColors.grid,
          type: 'solid',
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: true,
        lineStyle: {
          color: chartColors.grid,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: chartColors.label,
        fontSize: 10,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: chartColors.grid,
          type: 'solid',
        },
      },
    },
    series: seriesData,
  }
}

export function LineChart({
  series,
  title = '',
  height = '100%',
  fill = 'area',
  group,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)

  const chartOption = useMemo(() => buildChartOption(series, title, fill), [series, title, fill])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = init(containerRef.current)
    chartRef.current = chart

    if (group) {
      chart.group = group
      connect(group)
    }

    const resizeObserver = new ResizeObserver(() => {
      chart.resize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (group) {
        disconnect(group)
      }
      chart.dispose()
      chartRef.current = null
    }
  }, [group])

  useEffect(() => {
    chartRef.current?.setOption(chartOption, true)
  }, [chartOption])

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className="relative h-full w-full"
      style={{ height: resolvedHeight }}
      data-testid="line-chart"
      data-series-count={series.length}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}