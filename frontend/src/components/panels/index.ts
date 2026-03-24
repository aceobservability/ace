import { BarChart3, Grid3x3 } from 'lucide-vue-next'
import type { RawQueryResult } from '../../types/panel'
import { registerPanel } from '../../utils/panelRegistry'

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
