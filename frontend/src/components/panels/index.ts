import {
  BarChart3,
  Bell,
  FileText,
  GaugeCircle,
  Grid3x3,
  ScatterChart as ScatterIcon,
} from 'lucide-vue-next'
import type { RawQueryResult } from '../../types/panel'
import { registerPanel } from '../../utils/panelRegistry'

// Register Text
registerPanel({
  type: 'text',
  component: () => import('./TextPanel.vue'),
  dataAdapter: () => {
    // Text panel doesn't use query data — content comes from panel.query.content
    return { content: '' }
  },
  defaultQuery: { content: '# Hello\n\nEdit this panel to add content.' },
  category: 'widgets',
  label: 'Text',
  icon: FileText,
})

// Register Heatmap
registerPanel({
  type: 'heatmap',
  component: () => import('./HeatmapPanel.vue'),
  dataAdapter: (raw: RawQueryResult) => {
    // Transform time-series data into heatmap format
    // Each series becomes a row (y-axis), each data point is a column (x-axis)
    const data: Array<{ x: number | string; y: number | string; value: number }> = []
    const yLabels: string[] = []

    for (const series of raw.series) {
      yLabels.push(series.name)
      const yIndex = yLabels.length - 1
      const points = series.data as Array<{ timestamp: number; value: number }>
      for (let xIndex = 0; xIndex < points.length; xIndex++) {
        const point = points[xIndex]
        data.push({ x: point.timestamp, y: yIndex, value: point.value })
      }
    }

    return { data, yLabels }
  },
  defaultQuery: {},
  category: 'charts',
  label: 'Heatmap',
  icon: Grid3x3,
})

// Register Bar Gauge
registerPanel({
  type: 'bar_gauge',
  component: () => import('./BarGaugePanel.vue'),
  dataAdapter: (raw: RawQueryResult) => {
    // Each series becomes an item with its latest value
    const items = raw.series.map((s) => {
      const points = s.data as Array<{ timestamp: number; value: number }>
      const latestValue = points.length > 0 ? points[points.length - 1].value : 0
      return { label: s.name, value: latestValue, max: 100 }
    })
    return { items }
  },
  defaultQuery: {},
  category: 'stats',
  label: 'Bar Gauge',
  icon: GaugeCircle,
})

// Register Scatter
registerPanel({
  type: 'scatter',
  component: () => import('./ScatterPanel.vue'),
  dataAdapter: (raw: RawQueryResult) => {
    // Pair first two series as X and Y axes
    // If only one series, plot value vs timestamp
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

    // Single series: plot timestamp vs value
    const points = raw.series[0].data as Array<{ timestamp: number; value: number }>
    return {
      series: [
        {
          name: raw.series[0].name,
          data: points.map((p) => [p.timestamp, p.value] as [number, number]),
        },
      ],
    }
  },
  defaultQuery: {},
  category: 'charts',
  label: 'Scatter',
  icon: ScatterIcon,
})

// Register Alert List
registerPanel({
  type: 'alert_list',
  component: () => import('./AlertListPanel.vue'),
  dataAdapter: () => {
    // Alert list gets data from backend alert API, not from query results
    return { alerts: [] }
  },
  defaultQuery: {},
  category: 'widgets',
  label: 'Alert List',
  icon: Bell,
})

// Register Histogram
registerPanel({
  type: 'histogram',
  component: () => import('./HistogramPanel.vue'),
  dataAdapter: (raw: RawQueryResult) => {
    // Transform series data into histogram buckets
    // Use the first series, treat each data point as a bucket
    if (raw.series.length === 0) return { buckets: [] }
    const firstSeries = raw.series[0]
    const points = firstSeries.data as Array<{ timestamp: number; value: number }>
    const buckets = points.map((p, i) => ({
      label: String(i), // Simple index labels; real implementation would use bucket boundaries
      count: p.value,
    }))
    return { buckets }
  },
  defaultQuery: {},
  category: 'charts',
  label: 'Histogram',
  icon: BarChart3,
})
