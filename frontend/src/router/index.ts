import { createRouter, createWebHistory, type RouteLocationNormalizedLoaded, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const defaultDescription =
  'Ace Observability is an open-source monitoring dashboard with multi-datasource support for Prometheus, Loki, Tempo, and VictoriaMetrics.'

// Lazy-loaded views (new — files created in subsequent tasks)
const HomeView = () => import('../views/HomeView.vue')
const ServicesView = () => import('../views/ServicesView.vue')
const DashboardGenView = () => import('../views/DashboardGenView.vue')
const UnifiedExploreView = () => import('../views/UnifiedExploreView.vue')
const UnifiedSettingsView = () => import('../views/UnifiedSettingsView.vue')

const routes: RouteRecordRaw[] = [
  // Default redirect: / → /app (Home)
  {
    path: '/',
    redirect: {
      path: '/app',
    },
  },

  // Login
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: {
      public: true,
      title: 'Sign in | Ace',
      description: 'Sign in to Ace to manage dashboards, alerts, and observability workflows.',
    },
  },

  // Home — the landing page
  {
    path: '/app',
    name: 'home',
    component: HomeView,
    meta: {
      appLayout: 'app',
      title: 'Ace — Command Center',
      description: 'Your observability command center — dashboards, services, alerts, and insights at a glance.',
    },
  },

  // Dashboards
  {
    path: '/app/dashboards',
    name: 'dashboards',
    component: () => import('../views/DashboardsView.vue'),
    alias: '/dashboards',
    meta: {
      appLayout: 'app',
      title: 'Dashboards | Ace',
      description: 'Browse and organize dashboards in Ace.',
    },
  },
  // AI dashboard generation — MUST be before :id route
  {
    path: '/app/dashboards/new/ai',
    name: 'dashboard-gen',
    component: DashboardGenView,
    meta: {
      appLayout: 'app',
      title: 'Generate Dashboard — Ace',
      description: 'Generate a new dashboard using AI from a natural-language prompt.',
    },
  },
  {
    path: '/app/dashboards/:id',
    name: 'dashboard-detail',
    component: () => import('../views/DashboardDetailView.vue'),
    alias: '/dashboards/:id',
    meta: {
      appLayout: 'app',
      title: 'Dashboard | Ace',
      description: 'Inspect, configure, and monitor dashboard panels in Ace.',
    },
  },
  {
    path: '/app/dashboards/:id/settings',
    redirect: to => ({
      path: `/app/dashboards/${to.params.id}/settings/general`,
      query: to.query,
    }),
  },
  {
    path: '/dashboards/:id/settings',
    redirect: to => ({
      path: `/app/dashboards/${to.params.id}/settings/general`,
      query: to.query,
    }),
  },
  {
    path: '/app/dashboards/:id/settings/:section',
    name: 'dashboard-settings',
    component: () => import('../views/DashboardSettingsView.vue'),
    alias: '/dashboards/:id/settings/:section',
    meta: {
      appLayout: 'app',
      title: 'Dashboard Settings | Ace',
      description: 'Configure dashboard settings, YAML, and permissions.',
    },
  },

  // Services
  {
    path: '/app/services',
    name: 'services',
    component: ServicesView,
    meta: {
      appLayout: 'app',
      title: 'Services — Ace',
      description: 'Monitor service health, latency, and error rates across your infrastructure.',
    },
  },

  // Alerts
  {
    path: '/app/alerts',
    name: 'alerts',
    component: () => import('../views/AlertsView.vue'),
    alias: '/alerts',
    meta: {
      appLayout: 'app',
      title: 'Alerts | Ace',
      description: 'Manage and monitor alert rules and notifications.',
    },
  },

  // Unified Explore (metrics, logs, traces via :type param)
  {
    path: '/app/explore',
    redirect: {
      path: '/app/explore/metrics',
    },
  },
  {
    path: '/explore',
    redirect: {
      path: '/app/explore/metrics',
    },
  },
  {
    path: '/app/explore/:type',
    name: 'explore',
    component: UnifiedExploreView,
    alias: '/explore/:type',
    meta: {
      appLayout: 'app',
      title: 'Explore — Ace',
      description: 'Query and visualize metrics, logs, and traces from connected datasources.',
    },
  },

  // Unified Settings
  {
    path: '/app/settings',
    redirect: {
      path: '/app/settings/general',
    },
  },
  // Backward compat: old org settings → unified settings
  {
    path: '/app/settings/org/:id',
    redirect: to => ({
      path: '/app/settings/general',
      query: to.query,
    }),
  },
  {
    path: '/settings/org/:id',
    redirect: to => ({
      path: '/app/settings/general',
      query: to.query,
    }),
  },
  {
    path: '/app/settings/org/:id/:section',
    redirect: to => ({
      path: `/app/settings/${to.params.section}`,
      query: to.query,
    }),
  },
  {
    path: '/settings/org/:id/:section',
    redirect: to => ({
      path: `/app/settings/${to.params.section}`,
      query: to.query,
    }),
  },
  {
    path: '/app/settings/:section',
    name: 'settings',
    component: UnifiedSettingsView,
    meta: {
      appLayout: 'app',
      title: 'Settings — Ace',
      description: 'Manage organization profile, members, datasources, and preferences.',
    },
  },

  // Datasources — backward compat redirects
  { path: '/app/datasources', redirect: '/app/settings/datasources' },
  {
    path: '/app/datasources/new',
    redirect: '/app/settings/datasources',
  },
  {
    path: '/app/datasources/:id/edit',
    name: 'datasource-edit',
    component: () => import('../views/DataSourceCreateView.vue'),
    alias: '/datasources/:id/edit',
    meta: {
      appLayout: 'app',
      title: 'Edit Data Source | Ace',
      description: 'Update and validate datasource settings before saving changes.',
    },
  },

  // Audit Log
  {
    path: '/app/audit-log',
    name: 'audit-log',
    component: () => import('../views/AuditLogView.vue'),
    meta: {
      appLayout: 'app',
      title: 'Audit Log — Ace',
      description: 'Browse and export organization audit log entries.',
    },
  },

  // Grafana conversion (low priority reskin)
  {
    path: '/convert/grafana',
    redirect: {
      path: '/app/dashboards',
      query: {
        newDashboardMode: 'grafana',
      },
    },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

function upsertMetaTag(attribute: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attribute}="${key}"]`
  let tag = document.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.append(tag)
  }
  tag.setAttribute('content', content)
}

function upsertCanonical(url: string) {
  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.append(canonical)
  }
  canonical.setAttribute('href', url)
}

function applySeoMetadata(to: RouteLocationNormalizedLoaded) {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Ace'
  const description = typeof to.meta.description === 'string' ? to.meta.description : defaultDescription
  const url = `${window.location.origin}${to.fullPath}`

  document.title = title
  upsertMetaTag('name', 'description', description)
  upsertMetaTag('property', 'og:title', title)
  upsertMetaTag('property', 'og:description', description)
  upsertMetaTag('property', 'og:url', url)
  upsertMetaTag('name', 'twitter:title', title)
  upsertMetaTag('name', 'twitter:description', description)
  upsertCanonical(url)
}

// Navigation guard for authentication
router.beforeEach(async (to, _from, next) => {
  const { isAuthenticated, initialized, initialize } = useAuth()

  // Initialize auth state if not already done
  if (!initialized.value) {
    await initialize()
  }

  // Allow access to public routes
  if (to.meta.public) {
    // If authenticated and going to login, redirect to home
    if (isAuthenticated.value && to.name === 'login') {
      next('/app')
      return
    }
    next()
    return
  }

  // Protected routes require authentication
  if (!isAuthenticated.value) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  next()
})

router.afterEach((to) => {
  applySeoMetadata(to)
})

export default router
