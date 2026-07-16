import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { useMemo } from 'react'
import {
  chartAxisStyle,
  chartGridStyle,
  chartTooltipStyle,
  getSeriesColor,
} from '@/utils/chartTheme'
import { useRegistryEChart } from './useRegistryEChart'

use([BarChart, GridComponent, TooltipComponent])

type BarGaugeItem = {
  label: string
  value: number
  max?: number
}

type BarGaugePanelProps = {
  items: BarGaugeItem[]
  orientation?: 'horizontal' | 'vertical'
}

export function BarGaugePanel({ items, orientation = 'horizontal' }: BarGaugePanelProps) {
  const isHorizontal = orientation === 'horizontal'
  const categoryLabels = items.map(item => item.label)

  const chartOption = useMemo(() => {
    const axisStyle = {
      axisLine: chartAxisStyle.axisLine,
      axisTick: chartAxisStyle.axisTick,
      axisLabel: chartAxisStyle.axisLabel,
      splitLine: { lineStyle: { color: chartGridStyle.gridColor } },
    }

    const categoryAxis = {
      type: 'category' as const,
      data: categoryLabels,
      ...axisStyle,
    }

    const valueAxis = {
      type: 'value' as const,
      ...axisStyle,
    }

    return {
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '4%',
        top: '8%',
        bottom: '8%',
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: chartTooltipStyle.backgroundColor,
        borderColor: chartTooltipStyle.borderColor,
        borderWidth: 1,
        textStyle: chartTooltipStyle.textStyle,
        formatter: (params: Array<{ name: string; value: number; seriesId?: string }>) => {
          const valueParam = params.find(p => p.seriesId === 'values')
          if (!valueParam) return ''
          const item = items.find(i => i.label === valueParam.name)
          const max = item?.max ?? 100
          return `${valueParam.name}: ${valueParam.value} / ${max}`
        },
      },
      xAxis: [isHorizontal ? valueAxis : categoryAxis],
      yAxis: [isHorizontal ? categoryAxis : valueAxis],
      series: [
        {
          id: 'background',
          type: 'bar' as const,
          barWidth: '60%',
          barGap: '-100%',
          silent: true,
          data: items.map(item => ({
            value: item.max ?? 100,
            itemStyle: { color: chartGridStyle.gridColor },
          })),
        },
        {
          id: 'values',
          type: 'bar' as const,
          barWidth: '60%',
          data: items.map((item, index) => ({
            value: item.value,
            itemStyle: { color: getSeriesColor(index) },
          })),
        },
      ],
    }
  }, [categoryLabels, isHorizontal, items])

  const containerRef = useRegistryEChart(chartOption)

  return (
    <div className="h-full w-full" data-testid="bar-gauge-panel">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}