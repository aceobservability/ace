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

const mockFavorites = ref<string[]>([])
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
    // By default, the view shows the normal (non-empty) state.
    // When hasDataSources is false, we set a localStorage flag so the view
    // renders the empty state instead.
    if (opts.hasDataSources === false) {
      localStorage.setItem('ace-has-datasources', 'false')
    } else {
      localStorage.setItem('ace-has-datasources', 'true')
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
            props: ['title', 'description', 'timestamp'],
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

  // --- 2. System Health Grid ---
  it('renders the system health grid section', () => {
    wrapper = createWrapper()

    const healthGrid = wrapper.find('[data-testid="system-health-grid"]')
    expect(healthGrid.exists()).toBe(true)
    // Should contain at least one health card
    const healthCards = wrapper.findAll('[data-testid="health-card"]')
    expect(healthCards.length).toBeGreaterThanOrEqual(1)
  })

  // --- 3. Recent AI Insights ---
  it('renders the "Recent AI Insights" section with AiInsightCard components', () => {
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('Recent AI Insights')
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
    mockFavorites.value = ['dash-1', 'dash-2']
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
    wrapper = createWrapper({ hasDataSources: false })

    const emptyState = wrapper.find('[data-testid="empty-state"]')
    expect(emptyState.exists()).toBe(true)
    expect(wrapper.find('[data-testid="empty-state-title"]').text()).toBe('Welcome to Ace')
    expect(wrapper.find('[data-testid="empty-state-description"]').text()).toContain(
      'Connect your first data source',
    )
    expect(wrapper.find('[data-testid="empty-state-action"]').text()).toBe('Add Data Source')
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

  it('health cards display service name and metrics', () => {
    wrapper = createWrapper()

    const healthCards = wrapper.findAll('[data-testid="health-card"]')
    expect(healthCards.length).toBeGreaterThanOrEqual(1)

    // Each health card should contain a service name and a StatusDot
    const firstCard = healthCards[0]
    expect(firstCard.find('[data-testid="status-dot"]').exists()).toBe(true)
    expect(firstCard.text()).toBeTruthy()
  })

  it('AI command input section has glassmorphic styling with backdrop-blur', () => {
    wrapper = createWrapper()

    const inputSection = wrapper.find('[data-testid="ai-command-input"]')
    expect(inputSection.exists()).toBe(true)
    const style = inputSection.attributes('style') || ''
    expect(style).toContain('backdrop-filter')
  })
})
