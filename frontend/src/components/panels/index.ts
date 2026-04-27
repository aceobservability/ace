import {
  BarChart3,
  Bell,
  CandlestickChart as CandlestickIcon,
  FileText,
  Flame,
  GanttChart,
  GaugeCircle,
  GitBranch,
  Globe,
  Grid3x3,
  LayoutDashboard,
  LayoutGrid,
  Network,
  PenTool,
  ScatterChart as ScatterIcon,
  StickyNote,
} from 'lucide-vue-next'
import type { RawQueryResult } from '../../types/panel'
import { registerPanel } from '../../utils/panelRegistry'

// Register Text
registerPanel({
  type: 'text',
  component: () => import('./TextPanel.vue'),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    return { content: typeof query?.content === 'string' ? query.content : '' }
  },
  defaultQuery: { content: '# Hello\n\nEdit this panel to add content.' },
  category: 'widgets',
  label: 'Text',
  icon: FileText,
  queryMode: 'none',
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
      for (const point of points) {
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
      const maxValue = points.length > 0 ? Math.max(...points.map((p) => p.value), 1) : 100
      return { label: s.name, value: latestValue, max: maxValue }
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
  dataAdapter: () => ({ alerts: [] }),
  defaultQuery: {},
  category: 'widgets',
  label: 'Alert List',
  icon: Bell,
  queryMode: 'none',
  supportStatus: 'setup_required',
  emptyState: {
    title: 'Alert list not connected',
    description:
      'This panel is waiting on alert API wiring. Use the Alerts page with VMAlert or Alertmanager datasources for live alerts.',
    actionLabel: 'Open Alerts',
  },
})

// Register State Timeline
registerPanel({
  type: 'state_timeline',
  component: () => import('./StateTimelinePanel.vue'),
  dataAdapter: (raw: RawQueryResult) => {
    // Transform metric series into state segments
    // Each series = one entity, value thresholds determine state
    const segments: Array<{ entity: string; state: string; start: number; end: number }> = []
    for (const series of raw.series) {
      const points = series.data as Array<{ timestamp: number; value: number }>
      if (points.length === 0) continue
      let currentState = points[0].value > 0 ? 'up' : 'down'
      let segStart = points[0].timestamp
      for (let i = 1; i < points.length; i++) {
        const newState = points[i].value > 0 ? 'up' : 'down'
        if (newState !== currentState) {
          segments.push({
            entity: series.name,
            state: currentState,
            start: segStart,
            end: points[i].timestamp,
          })
          currentState = newState
          segStart = points[i].timestamp
        }
      }
      // Close final segment
      segments.push({
        entity: series.name,
        state: currentState,
        start: segStart,
        end: points[points.length - 1].timestamp,
      })
    }
    return { segments }
  },
  defaultQuery: {},
  category: 'observability',
  label: 'State Timeline',
  icon: GanttChart,
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

// Register Status History
registerPanel({
  type: 'status_history',
  component: () => import('./StatusHistoryPanel.vue'),
  dataAdapter: (raw: RawQueryResult) => {
    // Transform series into status cells
    // Each series = entity, each data point = time bucket
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
  icon: LayoutGrid,
})

// Register Flame Graph
registerPanel({
  type: 'flame_graph',
  component: () => import('./FlameGraphPanel.vue'),
  dataAdapter: () => ({
    root: { name: 'root', value: 0, children: [] },
    unit: 'ms',
  }),
  defaultQuery: {},
  category: 'observability',
  label: 'Flame Graph',
  icon: Flame,
  queryMode: 'none',
  supportStatus: 'unsupported',
  emptyState: {
    title: 'Flame graph requires profiling data',
    description:
      'Trace queries are available, but profiling-to-flamegraph conversion is not wired yet. Use Trace List or Trace Detail for live trace data.',
    actionLabel: 'Use a trace panel',
  },
})

// Register Node Graph
registerPanel({
  type: 'node_graph',
  component: () => import('./NodeGraphPanel.vue'),
  dataAdapter: () => ({ nodes: [], edges: [] }),
  defaultQuery: {},
  category: 'observability',
  label: 'Node Graph',
  icon: Network,
  queryMode: 'traces',
  supportStatus: 'setup_required',
  emptyState: {
    title: 'Service graph not connected',
    description:
      'This panel needs backend service-graph wiring before it can render topology. Use Traces Explore for live trace search today.',
    actionLabel: 'Open Traces Explore',
  },
})

// Register Candlestick
registerPanel({
  type: 'candlestick',
  component: () => import('./CandlestickPanel.vue'),
  dataAdapter: (raw: RawQueryResult) => {
    // Transform 4 series (open, close, low, high) into candlestick points
    if (raw.series.length < 4) return { data: [] }
    const open = raw.series[0].data as Array<{ timestamp: number; value: number }>
    const close = raw.series[1].data as Array<{ timestamp: number; value: number }>
    const low = raw.series[2].data as Array<{ timestamp: number; value: number }>
    const high = raw.series[3].data as Array<{ timestamp: number; value: number }>
    const len = Math.min(open.length, close.length, low.length, high.length)
    const data: Array<{ timestamp: number; open: number; close: number; low: number; high: number }> = []
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
  icon: CandlestickIcon,
})

// Register Trace Detail
registerPanel({
  type: 'trace_detail',
  component: () => import('./TraceDetailPanel.vue'),
  dataAdapter: (raw: RawQueryResult) => ({
    spans: (raw.traces || []).map((span) => {
      const traceSpan = span as {
        spanId?: string
        parentSpanId?: string
        operationName?: string
        serviceName?: string
        startTimeUnixNano?: number
        durationNano?: number
        status?: string
        tags?: Record<string, string>
      }
      return {
        spanId: traceSpan.spanId || 'unknown-span',
        parentSpanId: traceSpan.parentSpanId,
        operationName: traceSpan.operationName || 'unknown operation',
        serviceName: traceSpan.serviceName || 'unknown service',
        startTime: Math.floor((traceSpan.startTimeUnixNano || 0) / 1000),
        duration: Math.max(0, Math.floor((traceSpan.durationNano || 0) / 1000)),
        status: traceSpan.status === 'error' ? ('error' as const) : ('ok' as const),
        tags: traceSpan.tags,
      }
    }),
  }),
  defaultQuery: {},
  category: 'observability',
  label: 'Trace Detail',
  icon: GitBranch,
  queryMode: 'traces',
  supportStatus: 'setup_required',
  emptyState: {
    title: 'Run a trace query to populate detail',
    description:
      'This panel renders trace spans when a trace datasource query returns span data. It will not show sample spans.',
    actionLabel: 'Configure trace query',
  },
})

// Register Annotation List
registerPanel({
  type: 'annotation_list',
  component: () => import('./AnnotationListPanel.vue'),
  dataAdapter: () => ({ annotations: [] }),
  defaultQuery: {},
  category: 'widgets',
  label: 'Annotation List',
  icon: StickyNote,
  queryMode: 'none',
  supportStatus: 'unsupported',
  emptyState: {
    title: 'Annotations are not connected',
    description:
      'Annotation storage is not available in the backend yet. This panel intentionally stays empty instead of showing demo notes.',
    actionLabel: 'Await annotation API',
  },
})

// Register Dashboard List
registerPanel({
  type: 'dashboard_list',
  component: () => import('./DashboardListPanel.vue'),
  dataAdapter: () => ({ dashboards: [] }),
  defaultQuery: {},
  category: 'widgets',
  label: 'Dashboard List',
  icon: LayoutDashboard,
  queryMode: 'none',
  supportStatus: 'setup_required',
  emptyState: {
    title: 'Dashboard list not connected',
    description:
      'Dashboard APIs exist, but this embeddable list panel has not been wired to an organization yet. Use the Dashboards page for live dashboard lists.',
    actionLabel: 'Open Dashboards',
  },
})

// Register Geomap
registerPanel({
  type: 'geomap',
  component: () => import('./GeomapPanel.vue'),
  dataAdapter: () => ({ points: [] }),
  defaultQuery: {},
  category: 'charts',
  label: 'Geomap',
  icon: Globe,
  queryMode: 'none',
  supportStatus: 'unsupported',
  emptyState: {
    title: 'Geomap requires location fields',
    description:
      'Ace does not infer geographic points from generic metrics yet. Configure a future geo-aware query before using this panel.',
    actionLabel: 'Use another chart',
  },
})

// Register Canvas (Excalidraw whiteboard)
registerPanel({
  type: 'canvas',
  component: () => import('./CanvasPanel.vue'),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    // Canvas data stored in panel.query.canvasData
    const canvasData = query?.canvasData as { elements?: unknown[]; appState?: unknown } | undefined
    return {
      data: {
        elements: canvasData?.elements ?? [],
        appState: canvasData?.appState ?? {},
      },
    }
  },
  defaultQuery: { canvasData: { elements: [], appState: {} } },
  category: 'widgets',
  label: 'Canvas',
  icon: PenTool,
  queryMode: 'none',
})
