import { LineChart as EChartsLineChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import { init, type ECharts, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

use([CanvasRenderer, EChartsLineChart, GridComponent])

export interface Threshold {
  value: number
  color: string
  background?: string
}

export interface DataPoint {
  timestamp: number
  value: number
}

type StatPanelProps = {
  value: number
  previousValue?: number
  data?: DataPoint[]
  label?: string
  unit?: string
  decimals?: number
  thresholds?: Threshold[]
  showTrend?: boolean
  showSparkline?: boolean
  height?: string | number
}

function formatValue(value: number, decimals: number, unit: string): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(decimals)}B${unit}`
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(decimals)}M${unit}`
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(decimals)}K${unit}`
  }
  return `${value.toFixed(decimals)}${unit}`
}

function resolveThresholdColor(value: number, thresholds: Threshold[]): string {
  if (thresholds.length === 0) return '#F3F1EA'
  const sorted = [...thresholds].sort((a, b) => a.value - b.value)
  let color = '#F3F1EA'
  for (const threshold of sorted) {
    if (value >= threshold.value) color = threshold.color
  }
  return color
}

function resolveThresholdBackground(value: number, thresholds: Threshold[]): string {
  if (thresholds.length === 0) return 'transparent'
  const sorted = [...thresholds].sort((a, b) => a.value - b.value)
  let background = 'transparent'
  for (const threshold of sorted) {
    if (value >= threshold.value && threshold.background) {
      background = threshold.background
    }
  }
  return background
}

export function StatPanel({
  value,
  previousValue,
  data = [],
  label = '',
  unit = '',
  decimals = 2,
  thresholds = [],
  showTrend = true,
  showSparkline = true,
  height = '100%',
}: StatPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  const valueColor = useMemo(
    () => resolveThresholdColor(value, thresholds),
    [thresholds, value],
  )
  const backgroundColor = useMemo(
    () => resolveThresholdBackground(value, thresholds),
    [thresholds, value],
  )

  const trend = useMemo(() => {
    if (previousValue === undefined || previousValue === null) return 'neutral'
    if (value > previousValue) return 'up'
    if (value < previousValue) return 'down'
    return 'neutral'
  }, [previousValue, value])

  const trendPercentage = useMemo(() => {
    if (previousValue === undefined || previousValue === null || previousValue === 0) {
      return null
    }
    const change = ((value - previousValue) / Math.abs(previousValue)) * 100
    return change.toFixed(1)
  }, [previousValue, value])

  useEffect(() => {
    if (!showSparkline || data.length === 0 || !containerRef.current) {
      chartRef.current?.dispose()
      chartRef.current = null
      return
    }

    const host = containerRef.current
    if (!chartRef.current) {
      chartRef.current = init(host)
    }

    chartRef.current.setOption({
      backgroundColor: 'transparent',
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      xAxis: {
        type: 'category',
        show: false,
        data: data.map(point => point.timestamp),
      },
      yAxis: {
        type: 'value',
        show: false,
        min: 'dataMin',
        max: 'dataMax',
      },
      series: [
        {
          type: 'line',
          data: data.map(point => point.value),
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: valueColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${valueColor}40` },
                { offset: 1, color: `${valueColor}05` },
              ],
            },
          },
        },
      ],
    })

    const observer = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
    }
  }, [data, showSparkline, valueColor])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-sm p-4"
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        backgroundColor,
      }}
      data-testid="stat-panel"
    >
      <div className="z-10 flex flex-col items-center gap-1">
        <div
          className="text-center font-mono text-3xl font-bold leading-tight tabular-nums"
          style={{ color: valueColor }}
        >
          {formatValue(value, decimals, '')}
          {unit ? (
            <span className="ml-1 text-lg font-medium" style={{ color: 'var(--color-outline)' }}>
              {unit}
            </span>
          ) : null}
        </div>

        {label ? (
          <div
            className="mt-1 max-w-full truncate text-sm"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            {label}
          </div>
        ) : null}

        {showTrend && trend !== 'neutral' ? (
          <div
            className="mt-1 flex items-center gap-1 text-xs font-medium"
            style={{
              color: trend === 'up' ? 'var(--color-secondary)' : 'var(--color-error)',
            }}
          >
            {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {trendPercentage ? (
              <span className="tabular-nums">
                {trend === 'up' ? '+' : ''}
                {trendPercentage}%
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {showSparkline && data.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 opacity-50">
          <div ref={containerRef} className="h-full w-full" />
        </div>
      ) : null}
    </div>
  )
}
