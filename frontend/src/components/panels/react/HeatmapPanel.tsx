import { HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { useMemo } from 'react'
import {
  chartAxisStyle,
  chartPalette,
  chartTooltipStyle,
} from '@/utils/chartTheme'
import { useRegistryEChart } from './useRegistryEChart'

use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent])

export type HeatmapDataPoint = {
  x: number | string
  y: number | string
  value: number
}

type HeatmapPanelProps = {
  data: HeatmapDataPoint[]
  xLabels?: string[]
  yLabels?: string[]
  min?: number
  max?: number
}

export function HeatmapPanel({ data, xLabels, yLabels, min, max }: HeatmapPanelProps) {
  const computedMax = max ?? (data.length > 0 ? Math.max(...data.map(d => d.value)) : 0)
  const computedMin = min ?? 0

  const chartOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '8%',
        top: '8%',
        bottom: '8%',
        containLabel: true,
      },
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: chartTooltipStyle.backgroundColor,
        borderColor: chartTooltipStyle.borderColor,
        borderWidth: 1,
        textStyle: chartTooltipStyle.textStyle,
        formatter: (params: { data: [number | string, number | string, number] }) => {
          const [x, y, value] = params.data
          return `x: ${x}<br/>y: ${y}<br/>value: ${value}`
        },
      },
      visualMap: {
        type: 'continuous' as const,
        min: computedMin,
        max: computedMax,
        calculable: true,
        orient: 'horizontal' as const,
        left: 'center',
        bottom: 0,
        inRange: {
          color: [chartPalette[0], chartPalette[1]],
        },
        textStyle: chartAxisStyle.axisLabel,
      },
      xAxis: {
        type: 'category' as const,
        data: xLabels,
        ...chartAxisStyle,
      },
      yAxis: {
        type: 'category' as const,
        data: yLabels,
        ...chartAxisStyle,
      },
      series: [
        {
          type: 'heatmap' as const,
          data: data.map(d => [d.x, d.y, d.value]),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    }),
    [computedMax, computedMin, data, xLabels, yLabels],
  )

  const containerRef = useRegistryEChart(chartOption)

  return (
    <div className="h-full w-full" data-testid="heatmap-panel">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}