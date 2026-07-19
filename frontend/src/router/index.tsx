import { lazy } from 'react'
import { createBrowserRouter, Navigate, useParams, type RouteObject } from 'react-router-dom'
import { AuthGuard } from '@/layouts/AuthGuard'
import { AppLayout } from '@/layouts/AppLayout'
import { createParamRedirect } from '@/lib/redirects'

const PlaceholderPage = lazy(() =>
  import('@/pages/PlaceholderPage').then(m => ({ default: m.PlaceholderPage })),
)
const HomePage = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })))
const ExplorePage = lazy(() => import('@/pages/ExplorePage').then(m => ({ default: m.ExplorePage })))
const DashboardsPage = lazy(() =>
  import('@/pages/DashboardsPage').then(m => ({ default: m.DashboardsPage })),
)
const DashboardDetailPage = lazy(() =>
  import('@/pages/DashboardDetailPage').then(m => ({ default: m.DashboardDetailPage })),
)
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const AuthCallbackPage = lazy(() =>
  import('@/pages/AuthCallbackPage').then(m => ({ default: m.AuthCallbackPage })),
)
const ServicesPage = lazy(() =>
  import('@/pages/ServicesPage').then(m => ({ default: m.ServicesPage })),
)
const AlertsPage = lazy(() => import('@/pages/AlertsPage').then(m => ({ default: m.AlertsPage })))

const DashboardAliasRedirect = createParamRedirect('/app/dashboards/:id')
const DashboardSettingsAliasRedirect = createParamRedirect('/app/dashboards/:id/settings')
const DashboardSettingsSectionAliasRedirect = createParamRedirect('/app/dashboards/:id/settings/:section')
const ExploreTypeAliasRedirect = createParamRedirect('/app/explore/:type')
const DatasourceEditAliasRedirect = createParamRedirect('/app/datasources/:id/edit')

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

function DashboardSettingsRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/app/dashboards/${id}/settings/general`} replace />
}

const appRoutes: RouteObject[] = [
  {
    path: '/app',
    handle: withMeta(
      'Ace — Command Center',
      'Your observability command center — dashboards, services, alerts, and insights at a glance.',
    ),
    element: <HomePage />,
  },
  {
    path: '/app/dashboards',
    handle: withMeta('Dashboards | Ace', 'Browse and organize dashboards in Ace.'),
    element: <DashboardsPage />,
  },
  {
    path: '/app/dashboards/new/ai',
    handle: withMeta('Generate Dashboard — Ace'),
    element: placeholder('Generate Dashboard'),
  },
  {
    path: '/app/dashboards/:id',
    handle: withMeta('Dashboard | Ace'),
    element: <DashboardDetailPage />,
  },
  {
    path: '/app/dashboards/:id/settings',
    element: <DashboardSettingsRedirect />,
  },
  {
    path: '/app/dashboards/:id/settings/:section',
    handle: withMeta('Dashboard Settings | Ace'),
    element: placeholder('Dashboard Settings'),
  },
  {
    path: '/app/services',
    handle: withMeta('Services — Ace'),
    element: <ServicesPage />,
  },
  {
    path: '/app/alerts',
    handle: withMeta('Alerts | Ace'),
    element: <AlertsPage />,
  },
  {
    path: '/app/explore',
    element: <Navigate to="/app/explore/metrics" replace />,
  },
  {
    path: '/app/explore/:type',
    handle: withMeta('Explore — Ace'),
    element: <ExplorePage />,
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
    element: <AuthGuard />,
    children: [
      {
        path: '/login',
        handle: withMeta('Sign in | Ace', 'Sign in to Ace to manage dashboards, alerts, and observability workflows.', {
          public: true,
        }),
        element: <LoginPage />,
      },
      {
        path: '/auth/callback',
        handle: withMeta('Signing in | Ace', undefined, { public: true }),
        element: <AuthCallbackPage />,
      },
      {
        element: <AppLayout />,
        children: appRoutes,
      },
      // Backward-compat aliases
      { path: '/dashboards', element: <Navigate to="/app/dashboards" replace /> },
      { path: '/dashboards/:id', element: <DashboardAliasRedirect /> },
      { path: '/dashboards/:id/settings', element: <DashboardSettingsAliasRedirect /> },
      { path: '/dashboards/:id/settings/:section', element: <DashboardSettingsSectionAliasRedirect /> },
      { path: '/alerts', element: <Navigate to="/app/alerts" replace /> },
      { path: '/explore', element: <Navigate to="/app/explore/metrics" replace /> },
      { path: '/explore/:type', element: <ExploreTypeAliasRedirect /> },
      { path: '/settings/org/:id', element: <Navigate to="/app/settings/general" replace /> },
      { path: '/settings/org/:id/:section', element: <SettingsOrgSectionRedirect /> },
      { path: '/datasources/:id/edit', element: <DatasourceEditAliasRedirect /> },
      {
        path: '/convert/grafana',
        element: (
          <Navigate to={{ pathname: '/app/dashboards', search: '?newDashboardMode=grafana' }} replace />
        ),
      },
    ],
  },
])