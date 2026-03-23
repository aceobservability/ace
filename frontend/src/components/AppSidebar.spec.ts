import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AppSidebar from './AppSidebar.vue'

const mockHoveredSection = ref<string | null>(null)
const mockPinnedSection = ref<string | null>(null)
const mockIsPeeking = ref(false)
const mockActiveFlyoutSection = ref<string | null>(null)
const mockCurrentRouteSection = ref('dashboards')
const mockHandleMouseEnter = vi.fn()
const mockHandleMouseLeave = vi.fn()
const mockPinSection = vi.fn()
const mockCloseFlyout = vi.fn()

vi.mock('../composables/useSidebar', () => ({
  useSidebar: () => ({
    hoveredSection: mockHoveredSection,
    pinnedSection: mockPinnedSection,
    isPeeking: mockIsPeeking,
    activeFlyoutSection: mockActiveFlyoutSection,
    currentRouteSection: mockCurrentRouteSection,
    handleMouseEnter: mockHandleMouseEnter,
    handleMouseLeave: mockHandleMouseLeave,
    pinSection: mockPinSection,
    closeFlyout: mockCloseFlyout,
  }),
}))

const mockUser = ref({ email: 'jane@example.com', name: 'Jane Doe' })
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const mockCurrentOrg = ref({ id: 'org-1', name: 'Test Org', role: 'admin' })
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
    isFavorite: () => false,
  }),
}))

const mockRoutePath = ref('/app/dashboards')
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
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
          X: { template: '<span class="icon-x" />' },
          Star: { template: '<span class="icon-star" />' },
          Check: { template: '<span class="icon-check" />' },
          LogOut: { template: '<span class="icon-logout" />' },
          Keyboard: { template: '<span class="icon-keyboard" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockHoveredSection.value = null
    mockPinnedSection.value = null
    mockIsPeeking.value = false
    mockActiveFlyoutSection.value = null
    mockCurrentRouteSection.value = 'dashboards'
    mockCurrentOrg.value = { id: 'org-1', name: 'Test Org', role: 'admin' }
    mockRoutePath.value = '/app/dashboards'
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the sidebar rail', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-rail"]').exists()).toBe(true)
  })

  it('does not render flyout when no section is active', () => {
    mockActiveFlyoutSection.value = null
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(false)
  })

  it('renders flyout when a section is active', () => {
    mockActiveFlyoutSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(true)
  })

  it('does not render flyout for home section', () => {
    mockActiveFlyoutSection.value = 'home'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(false)
  })

  it('passes activeSection to rail from currentRouteSection or pinnedSection', () => {
    mockPinnedSection.value = 'explore'
    mockActiveFlyoutSection.value = 'explore'
    wrapper = createWrapper()
    // The rail should show explore as active via the accent bar
    const exploreRail = wrapper.find('[data-testid="rail-explore"]')
    expect(exploreRail.find('[data-testid="rail-accent-bar"]').exists()).toBe(true)
  })

  it('calls pinSection when rail icon is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-dashboards"]').trigger('click')
    expect(mockPinSection).toHaveBeenCalledWith('dashboards')
  })

  it('calls handleMouseEnter when hovering rail icon', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-explore"]').trigger('mouseenter')
    expect(mockHandleMouseEnter).toHaveBeenCalledWith('explore')
  })

  it('navigates when flyout sub-nav item is clicked', async () => {
    mockActiveFlyoutSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="flyout-nav-logs"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/explore/logs')
  })

  it('calls closeFlyout when flyout close button is clicked', async () => {
    mockActiveFlyoutSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="flyout-close"]').trigger('click')
    expect(mockCloseFlyout).toHaveBeenCalled()
  })

  it('has aria-label on the nav landmark', () => {
    wrapper = createWrapper()
    const nav = wrapper.find('nav')
    expect(nav.attributes('aria-label')).toBe('Main navigation')
  })

  it('clicking outside the flyout closes it when pinned', async () => {
    mockPinnedSection.value = 'explore'
    mockActiveFlyoutSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    const backdrop = wrapper.find('[data-testid="flyout-backdrop"]')
    expect(backdrop.exists()).toBe(true)
    await backdrop.trigger('click')
    expect(mockCloseFlyout).toHaveBeenCalled()
  })

  it('does not show backdrop when flyout is not pinned', () => {
    mockPinnedSection.value = null
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="flyout-backdrop"]').exists()).toBe(false)
  })

  describe('org selector', () => {
    it('renders the org selector button in the rail', () => {
      wrapper = createWrapper()
      const orgBtn = wrapper.find('[data-testid="rail-org-selector"]')
      expect(orgBtn.exists()).toBe(true)
      expect(orgBtn.text()).toBe('T')
    })

    it('opens org switcher popup when org button is clicked', async () => {
      wrapper = createWrapper()
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(false)
      await wrapper.find('[data-testid="rail-org-selector"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(true)
    })

    it('lists all organizations in the popup', async () => {
      wrapper = createWrapper()
      await wrapper.find('[data-testid="rail-org-selector"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-org-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="org-switcher-org-2"]').exists()).toBe(true)
    })

    it('calls selectOrganization when an org is clicked', async () => {
      wrapper = createWrapper()
      await wrapper.find('[data-testid="rail-org-selector"]').trigger('click')
      await wrapper.find('[data-testid="org-switcher-org-2"]').trigger('click')
      expect(mockSelectOrganization).toHaveBeenCalledWith('org-2')
    })

    it('closes the popup after selecting an org', async () => {
      wrapper = createWrapper()
      await wrapper.find('[data-testid="rail-org-selector"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(true)
      await wrapper.find('[data-testid="org-switcher-org-2"]').trigger('click')
      expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(false)
    })

    it('highlights the current org with primary color', async () => {
      wrapper = createWrapper()
      await wrapper.find('[data-testid="rail-org-selector"]').trigger('click')
      const currentOrgBtn = wrapper.find('[data-testid="org-switcher-org-1"]')
      expect(currentOrgBtn.attributes('style')).toContain('--color-primary')
      const otherOrgBtn = wrapper.find('[data-testid="org-switcher-org-2"]')
      expect(otherOrgBtn.attributes('style')).toContain('--color-on-surface')
    })

    it('shows ? when no org is selected', async () => {
      mockCurrentOrg.value = null as unknown as typeof mockCurrentOrg.value
      wrapper = createWrapper()
      const orgBtn = wrapper.find('[data-testid="rail-org-selector"]')
      expect(orgBtn.text()).toBe('?')
    })
  })
})
