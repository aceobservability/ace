import { createRouter, createWebHistory, type RouteLocationNormalizedLoaded, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const defaultDescription =
  'Ace Observability is an open-source monitoring dashboard with multi-datasource support for Prometheus, Loki, Tempo, and VictoriaMetrics.'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: {
      path: '/app/dashboards',
    },
  },
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
  {
    path: '/app',
    redirect: {
      path: '/app/dashboards',
    },
  },
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
  {
    path: '/app/alerts',
    name: 'alerts',
    component: () => import('../views/AlertsView.vue'),
    alias: '/alerts',
    meta: {
      appLayout: 'app',
      title: 'Alerts | Ace',
      description: 'Monitor active alerts and alerting rule groups from VMAlert datasources.',
    },
  },
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
    path: '/app/explore/metrics',
    name: 'explore-metrics',
    component: () => import('../views/Explore.vue'),
    alias: '/explore/metrics',
    meta: {
      appLayout: 'app',
      title: 'Explore Metrics | Ace',
      description: 'Query and visualize metrics from connected datasources.',
    },
  },
  {
    path: '/app/explore/logs',
    name: 'explore-logs',
    component: () => import('../views/ExploreLogs.vue'),
    alias: '/explore/logs',
    meta: {
      appLayout: 'app',
      title: 'Explore Logs | Ace',
      description: 'Search and analyze logs with Ace Explore.',
    },
  },
  {
    path: '/app/explore/traces',
    name: 'explore-traces',
    component: () => import('../views/ExploreTraces.vue'),
    alias: '/explore/traces',
    meta: {
      appLayout: 'app',
      title: 'Explore Traces | Ace',
      description: 'Investigate trace timelines, spans, and service dependencies.',
    },
  },
  {
    path: '/app/settings/org/:id',
    redirect: to => ({
      path: `/app/settings/org/${to.params.id}/general`,
      query: to.query,
    }),
  },
  {
    path: '/settings/org/:id',
    redirect: to => ({
      path: `/app/settings/org/${to.params.id}/general`,
      query: to.query,
    }),
  },
  {
    path: '/app/settings/org/:id/:section',
    name: 'org-settings',
    component: () => import('../views/OrganizationSettings.vue'),
    alias: '/settings/org/:id/:section',
    meta: {
      appLayout: 'app',
      title: 'Organization Settings | Ace',
      description: 'Manage organization profile, members, groups, and authentication providers.',
    },
  },
  {
    path: '/app/datasources',
    name: 'datasources',
    component: () => import('../views/DataSourceSettings.vue'),
    alias: '/datasources',
    meta: {
      appLayout: 'app',
      title: 'Data Sources | Ace',
      description: 'Configure and test datasources for metrics, logs, and traces.',
    },
  },
  {
    path: '/app/datasources/new',
    name: 'datasource-create',
    component: () => import('../views/DataSourceCreateView.vue'),
    alias: '/datasources/new',
    meta: {
      appLayout: 'app',
      title: 'Add Data Source | Dash',
      description: 'Configure and test a datasource before saving it to your organization.',
    },
  },
  {
    path: '/app/datasources/:id/edit',
    name: 'datasource-edit',
    component: () => import('../views/DataSourceCreateView.vue'),
    alias: '/datasources/:id/edit',
    meta: {
      appLayout: 'app',
      title: 'Edit Data Source | Dash',
      description: 'Update and validate datasource settings before saving changes.',
    },
  },
  {
    path: '/app/settings/privacy',
    name: 'privacy-settings',
    component: () => import('../views/PrivacySettingsView.vue'),
    alias: '/settings/privacy',
    meta: {
      appLayout: 'app',
      title: 'Privacy Settings | Ace',
      description: 'Manage analytics, consent, session recording, and feature flag preferences.',
    },
  },
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
    // If authenticated and going to login, redirect to dashboards
    if (isAuthenticated.value && to.name === 'login') {
      next('/app/dashboards')
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
