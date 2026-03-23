import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import SidebarFlyout from './SidebarFlyout.vue'

const mockRoutePath = ref('/app/explore/metrics')
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    favorites: ref(['dash-1']),
    recentDashboards: ref([
      { id: 'dash-2', title: 'API Latency', visitedAt: Date.now() },
    ]),
    isFavorite: (id: string) => id === 'dash-1',
  }),
}))

describe('SidebarFlyout', () => {
  let wrapper: VueWrapper

  function createWrapper(props: { section: string; isPinned?: boolean }) {
    return mount(SidebarFlyout, {
      props: {
        section: props.section,
        isPinned: props.isPinned ?? false,
      },
      global: {
        stubs: {
          X: { template: '<span class="icon-x" />' },
          Star: { template: '<span class="icon-star" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutePath.value = '/app/explore/metrics'
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders section header with section name', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-header"]').text()).toContain('Explore')
  })

  it('renders close button', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-close"]').exists()).toBe(true)
  })

  it('emits close event when close button is clicked', async () => {
    wrapper = createWrapper({ section: 'explore' })
    await wrapper.find('[data-testid="flyout-close"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('renders sub-nav items for Explore section', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-nav-metrics"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-logs"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-traces"]').exists()).toBe(true)
  })

  it('renders sub-nav items for Alerts section', () => {
    wrapper = createWrapper({ section: 'alerts' })
    expect(wrapper.find('[data-testid="flyout-nav-active"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-silenced"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-rules"]').exists()).toBe(true)
  })

  it('highlights active sub-nav item based on route', () => {
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper({ section: 'explore' })
    const metricsItem = wrapper.find('[data-testid="flyout-nav-metrics"]')
    expect(metricsItem.attributes('aria-current')).toBe('page')
  })

  it('renders search input', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-search"]').exists()).toBe(true)
  })

  it('emits navigate event when sub-nav item is clicked', async () => {
    wrapper = createWrapper({ section: 'explore' })
    await wrapper.find('[data-testid="flyout-nav-logs"]').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['/app/explore/logs'])
  })

  it('does not render for home section', () => {
    wrapper = createWrapper({ section: 'home' })
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(false)
  })

  it('renders flyout at 240px width', () => {
    wrapper = createWrapper({ section: 'explore' })
    const panel = wrapper.find('[data-testid="flyout-panel"]')
    expect(panel.element.style.width).toBe('var(--sidebar-flyout-width)')
  })

  it('renders settings sub-nav items', () => {
    wrapper = createWrapper({ section: 'settings' })
    expect(wrapper.find('[data-testid="flyout-nav-general"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-members"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-groups"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-datasources"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-ai"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-sso"]').exists()).toBe(true)
  })
})
