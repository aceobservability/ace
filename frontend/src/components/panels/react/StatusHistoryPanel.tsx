import { HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { useMemo } from 'react'
import {
  chartAxisStyle,
  chartPalette,
  chartTooltipStyle,
  thresholdColors,
} from '@/utils/chartTheme'
import { useRegistryEChart } from './useRegistryEChart'

use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent])

export type StatusCell = {
  entity: string
  bucket: string
  state: string
}

const STATE_TO_NUM: Record<string, number> = {
  up: 0,
  healthy: 0,
  ok: 0,
  degraded: 1,
  warning: 1,
  down: 2,
  error: 2,
  critical: 2,
}

function resolveStateColor(state: string, stateColors?: Record<string, string>): string {
  if (stateColors?.[state]) return stateColors[state]
  const normalized = state.toLowerCase()
  if (normalized === 'up' || normalized === 'healthy' || normalized === 'ok') return thresholdColors.good
  if (normalized === 'down' || normalized === 'error' || normalized === 'critical') return thresholdColors.critical
  if (normalized === 'degraded' || normalized === 'warning') return thresholdColors.warning
  return chartPalette[7]
}

function stateToNum(state: string): number {
  return STATE_TO_NUM[state.toLowerCase()] ?? 3
}

type StatusHistoryPanelProps = {
  cells: StatusCell[]
  stateColors?: Record<string, string>
}

export function StatusHistoryPanel({ cells, stateColors }: StatusHistoryPanelProps) {
  const buckets = useMemo(() => {
    const seen = new Set<string>()
    for (const cell of cells) seen.add(cell.bucket)
    return Array.from(seen)
  }, [cells])

  const entities = useMemo(() => {
    const seen = new Set<string>()
    for (const cell of cells) seen.add(cell.entity)
    return Array.from(seen)
  }, [cells])

  const chartOption = useMemo(() => {
    const seriesData = cells.map(cell => [
      buckets.indexOf(cell.bucket),
      entities.indexOf(cell.entity),
      stateToNum(cell.state),
    ])

    const numToStateName = new Map<number, string>()
    for (const cell of cells) {
      const num = stateToNum(cell.state)
      if (!numToStateName.has(num)) numToStateName.set(num, cell.state)
    }

    return {
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '8%',
        top: '8%',
        bottom: '12%',
        containLabel: true,
      },
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: chartTooltipStyle.backgroundColor,
        borderColor: chartTooltipStyle.borderColor,
        borderWidth: 1,
        textStyle: chartTooltipStyle.textStyle,
        formatter: (params: { data: [number, number, number] }) => {
          const [bucketIdx, entityIdx, stateNum] = params.data
          const entity = entities[entityIdx] ?? '?'
          const bucket = buckets[bucketIdx] ?? '?'
          const stateName = numToStateName.get(stateNum) ?? 'unknown'
          return `${entity}<br/>Time: <b>${bucket}</b><br/>State: <b>${stateName}</b>`
        },
      },
      visualMap: {
        type: 'piecewise' as const,
        pieces: [
          { value: 0, label: 'Up', color: resolveStateColor('up', stateColors) },
          { value: 1, label: 'Degraded', color: resolveStateColor('degraded', stateColors) },
          { value: 2, label: 'Down', color: resolveStateColor('down', stateColors) },
          { value: 3, label: 'Unknown', color: chartPalette[7] },
        ],
        orient: 'horizontal' as const,
        left: 'center',
        bottom: 0,
        show: true,
        textStyle: chartAxisStyle.axisLabel,
      },
      xAxis: {
        type: 'category' as const,
        data: buckets,
        ...chartAxisStyle,
      },
      yAxis: {
        type: 'category' as const,
        data: entities,
        ...chartAxisStyle,
      },
      series: [
        {
          type: 'heatmap' as const,
          data: seriesData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    }
  }, [buckets, cells, entities, stateColors])

  const containerRef = useRegistryEChart(chartOption)

  return (
    <div className="h-full w-full" data-testid="status-history-panel">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}