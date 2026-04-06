import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AppSidebar from './AppSidebar.vue'

const mockExpandedSection = ref<string | null>(null)
const mockIsPinned = ref(false)
const mockCurrentRouteSection = ref('dashboards')
const mockToggleSection = vi.fn()
const mockCloseSection = vi.fn()
const mockTogglePin = vi.fn()

vi.mock('../composables/useSidebar', () => ({
  useSidebar: () => ({
    expandedSection: mockExpandedSection,
    isPinned: mockIsPinned,
    currentRouteSection: mockCurrentRouteSection,
    toggleSection: mockToggleSection,
    closeSection: mockCloseSection,
    togglePin: mockTogglePin,
  }),
}))

const mockUser = ref({ email: 'jane@example.com', name: 'Jane Doe' })
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}))

const mockCurrentOrg = ref<{ id: string; name: string; role: string } | null>({ id: 'org-1', name: 'Test Org', role: 'admin' })
const mockOrganizations = ref([
  { id: 'org-1', name: 'Test Org', role: 'admin' },
  { id: 'org-2', name: 'Other Org', role: 'viewer' },
])
const mockSelectOrganization = vi.fn()
vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    organizations: mockOrganizations,
    currentOrg: mockCurrentOrg,
    selectOrganization: mockSelectOrganization,
  }),
}))

vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    favorites: ref([]),
    recentDashboards: ref([]),
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
    addRecent: vi.fn(),
    favoriteRoute: () => '/app',
    favoritesForType: () => [],
  }),
}))

vi.mock('../composables/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}))

vi.mock('../composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({ showHelp: ref(false) }),
}))

const mockRoutePath = ref('/app/dashboards')
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value, meta: {} }),
  useRouter: () => ({ push: mockPush }),
}))

describe('AppSidebar', () => {
  let wrapper: VueWrapper

  function createWrapper() {
    return mount(AppSidebar, {
      global: {
        stubs: {
          Sparkles: { template: '<span class="icon-sparkles" />' },
          LayoutGrid: { template: '<span class="icon-layout-grid" />' },
          Activity: { template: '<span class="icon-activity" />' },
          AlertTriangle: { template: '<span class="icon-alert-triangle" />' },
          Search: { template: '<span class="icon-search" />' },
          Settings: { template: '<span class="icon-settings" />' },
          Star: { template: '<span class="icon-star" />' },
          Clock: { template: '<span class="icon-clock" />' },
          ArrowRight: { template: '<span class="icon-arrow-right" />' },
          Check: { template: '<span class="icon-check" />' },
          Pin: { template: '<span class="icon-pin" />' },
          PinOff: { template: '<span class="icon-pin-off" />' },
          LogOut: { template: '<span class="icon-logout" />' },
          Keyboard: { template: '<span class="icon-keyboard" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockExpandedSection.value = null
    mockIsPinned.value = false
    mockCurrentRouteSection.value = 'dashboards'
    mockCurrentOrg.value = { id: 'org-1', name: 'Test Org', role: 'admin' }
    mockRoutePath.value = '/app/dashboards'
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the sidebar', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar"]').exists()).toBe(true)
  })

  it('shows nav items in collapsed state', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-nav-home"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-dashboards"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-services"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-alerts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-explore"]').exists()).toBe(true)
  })

  it('does not show search when collapsed', () => {
    mockExpandedSection.value = null
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-search"]').exists()).toBe(false)
  })

  it('shows search and sub-nav when expanded', () => {
    mockExpandedSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-subnav-metrics"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-subnav-logs"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-subnav-traces"]').exists()).toBe(true)
  })

  it('does not show sub-nav for home section', () => {
    mockExpandedSection.value = 'home'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-search"]').exists()).toBe(false)
  })

  it('shows accent bar on active section', () => {
    mockExpandedSection.value = 'explore'
    wrapper = createWrapper()
    const explore = wrapper.find('[data-testid="sidebar-nav-explore"]')
    expect(explore.find('[data-testid="sidebar-accent-bar"]').exists()).toBe(true)
  })

  it('calls toggleSection when nav item is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-nav-dashboards"]').trigger('click')
    expect(mockToggleSection).toHaveBeenCalledWith('dashboards')
  })

  it('navigates when clicking a different section than currentRouteSection', async () => {
    mockCurrentRouteSection.value = 'dashboards'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-nav-explore"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/explore/metrics')
    expect(mockToggleSection).toHaveBeenCalledWith('explore')
  })

  it('does not navigate when clicking the same section as currentRouteSection', async () => {
    mockCurrentRouteSection.value = 'dashboards'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-nav-dashboards"]').trigger('click')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockToggleSection).toHaveBeenCalledWith('dashboards')
  })

  it('navigates when sub-nav item is clicked', async () => {
    mockExpandedSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-subnav-logs"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/explore/logs')
  })

  it('has aria-label on the nav landmark', () => {
    wrapper = createWrapper()
    const nav = wrapper.find('nav')
    expect(nav.attributes('aria-label')).toBe('Main navigation')
  })

  describe('org selector', () => {
    it('renders the org selector button', () => {
      wrapper = createWrapper()
      const orgBtn = wrapper.find('[data-testid="sidebar-org-selector"]')
      expect(orgBtn.exists()).toBe(true)
      expect(orgBtn.text()).toContain('T')
    })

    it('opens org switcher popup when org button is clicked', async () => {
      wrapper = createWrapper()
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(false)
      await wrapper.find('[data-testid="sidebar-org-selector"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(true)
    })

    it('lists all organizations in the popup', async () => {
      wrapper = createWrapper()
      await wrapper.find('[data-testid="sidebar-org-selector"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-org-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="org-switcher-org-2"]').exists()).toBe(true)
    })

    it('calls selectOrganization when an org is clicked', async () => {
      wrapper = createWrapper()
      await wrapper.find('[data-testid="sidebar-org-selector"]').trigger('click')
      await wrapper.find('[data-testid="org-switcher-org-2"]').trigger('click')
      expect(mockSelectOrganization).toHaveBeenCalledWith('org-2')
    })

    it('closes the popup after selecting an org', async () => {
      wrapper = createWrapper()
      await wrapper.find('[data-testid="sidebar-org-selector"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(true)
      await wrapper.find('[data-testid="org-switcher-org-2"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(false)
    })

    it('shows ? when no org is selected', () => {
      mockCurrentOrg.value = null
      wrapper = createWrapper()
      const orgBtn = wrapper.find('[data-testid="sidebar-org-selector"]')
      expect(orgBtn.text()).toContain('?')
    })
  })

  describe('user avatar', () => {
    it('renders user initials', () => {
      wrapper = createWrapper()
      const avatar = wrapper.find('[data-testid="sidebar-user-avatar"]')
      expect(avatar.exists()).toBe(true)
      expect(avatar.text()).toContain('JD')
    })
  })
})
