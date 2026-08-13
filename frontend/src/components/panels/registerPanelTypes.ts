/**
 * Registers panel type metadata used by the panel editor type picker.
 *
 * React `Panel` only fully renders Core builtins + the `text` widget today.
 * Other registry entries keep metadata for edit/import parity, but are
 * marked `unsupported` / `setup_required` so the picker and grid never imply a
 * live React renderer exists.
 */
import { isRegisteredPanel, registerPanel } from '@/utils/panelRegistry'

/** Shared empty state for registry types that still need a React panel port. */
function pendingReactRendererEmptyState(label: string) {
  return {
    title: `${label} renderer not available yet`,
    description:
      'This panel type can be saved for edit/import parity, but the dashboard grid does not render it yet. Use a Core panel type for live content.',
    actionLabel: 'Use a Core panel',
  }
}

function ensureRegistered(registration: Parameters<typeof registerPanel>[0]): void {
  if (isRegisteredPanel(registration.type)) return
  registerPanel(registration)
}

/** Idempotent: safe after clearRegistry() and across repeated mounts. */
export function ensurePanelTypesRegistered(): void {
  // Text is the one registry widget with a first-class React body in Panel.tsx.
  ensureRegistered({
    type: 'text',
    defaultQuery: { content: '# Hello\n\nEdit this panel to add content.' },
    category: 'widgets',
    label: 'Text',
    queryMode: 'none',
  })

  ensureRegistered({
    type: 'heatmap',
    defaultQuery: {},
    category: 'charts',
    label: 'Heatmap',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('Heatmap'),
  })

  ensureRegistered({
    type: 'bar_gauge',
    defaultQuery: {},
    category: 'stats',
    label: 'Bar Gauge',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('Bar Gauge'),
  })

  ensureRegistered({
    type: 'scatter',
    defaultQuery: {},
    category: 'charts',
    label: 'Scatter',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('Scatter'),
  })

  ensureRegistered({
    type: 'alert_list',
    defaultQuery: {},
    category: 'widgets',
    label: 'Alert List',
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
    defaultQuery: {},
    category: 'observability',
    label: 'State Timeline',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('State Timeline'),
  })

  ensureRegistered({
    type: 'histogram',
    defaultQuery: {},
    category: 'charts',
    label: 'Histogram',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('Histogram'),
  })

  ensureRegistered({
    type: 'status_history',
    defaultQuery: {},
    category: 'observability',
    label: 'Status History',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('Status History'),
  })

  ensureRegistered({
    type: 'flame_graph',
    defaultQuery: {},
    category: 'observability',
    label: 'Flame Graph',
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
    defaultQuery: {},
    category: 'observability',
    label: 'Node Graph',
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
    defaultQuery: {},
    category: 'charts',
    label: 'Candlestick',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('Candlestick'),
  })

  ensureRegistered({
    type: 'trace_detail',
    defaultQuery: {},
    category: 'observability',
    label: 'Trace Detail',
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
    defaultQuery: {},
    category: 'widgets',
    label: 'Annotation List',
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
    defaultQuery: {},
    category: 'widgets',
    label: 'Dashboard List',
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
    defaultQuery: {},
    category: 'charts',
    label: 'Geomap',
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
    defaultQuery: { canvasData: { elements: [], appState: {} } },
    category: 'widgets',
    label: 'Canvas',
    queryMode: 'none',
    supportStatus: 'unsupported',
    emptyState: pendingReactRendererEmptyState('Canvas'),
  })
}
