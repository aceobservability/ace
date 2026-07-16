import type { RawQueryResult } from '@/types/panel'
import { registerPanel } from '@/utils/panelRegistry'

function lazyIcon(name: 'Grid3x3' | 'GaugeCircle' | 'ScatterChart' | 'BarChart3' | 'CandlestickChart' | 'LayoutGrid') {
  return () =>
    import('lucide-react').then(module => ({
      default: module[name],
    }))
}

registerPanel({
  type: 'heatmap',
  component: () => import('./react/HeatmapPanel').then(module => ({ default: module.HeatmapPanel })),
  dataAdapter: (raw: RawQueryResult) => {
    const data: Array<{ x: number | string; y: number | string; value: number }> = []
    const yLabels: string[] = []

    for (const series of raw.series) {
      yLabels.push(series.name)
      const yIndex = yLabels.length - 1
      const points = series.data as Array<{ timestamp: number; value: number }>
      for (const point of points) {
        data.push({ x: point.timestamp, y: yIndex, value: point.value })
      }
    }

    return { data, yLabels }
  },
  defaultQuery: {},
  category: 'charts',
  label: 'Heatmap',
  icon: lazyIcon('Grid3x3'),
})

registerPanel({
  type: 'bar_gauge',
  component: () => import('./react/BarGaugePanel').then(module => ({ default: module.BarGaugePanel })),
  dataAdapter: (raw: RawQueryResult) => {
    const items = raw.series.map(series => {
      const points = series.data as Array<{ timestamp: number; value: number }>
      const latestValue = points.length > 0 ? points[points.length - 1].value : 0
      const maxValue = points.length > 0 ? Math.max(...points.map(point => point.value), 1) : 100
      return { label: series.name, value: latestValue, max: maxValue }
    })
    return { items }
  },
  defaultQuery: {},
  category: 'stats',
  label: 'Bar Gauge',
  icon: lazyIcon('GaugeCircle'),
})

registerPanel({
  type: 'scatter',
  component: () => import('./react/ScatterPanel').then(module => ({ default: module.ScatterPanel })),
  dataAdapter: (raw: RawQueryResult) => {
    if (raw.series.length === 0) return { series: [] }

    if (raw.series.length >= 2) {
      const xSeries = raw.series[0].data as Array<{ timestamp: number; value: number }>
      const ySeries = raw.series[1].data as Array<{ timestamp: number; value: number }>
      const len = Math.min(xSeries.length, ySeries.length)
      const data: Array<[number, number]> = []
      for (let i = 0; i < len; i++) {
        data.push([xSeries[i].value, ySeries[i].value])
      }
      return {
        series: [{ name: `${raw.series[0].name} vs ${raw.series[1].name}`, data }],
      }
    }

    const points = raw.series[0].data as Array<{ timestamp: number; value: number }>
    return {
      series: [
        {
          name: raw.series[0].name,
          data: points.map(point => [point.timestamp, point.value] as [number, number]),
        },
      ],
    }
  },
  defaultQuery: {},
  category: 'charts',
  label: 'Scatter',
  icon: lazyIcon('ScatterChart'),
})

registerPanel({
  type: 'histogram',
  component: () => import('./react/HistogramPanel').then(module => ({ default: module.HistogramPanel })),
  dataAdapter: (raw: RawQueryResult) => {
    if (raw.series.length === 0) return { buckets: [] }
    const firstSeries = raw.series[0]
    const points = firstSeries.data as Array<{ timestamp: number; value: number }>
    const buckets = points.map((point, index) => ({
      label: String(index),
      count: point.value,
    }))
    return { buckets }
  },
  defaultQuery: {},
  category: 'charts',
  label: 'Histogram',
  icon: lazyIcon('BarChart3'),
})

registerPanel({
  type: 'candlestick',
  component: () => import('./react/CandlestickPanel').then(module => ({ default: module.CandlestickPanel })),
  dataAdapter: (raw: RawQueryResult) => {
    if (raw.series.length < 4) return { data: [] }
    const open = raw.series[0].data as Array<{ timestamp: number; value: number }>
    const close = raw.series[1].data as Array<{ timestamp: number; value: number }>
    const low = raw.series[2].data as Array<{ timestamp: number; value: number }>
    const high = raw.series[3].data as Array<{ timestamp: number; value: number }>
    const len = Math.min(open.length, close.length, low.length, high.length)
    const data: Array<{
      timestamp: number
      open: number
      close: number
      low: number
      high: number
    }> = []
    for (let i = 0; i < len; i++) {
      data.push({
        timestamp: open[i].timestamp,
        open: open[i].value,
        close: close[i].value,
        low: low[i].value,
        high: high[i].value,
      })
    }
    return { data }
  },
  defaultQuery: {},
  category: 'charts',
  label: 'Candlestick',
  icon: lazyIcon('CandlestickChart'),
})

registerPanel({
  type: 'status_history',
  component: () => import('./react/StatusHistoryPanel').then(module => ({ default: module.StatusHistoryPanel })),
  dataAdapter: (raw: RawQueryResult) => {
    const cells: Array<{ entity: string; bucket: string; state: string }> = []
    for (const series of raw.series) {
      const points = series.data as Array<{ timestamp: number; value: number }>
      for (const point of points) {
        const date = new Date(point.timestamp * 1000)
        const bucket = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        const state = point.value > 0.5 ? 'up' : point.value > 0 ? 'degraded' : 'down'
        cells.push({ entity: series.name, bucket, state })
      }
    }
    return { cells }
  },
  defaultQuery: {},
  category: 'observability',
  label: 'Status History',
  icon: lazyIcon('LayoutGrid'),
})