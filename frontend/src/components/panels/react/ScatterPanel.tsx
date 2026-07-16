import { ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { useMemo } from 'react'
import {
  chartAxisStyle,
  chartGridStyle,
  chartLegendStyle,
  chartTooltipStyle,
  getSeriesColor,
} from '@/utils/chartTheme'
import { useRegistryEChart } from './useRegistryEChart'

use([ScatterChart, GridComponent, TooltipComponent, LegendComponent])

type ScatterSeries = {
  name: string
  data: Array<[number, number]>
}

type ScatterPanelProps = {
  series: ScatterSeries[]
}

export function ScatterPanel({ series }: ScatterPanelProps) {
  const showLegend = series.length > 1

  const chartOption = useMemo(() => {
    const axisStyle = {
      type: 'value' as const,
      axisLine: chartAxisStyle.axisLine,
      axisTick: chartAxisStyle.axisTick,
      axisLabel: chartAxisStyle.axisLabel,
      splitLine: { lineStyle: { color: chartGridStyle.gridColor } },
    }

    return {
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '4%',
        top: showLegend ? '12%' : '8%',
        bottom: '8%',
        containLabel: true,
      },
      legend: {
        show: showLegend,
        textStyle: chartLegendStyle.textStyle,
      },
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: chartTooltipStyle.backgroundColor,
        borderColor: chartTooltipStyle.borderColor,
        borderWidth: 1,
        textStyle: chartTooltipStyle.textStyle,
        formatter: (params: { seriesName: string; value: [number, number] }) =>
          `${params.seriesName}<br/>x: ${params.value[0]}<br/>y: ${params.value[1]}`,
      },
      xAxis: axisStyle,
      yAxis: axisStyle,
      series: series.map((item, index) => ({
        name: item.name,
        type: 'scatter' as const,
        symbolSize: 8,
        data: item.data,
        itemStyle: { color: getSeriesColor(index) },
      })),
    }
  }, [series, showLegend])

  const containerRef = useRegistryEChart(chartOption)

  return (
    <div className="h-full w-full" data-testid="scatter-panel">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}