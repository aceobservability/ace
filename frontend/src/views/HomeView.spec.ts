import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

// --- Mocks ---

const mockRegisterContext = vi.fn()
const mockDeregisterContext = vi.fn()

vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: ref(null),
    registerContext: mockRegisterContext,
    deregisterContext: mockDeregisterContext,
  }),
}))

const mockFavorites = ref<{ id: string; title: string; type: string }[]>([])
const mockRecentDashboards = ref<{ id: string; title: string; visitedAt: number }[]>([])

vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    favorites: mockFavorites,
    recentDashboards: mockRecentDashboards,
    toggleFavorite: vi.fn(),
    isFavorite: vi.fn(),
    addRecent: vi.fn(),
    _reset: vi.fn(),
  }),
}))

const mockDatasources = ref<
  { id: string; name: string; type: string; is_default?: boolean }[]
>([])

vi.mock('../composables/useDatasource', () => ({
  useDatasource: () => ({
    datasources: mockDatasources,
    loading: ref(false),
    error: ref(null),
    metricsDatasources: ref([]),
    logsDatasources: ref([]),
    tracingDatasources: ref([]),
    vmalertDatasources: ref([]),
    alertingDatasources: ref([]),
    fetchDatasources: vi.fn(),
    addDatasource: vi.fn(),
    editDatasource: vi.fn(),
    removeDatasource: vi.fn(),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/app',
    meta: { appLayout: 'app' },
    params: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: String, default: '' } },
    setup(props, { slots }) {
      return () => h('a', { href: props.to, 'data-to': props.to }, slots.default?.())
    },
  }),
}))

// Import after mocks
import HomeView from './HomeView.vue'

const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: { to: { type: [String, Object], default: '' } },
  setup(props, { slots }) {
    return () => h('a', { href: '#', 'data-to': props.to }, slots.default?.())
  },
})

describe('HomeView', () => {
  let wrapper: VueWrapper

  function createWrapper(opts: { hasDataSources?: boolean } = {}) {
    if (opts.hasDataSources === false) {
      mockDatasources.value = []
    } else {
      mockDatasources.value = [
        { id: 'ds-1', name: 'Prometheus Prod', type: 'prometheus', is_default: true },
      ]
    }

    return mount(HomeView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
          EmptyState: defineComponent({
            name: 'EmptyState',
            props: ['icon', 'title', 'description', 'actionLabel', 'actionRoute'],
            setup(props) {
              return () =>
                h('div', { 'data-testid': 'empty-state' }, [
                  h('span', { 'data-testid': 'empty-state-title' }, props.title),
                  h('span', { 'data-testid': 'empty-state-description' }, props.description),
                  props.actionLabel
                    ? h('span', { 'data-testid': 'empty-state-action' }, props.actionLabel)
                    : null,
                ])
            },
          }),
          StatusDot: defineComponent({
            name: 'StatusDot',
            props: ['status', 'pulse', 'size'],
            setup(props) {
              return () => h('span', { 'data-testid': 'status-dot', 'data-status': props.status })
            },
          }),
          AiInsightCard: defineComponent({
            name: 'AiInsightCard',
            props: ['title', 'description', 'timestamp', 'type'],
            setup(props) {
              return () =>
                h('div', { 'data-testid': 'ai-insight-card' }, props.title)
            },
          }),
          OnboardingBanner: defineComponent({
            name: 'OnboardingBanner',
            setup() {
              return () => h('div', { 'data-testid': 'onboarding-banner' }, 'Onboarding')
            },
          }),
          Sparkles: { template: '<span class="icon-sparkles" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFavorites.value = []
    mockRecentDashboards.value = []
    mockDatasources.value = []
    localStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    localStorage.clear()
  })

  // --- 1. AI Command Input ---
  it('renders the AI command input section with "Ask Ace anything" heading', () => {
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('Ask Ace anything')
    const inputSection = wrapper.find('[data-testid="ai-command-input"]')
    expect(inputSection.exists()).toBe(true)
  })

  // --- 2. Data source inventory ---
  it('renders configured datasource inventory instead of mock system health', () => {
    wrapper = createWrapper()

    const summaryGrid = wrapper.find('[data-testid="datasource-summary-grid"]')
    expect(summaryGrid.exists()).toBe(true)
    expect(wrapper.text()).toContain('Configured Data Sources')
    expect(wrapper.text()).toContain('Prometheus Prod')
    expect(wrapper.find('[data-testid="datasource-summary-note"]').text()).toContain(
      'not inferring live service health',
    )
    expect(wrapper.find('[data-testid="system-health-grid"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="health-card"]')).toHaveLength(0)
  })

  // --- 3. Sample AI insights ---
  it('renders clearly labeled sample AI insights with AiInsightCard components', () => {
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('Sample AI Insights')
    expect(wrapper.find('[data-testid="sample-ai-insights-note"]').text()).toContain(
      'Illustrative examples only',
    )
    const insightCards = wrapper.findAll('[data-testid="ai-insight-card"]')
    expect(insightCards.length).toBeGreaterThanOrEqual(1)
  })

  // --- 4. OnboardingBanner for new users ---
  it('shows OnboardingBanner for new users (when localStorage has no dismissed flag)', () => {
    // No dismissed flag in localStorage
    localStorage.removeItem('ace-onboarding-dismissed')
    wrapper = createWrapper()

    const banner = wrapper.find('[data-testid="onboarding-banner"]')
    expect(banner.exists()).toBe(true)
  })

  // --- 5. OnboardingBanner dismissed ---
  it('does NOT show OnboardingBanner when dismissed', () => {
    localStorage.setItem('ace-onboarding-dismissed', 'true')
    wrapper = createWrapper()

    const banner = wrapper.find('[data-testid="onboarding-banner"]')
    expect(banner.exists()).toBe(false)
  })

  // --- 6. Pinned Dashboards ---
  it('shows "Pinned Dashboards" section when favorites exist', () => {
    mockFavorites.value = [
      { id: 'dash-1', title: 'Dashboard 1', type: 'dashboard' },
      { id: 'dash-2', title: 'Dashboard 2', type: 'dashboard' },
    ]
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('Pinned Dashboards')
    const pinnedSection = wrapper.find('[data-testid="pinned-dashboards"]')
    expect(pinnedSection.exists()).toBe(true)
  })

  it('does NOT show "Pinned Dashboards" section when no favorites exist', () => {
    mockFavorites.value = []
    wrapper = createWrapper()

    const pinnedSection = wrapper.find('[data-testid="pinned-dashboards"]')
    expect(pinnedSection.exists()).toBe(false)
  })

  // --- 7. Empty state ---
  it('shows empty state with Sparkles icon and "Welcome to Ace" when no data sources connected', () => {
    // Dismiss wizard so EmptyState shows instead
    localStorage.setItem('ace-setup-wizard-dismissed', 'true')
    wrapper = createWrapper({ hasDataSources: false })

    const emptyState = wrapper.find('[data-testid="empty-state"]')
    expect(emptyState.exists()).toBe(true)
    expect(wrapper.find('[data-testid="empty-state-title"]').text()).toBe('Welcome to Ace')
    expect(wrapper.find('[data-testid="empty-state-description"]').text()).toContain(
      'Connect your first data source',
    )
    expect(wrapper.find('[data-testid="empty-state-action"]').text()).toBe('Add Data Source')
    localStorage.removeItem('ace-setup-wizard-dismissed')
  })

  it('does NOT show empty state when data sources are connected', () => {
    wrapper = createWrapper({ hasDataSources: true })

    const emptyState = wrapper.find('[data-testid="empty-state"]')
    expect(emptyState.exists()).toBe(false)
  })

  // --- 8. Command context registration ---
  it('registers command context on mount via useCommandContext', () => {
    wrapper = createWrapper()

    expect(mockRegisterContext).toHaveBeenCalledTimes(1)
    expect(mockRegisterContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: 'Home',
        viewRoute: '/app',
      }),
    )
  })

  it('deregisters command context on unmount', () => {
    wrapper = createWrapper()
    wrapper.unmount()

    expect(mockDeregisterContext).toHaveBeenCalledTimes(1)
  })

  // --- Additional coverage ---
  it('shows "Recently Viewed" section when recent dashboards exist', () => {
    mockRecentDashboards.value = [
      { id: 'dash-1', title: 'My Dashboard', visitedAt: Date.now() },
    ]
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('Recently Viewed')
    const recentSection = wrapper.find('[data-testid="recently-viewed"]')
    expect(recentSection.exists()).toBe(true)
  })

  it('does NOT show "Recently Viewed" section when no recent dashboards exist', () => {
    mockRecentDashboards.value = []
    wrapper = createWrapper()

    const recentSection = wrapper.find('[data-testid="recently-viewed"]')
    expect(recentSection.exists()).toBe(false)
  })

  it('datasource summary cards display datasource name and signal coverage', () => {
    wrapper = createWrapper()

    const summaryCards = wrapper.findAll('[data-testid="datasource-summary-card"]')
    expect(summaryCards.length).toBeGreaterThanOrEqual(1)

    const firstCard = summaryCards[0]
    expect(firstCard.find('[data-testid="status-dot"]').exists()).toBe(true)
    expect(firstCard.text()).toContain('Prometheus Prod')
    expect(firstCard.text()).toContain('Metrics')
    expect(firstCard.text()).toContain('Default source')
  })

  it('AI command input section has gradient background styling', () => {
    wrapper = createWrapper()

    const inputSection = wrapper.find('[data-testid="ai-command-input"]')
    expect(inputSection.exists()).toBe(true)
    const style = inputSection.attributes('style') || ''
    expect(style).toContain('linear-gradient')
  })
})
