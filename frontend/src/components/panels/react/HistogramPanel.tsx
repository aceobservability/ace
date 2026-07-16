import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { useMemo } from 'react'
import {
  chartAxisStyle,
  chartGridStyle,
  chartPalette,
  chartTooltipStyle,
} from '@/utils/chartTheme'
import { useRegistryEChart } from './useRegistryEChart'

use([BarChart, GridComponent, TooltipComponent])

type HistogramBucket = {
  label: string
  count: number
}

type HistogramPanelProps = {
  buckets: HistogramBucket[]
  color?: string
}

export function HistogramPanel({ buckets, color }: HistogramPanelProps) {
  const barColor = color ?? chartPalette[0]

  const chartOption = useMemo(
    () => ({
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
        formatter: (params: Array<{ name: string; value: number }>) => {
          const point = params[0]
          return `${point.name}: ${point.value}`
        },
      },
      xAxis: {
        type: 'category' as const,
        data: buckets.map(bucket => bucket.label),
        ...chartAxisStyle,
        splitLine: { lineStyle: { color: chartGridStyle.gridColor } },
      },
      yAxis: {
        type: 'value' as const,
        ...chartAxisStyle,
        splitLine: { lineStyle: { color: chartGridStyle.gridColor } },
      },
      series: [
        {
          type: 'bar' as const,
          barWidth: '90%',
          data: buckets.map(bucket => bucket.count),
          itemStyle: { color: barColor },
        },
      ],
    }),
    [barColor, buckets],
  )

  const containerRef = useRegistryEChart(chartOption)

  return (
    <div className="h-full w-full" data-testid="histogram-panel">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}