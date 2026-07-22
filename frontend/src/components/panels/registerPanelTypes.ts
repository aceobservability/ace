/**
 * Registers panel type metadata used by the panel editor type picker.
 * Component loaders are stubs — live rendering of registry panels is a separate concern.
 */
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
} from 'lucide-react'
import type { RawQueryResult } from '@/types/panel'
import { isRegisteredPanel, registerPanel } from '@/utils/panelRegistry'

const stubComponent = () => Promise.resolve({ default: () => null })
const iconLoader = (icon: unknown) => () => Promise.resolve(icon)

function ensureRegistered(
  registration: Parameters<typeof registerPanel>[0],
): void {
  if (isRegisteredPanel(registration.type)) return
  registerPanel(registration)
}

/** Idempotent: safe after clearRegistry() and across repeated mounts. */
export function ensurePanelTypesRegistered(): void {
  ensureRegistered({
    type: 'text',
    component: stubComponent,
    dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => ({
      content: typeof query?.content === 'string' ? query.content : '',
    }),
    defaultQuery: { content: '# Hello\n\nEdit this panel to add content.' },
    category: 'widgets',
    label: 'Text',
    icon: iconLoader(FileText),
    queryMode: 'none',
  })

  ensureRegistered({
    type: 'heatmap',
    component: stubComponent,
    dataAdapter: () => ({ data: [], yLabels: [] }),
    defaultQuery: {},
    category: 'charts',
    label: 'Heatmap',
    icon: iconLoader(Grid3x3),
  })

  ensureRegistered({
    type: 'bar_gauge',
    component: stubComponent,
    dataAdapter: () => ({ items: [] }),
    defaultQuery: {},
    category: 'stats',
    label: 'Bar Gauge',
    icon: iconLoader(GaugeCircle),
  })

  ensureRegistered({
    type: 'scatter',
    component: stubComponent,
    dataAdapter: () => ({ series: [] }),
    defaultQuery: {},
    category: 'charts',
    label: 'Scatter',
    icon: iconLoader(ScatterIcon),
  })

  ensureRegistered({
    type: 'alert_list',
    component: stubComponent,
    dataAdapter: () => ({ alerts: [] }),
    defaultQuery: {},
    category: 'widgets',
    label: 'Alert List',
    icon: iconLoader(Bell),
    queryMode: 'none',
    supportStatus: 'setup_required',
    emptyState: {
      title: 'Alert list not connected',
      description:
        'This panel is waiting on alert API wiring. Use the Alerts page with VMAlert or Alertmanager datasources for live alerts.',
      actionLabel: 'Open Alerts',
    },
  })

  ensureRegistered({
    type: 'state_timeline',
    component: stubComponent,
    dataAdapter: () => ({ segments: [] }),
    defaultQuery: {},
    category: 'observability',
    label: 'State Timeline',
    icon: iconLoader(GanttChart),
  })

  ensureRegistered({
    type: 'histogram',
    component: stubComponent,
    dataAdapter: () => ({ buckets: [] }),
    defaultQuery: {},
    category: 'charts',
    label: 'Histogram',
    icon: iconLoader(BarChart3),
  })

  ensureRegistered({
    type: 'status_history',
    component: stubComponent,
    dataAdapter: () => ({ cells: [] }),
    defaultQuery: {},
    category: 'observability',
    label: 'Status History',
    icon: iconLoader(LayoutGrid),
  })

  ensureRegistered({
    type: 'flame_graph',
    component: stubComponent,
    dataAdapter: () => ({
      root: { name: 'root', value: 0, children: [] },
      unit: 'ms',
    }),
    defaultQuery: {},
    category: 'observability',
    label: 'Flame Graph',
    icon: iconLoader(Flame),
    queryMode: 'none',
    supportStatus: 'unsupported',
    emptyState: {
      title: 'Flame graph requires profiling data',
      description:
        'Trace queries are available, but profiling-to-flamegraph conversion is not wired yet. Use Trace List or Trace Detail for live trace data.',
      actionLabel: 'Use a trace panel',
    },
  })

  ensureRegistered({
    type: 'node_graph',
    component: stubComponent,
    dataAdapter: () => ({ nodes: [], edges: [] }),
    defaultQuery: {},
    category: 'observability',
    label: 'Node Graph',
    icon: iconLoader(Network),
    queryMode: 'traces',
    supportStatus: 'setup_required',
    emptyState: {
      title: 'Service graph not connected',
      description:
        'This panel needs backend service-graph wiring before it can render topology. Use Traces Explore for live trace search today.',
      actionLabel: 'Open Traces Explore',
    },
  })

  ensureRegistered({
    type: 'candlestick',
    component: stubComponent,
    dataAdapter: () => ({ data: [] }),
    defaultQuery: {},
    category: 'charts',
    label: 'Candlestick',
    icon: iconLoader(CandlestickIcon),
  })

  ensureRegistered({
    type: 'trace_detail',
    component: stubComponent,
    dataAdapter: () => ({ spans: [] }),
    defaultQuery: {},
    category: 'observability',
    label: 'Trace Detail',
    icon: iconLoader(GitBranch),
    queryMode: 'traces',
    supportStatus: 'setup_required',
    emptyState: {
      title: 'Run a trace query to populate detail',
      description:
        'This panel renders trace spans when a trace datasource query returns span data. It will not show sample spans.',
      actionLabel: 'Configure trace query',
    },
  })

  ensureRegistered({
    type: 'annotation_list',
    component: stubComponent,
    dataAdapter: () => ({ annotations: [] }),
    defaultQuery: {},
    category: 'widgets',
    label: 'Annotation List',
    icon: iconLoader(StickyNote),
    queryMode: 'none',
    supportStatus: 'unsupported',
    emptyState: {
      title: 'Annotations are not connected',
      description:
        'Annotation storage is not available in the backend yet. This panel intentionally stays empty instead of showing demo notes.',
      actionLabel: 'Await annotation API',
    },
  })

  ensureRegistered({
    type: 'dashboard_list',
    component: stubComponent,
    dataAdapter: () => ({ dashboards: [] }),
    defaultQuery: {},
    category: 'widgets',
    label: 'Dashboard List',
    icon: iconLoader(LayoutDashboard),
    queryMode: 'none',
    supportStatus: 'setup_required',
    emptyState: {
      title: 'Dashboard list not connected',
      description:
        'Dashboard APIs exist, but this embeddable list panel has not been wired to an organization yet. Use the Dashboards page for live dashboard lists.',
      actionLabel: 'Open Dashboards',
    },
  })

  ensureRegistered({
    type: 'geomap',
    component: stubComponent,
    dataAdapter: () => ({ points: [] }),
    defaultQuery: {},
    category: 'charts',
    label: 'Geomap',
    icon: iconLoader(Globe),
    queryMode: 'none',
    supportStatus: 'unsupported',
    emptyState: {
      title: 'Geomap requires location fields',
      description:
        'Ace does not infer geographic points from generic metrics yet. Configure a future geo-aware query before using this panel.',
      actionLabel: 'Use another chart',
    },
  })

  ensureRegistered({
    type: 'canvas',
    component: stubComponent,
    dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
      const canvasData = query?.canvasData as
        | { elements?: unknown[]; appState?: unknown }
        | undefined
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
    icon: iconLoader(PenTool),
    queryMode: 'none',
  })
}
