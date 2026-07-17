import type { RawQueryResult } from '@/types/panel'
import { registerPanel } from '@/utils/panelRegistry'

function lazyIcon(
  name:
    | 'FileText'
    | 'Bell'
    | 'StickyNote'
    | 'LayoutDashboard'
    | 'PenTool'
    | 'Network'
    | 'AppWindow',
) {
  return () =>
    import('lucide-react').then(module => ({
      default: module[name],
    }))
}

// Text / markdown
registerPanel({
  type: 'text',
  component: () => import('./react/TextPanel').then(module => ({ default: module.TextPanel })),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    return {
      content: typeof query?.content === 'string' ? query.content : '',
      mode: query?.mode === 'html' ? 'html' : 'markdown',
    }
  },
  defaultQuery: { content: '# Hello\n\nEdit this panel to add content.' },
  category: 'widgets',
  label: 'Text',
  icon: lazyIcon('FileText'),
  queryMode: 'none',
})

// Iframe embed
registerPanel({
  type: 'iframe',
  component: () => import('./react/IframePanel').then(module => ({ default: module.IframePanel })),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    return {
      url: typeof query?.url === 'string' ? query.url : '',
      title: typeof query?.title === 'string' ? query.title : 'Embedded content',
    }
  },
  defaultQuery: { url: '', title: 'Embedded content' },
  category: 'widgets',
  label: 'Iframe',
  icon: lazyIcon('AppWindow'),
  queryMode: 'none',
})

// Excalidraw canvas (native React — no Vue bridge)
registerPanel({
  type: 'canvas',
  component: () => import('./react/CanvasPanel').then(module => ({ default: module.CanvasPanel })),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
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
  icon: lazyIcon('PenTool'),
  queryMode: 'none',
})

// Alert list
registerPanel({
  type: 'alert_list',
  component: () =>
    import('./react/AlertListPanel').then(module => ({ default: module.AlertListPanel })),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    const alerts = Array.isArray(query?.alerts) ? query.alerts : []
    return { alerts }
  },
  defaultQuery: {},
  category: 'widgets',
  label: 'Alert List',
  icon: lazyIcon('Bell'),
  queryMode: 'none',
  supportStatus: 'setup_required',
  emptyState: {
    title: 'Alert list not connected',
    description:
      'This panel is waiting on alert API wiring. Use the Alerts page with VMAlert or Alertmanager datasources for live alerts.',
    actionLabel: 'Open Alerts',
  },
})

// Node graph (service topology)
registerPanel({
  type: 'node_graph',
  component: () =>
    import('./react/NodeGraphPanel').then(module => ({ default: module.NodeGraphPanel })),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    const nodes = Array.isArray(query?.nodes) ? query.nodes : []
    const edges = Array.isArray(query?.edges) ? query.edges : []
    return { nodes, edges }
  },
  defaultQuery: {},
  category: 'observability',
  label: 'Node Graph',
  icon: lazyIcon('Network'),
  queryMode: 'traces',
  supportStatus: 'setup_required',
  emptyState: {
    title: 'Service graph not connected',
    description:
      'This panel needs backend service-graph wiring before it can render topology. Use Traces Explore for live trace search today.',
    actionLabel: 'Open Traces Explore',
  },
})

// Annotation list
registerPanel({
  type: 'annotation_list',
  component: () =>
    import('./react/AnnotationListPanel').then(module => ({ default: module.AnnotationListPanel })),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    const annotations = Array.isArray(query?.annotations) ? query.annotations : []
    return { annotations }
  },
  defaultQuery: {},
  category: 'widgets',
  label: 'Annotation List',
  icon: lazyIcon('StickyNote'),
  queryMode: 'none',
  supportStatus: 'unsupported',
  emptyState: {
    title: 'Annotations are not connected',
    description:
      'Annotation storage is not available in the backend yet. This panel intentionally stays empty instead of showing demo notes.',
    actionLabel: 'Await annotation API',
  },
})

// Dashboard list
registerPanel({
  type: 'dashboard_list',
  component: () =>
    import('./react/DashboardListPanel').then(module => ({ default: module.DashboardListPanel })),
  dataAdapter: (_raw: RawQueryResult, query?: Record<string, unknown>) => {
    const dashboards = Array.isArray(query?.dashboards) ? query.dashboards : []
    return { dashboards }
  },
  defaultQuery: {},
  category: 'widgets',
  label: 'Dashboard List',
  icon: lazyIcon('LayoutDashboard'),
  queryMode: 'none',
  supportStatus: 'setup_required',
  emptyState: {
    title: 'Dashboard list not connected',
    description:
      'Dashboard APIs exist, but this embeddable list panel has not been wired to an organization yet. Use the Dashboards page for live dashboard lists.',
    actionLabel: 'Open Dashboards',
  },
})
