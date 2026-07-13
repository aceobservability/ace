import { lazy } from 'react'
import { createBrowserRouter, Navigate, useParams, type RouteObject } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'

const PlaceholderPage = lazy(() =>
  import('@/pages/PlaceholderPage').then(m => ({ default: m.PlaceholderPage })),
)

const defaultDescription =
  'Ace Observability is an open-source monitoring dashboard with multi-datasource support for Prometheus, Loki, Tempo, and VictoriaMetrics.'

export type RouteMeta = {
  title?: string
  description?: string
  public?: boolean
  appLayout?: 'app'
}

function withMeta(title: string, description = defaultDescription, extra: Partial<RouteMeta> = {}): RouteMeta {
  return { title, description, ...extra }
}

function placeholder(title: string, description?: string) {
  return <PlaceholderPage title={title} description={description} />
}

function SettingsOrgSectionRedirect() {
  const { section } = useParams<{ section: string }>()
  return <Navigate to={`/app/settings/${section ?? 'general'}`} replace />
}

const appRoutes: RouteObject[] = [
  {
    path: '/app',
    handle: withMeta(
      'Ace — Command Center',
      'Your observability command center — dashboards, services, alerts, and insights at a glance.',
    ),
    element: placeholder('Command Center'),
  },
  {
    path: '/app/dashboards',
    handle: withMeta('Dashboards | Ace', 'Browse and organize dashboards in Ace.'),
    element: placeholder('Dashboards'),
  },
  {
    path: '/app/dashboards/new/ai',
    handle: withMeta('Generate Dashboard — Ace'),
    element: placeholder('Generate Dashboard'),
  },
  {
    path: '/app/dashboards/:id',
    handle: withMeta('Dashboard | Ace'),
    element: placeholder('Dashboard'),
  },
  {
    path: '/app/dashboards/:id/settings',
    element: <Navigate to="general" replace />,
  },
  {
    path: '/app/dashboards/:id/settings/:section',
    handle: withMeta('Dashboard Settings | Ace'),
    element: placeholder('Dashboard Settings'),
  },
  {
    path: '/app/services',
    handle: withMeta('Services — Ace'),
    element: placeholder('Services'),
  },
  {
    path: '/app/alerts',
    handle: withMeta('Alerts | Ace'),
    element: placeholder('Alerts'),
  },
  {
    path: '/app/explore',
    element: <Navigate to="/app/explore/metrics" replace />,
  },
  {
    path: '/app/explore/:type',
    handle: withMeta('Explore — Ace'),
    element: placeholder('Explore'),
  },
  {
    path: '/app/settings',
    element: <Navigate to="/app/settings/general" replace />,
  },
  {
    path: '/app/settings/org/:id',
    element: <Navigate to="/app/settings/general" replace />,
  },
  {
    path: '/app/settings/org/:id/:section',
    element: <SettingsOrgSectionRedirect />,
  },
  {
    path: '/app/settings/:section',
    handle: withMeta('Settings — Ace'),
    element: placeholder('Settings'),
  },
  {
    path: '/app/datasources',
    element: <Navigate to="/app/settings/datasources" replace />,
  },
  {
    path: '/app/datasources/new',
    element: <Navigate to="/app/settings/datasources" replace />,
  },
  {
    path: '/app/datasources/:id/edit',
    handle: withMeta('Edit Data Source | Ace'),
    element: placeholder('Edit Data Source'),
  },
  {
    path: '/app/audit-log',
    handle: withMeta('Audit Log — Ace'),
    element: placeholder('Audit Log'),
  },
]

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/app" replace />,
  },
  {
    path: '/login',
    handle: withMeta('Sign in | Ace', 'Sign in to Ace to manage dashboards, alerts, and observability workflows.', {
      public: true,
    }),
    element: placeholder('Sign in'),
  },
  {
    element: <AppLayout />,
    children: appRoutes,
  },
  // Backward-compat aliases
  { path: '/dashboards', element: <Navigate to="/app/dashboards" replace /> },
  { path: '/dashboards/:id', element: <Navigate to="/app/dashboards/:id" replace /> },
  { path: '/dashboards/:id/settings', element: <Navigate to="/app/dashboards/:id/settings" replace /> },
  {
    path: '/dashboards/:id/settings/:section',
    element: <Navigate to="/app/dashboards/:id/settings/:section" replace />,
  },
  { path: '/alerts', element: <Navigate to="/app/alerts" replace /> },
  { path: '/explore', element: <Navigate to="/app/explore/metrics" replace /> },
  { path: '/explore/:type', element: <Navigate to="/app/explore/:type" replace /> },
  { path: '/settings/org/:id', element: <Navigate to="/app/settings/general" replace /> },
  { path: '/settings/org/:id/:section', element: <SettingsOrgSectionRedirect /> },
  { path: '/datasources/:id/edit', element: <Navigate to="/app/datasources/:id/edit" replace /> },
  {
    path: '/convert/grafana',
    element: (
      <Navigate to={{ pathname: '/app/dashboards', search: '?newDashboardMode=grafana' }} replace />
    ),
  },
])