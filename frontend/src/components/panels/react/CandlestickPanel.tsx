import { CandlestickChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { useMemo } from 'react'
import { useCrosshairSync } from '@/contexts/CrosshairSyncContext'
import {
  chartAxisStyle,
  chartGridStyle,
  chartTooltipStyle,
  thresholdColors,
} from '@/utils/chartTheme'
import { useRegistryEChart } from './useRegistryEChart'

use([CandlestickChart, GridComponent, TooltipComponent])

export type CandlestickDataPoint = {
  timestamp: number
  open: number
  close: number
  low: number
  high: number
}

type CandlestickPanelProps = {
  data: CandlestickDataPoint[]
}

export function CandlestickPanel({ data }: CandlestickPanelProps) {
  const { groupId } = useCrosshairSync()

  const chartOption = useMemo(() => {
    const seriesData = data.map(point => [
      point.timestamp * 1000,
      point.open,
      point.close,
      point.low,
      point.high,
    ])

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
        axisPointer: { type: 'cross' as const },
        backgroundColor: chartTooltipStyle.backgroundColor,
        borderColor: chartTooltipStyle.borderColor,
        borderWidth: 1,
        textStyle: chartTooltipStyle.textStyle,
        formatter: (params: Array<{ data: [number, number, number, number, number] }>) => {
          const point = params[0]
          if (!point) return ''
          const [ts, open, close, low, high] = point.data
          const date = new Date(ts).toLocaleString()
          return [`<b>${date}</b>`, `Open: ${open}`, `Close: ${close}`, `Low: ${low}`, `High: ${high}`].join(
            '<br/>',
          )
        },
      },
      xAxis: {
        type: 'time' as const,
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
          type: 'candlestick' as const,
          data: seriesData,
          itemStyle: {
            color: thresholdColors.good,
            color0: thresholdColors.critical,
            borderColor: thresholdColors.good,
            borderColor0: thresholdColors.critical,
          },
        },
      ],
    }
  }, [data])

  const containerRef = useRegistryEChart(chartOption, { groupId })

  return (
    <div className="h-full w-full" data-testid="candlestick-panel">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}