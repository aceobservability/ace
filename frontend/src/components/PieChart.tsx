import { PieChart as EChartsPieChart } from 'echarts/charts'
import { LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { init, type ECharts, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useMemo, useRef } from 'react'
import { chartColors, chartPalette } from '@/utils/chartTheme'

use([CanvasRenderer, EChartsPieChart, TitleComponent, TooltipComponent, LegendComponent])

export interface PieDataItem {
  name: string
  value: number
}

type PieChartProps = {
  data: PieDataItem[]
  displayAs?: 'pie' | 'donut'
  showLegend?: boolean
  showLabels?: boolean
  title?: string
  height?: string | number
}

type PieFormatterParam = {
  name: string
  value: number
  color?: string
}

function getPercentage(value: number, total: number): string {
  if (total === 0) return '0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

function buildChartOption({
  data,
  displayAs,
  showLegend,
  showLabels,
  title,
}: Required<Pick<PieChartProps, 'data' | 'displayAs' | 'showLegend' | 'showLabels' | 'title'>>) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const radius = displayAs === 'donut' ? ['40%', '70%'] : [0, '70%']

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
      trigger: 'item',
      backgroundColor: chartColors.tooltipBg,
      borderColor: chartColors.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: chartColors.text,
        fontSize: 12,
      },
      formatter: (params: PieFormatterParam) => {
        const percent = getPercentage(params.value, total)
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
      show: showLegend,
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
        center: ['50%', showLegend ? '45%' : '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: chartColors.surface,
          borderWidth: 2,
        },
        label: {
          show: showLabels,
          position: 'outside',
          color: chartColors.label,
          fontSize: 11,
          formatter: (params: PieFormatterParam) => {
            const percent = getPercentage(params.value, total)
            return `${params.name}\n${percent}`
          },
        },
        labelLine: {
          show: showLabels,
          lineStyle: { color: 'rgba(71,72,74,0.3)' },
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
        data: data.map((item, index) => ({
          ...item,
          itemStyle: { color: chartPalette[index % chartPalette.length] },
        })),
      },
    ],
  }
}

export function PieChart({
  data,
  displayAs = 'pie',
  showLegend = true,
  showLabels = true,
  title = '',
  height = '100%',
}: PieChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)
  const chartOption = useMemo(
    () => buildChartOption({ data, displayAs, showLegend, showLabels, title }),
    [data, displayAs, showLegend, showLabels, title],
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
    <div className="h-full w-full" style={{ height: resolvedHeight }} data-testid="pie-chart">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}