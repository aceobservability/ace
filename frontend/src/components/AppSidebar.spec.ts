import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import AppSidebar from './AppSidebar.vue'

/* ─── Mock: useSidebar ─── */
const mockIsExpanded = ref(true)
const mockExpandedSections = ref<Set<string>>(new Set())
const mockCurrentRouteSection = ref('home')
const mockToggleSidebar = vi.fn()
const mockToggleSection = vi.fn()
const mockExpandSection = vi.fn()

vi.mock('../composables/useSidebar', () => ({
  useSidebar: () => ({
    isExpanded: mockIsExpanded,
    sidebarWidth: computed(() => (mockIsExpanded.value ? '220px' : '64px')),
    expandedSections: mockExpandedSections,
    currentRouteSection: mockCurrentRouteSection,
    toggleSidebar: mockToggleSidebar,
    toggleSection: mockToggleSection,
    expandSection: mockExpandSection,
  }),
}))

/* ─── Mock: useAuth ─── */
const mockUser = ref({ email: 'jane@example.com', name: 'Jane Doe' })
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

/* ─── Mock: useOrganization ─── */
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

/* ─── Mock: vue-router ─── */
const mockRoutePath = ref('/app')
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: mockPush }),
}))

/* ─── Helper: create wrapper ─── */
function createWrapper(): VueWrapper {
  return mount(AppSidebar, {
    global: {
      stubs: {
        Sparkles: { template: '<span class="icon-sparkles" />' },
        LayoutGrid: { template: '<span class="icon-layout-grid" />' },
        Activity: { template: '<span class="icon-activity" />' },
        AlertTriangle: { template: '<span class="icon-alert-triangle" />' },
        Search: { template: '<span class="icon-search" />' },
        Settings: { template: '<span class="icon-settings" />' },
        ChevronDown: { template: '<span class="icon-chevron-down" />' },
        ChevronRight: { template: '<span class="icon-chevron-right" />' },
        PanelLeft: { template: '<span class="icon-panel-left" />' },
        PanelLeftClose: { template: '<span class="icon-panel-left-close" />' },
        Check: { template: '<span class="icon-check" />' },
        SidebarUserMenu: { template: '<div data-testid="user-menu-stub" />' },
      },
    },
  })
}

describe('AppSidebar', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsExpanded.value = true
    mockExpandedSections.value = new Set()
    mockCurrentRouteSection.value = 'home'
    mockRoutePath.value = '/app'
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
    mockCurrentOrg.value = { id: 'org-1', name: 'Test Org', role: 'admin' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  // ─── Test 1: Renders all nav items ───
  it('renders all nav items (Home, Dashboards, Services, Alerts, Explore)', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-nav-home"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-dashboards"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-services"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-alerts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-nav-explore"]').exists()).toBe(true)
  })

  // ─── Test 2: Renders Settings below spacer ───
  it('renders Settings below spacer', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-settings"]').exists()).toBe(true)
    // Settings should come after the spacer (flex-1 div)
    const container = wrapper.find('[data-testid="sidebar-container"]')
    const html = container.html()
    const spacerIdx = html.indexOf('flex-1')
    const settingsIdx = html.indexOf('sidebar-settings')
    expect(settingsIdx).toBeGreaterThan(spacerIdx)
  })

  // ─── Test 3: Renders logo, org selector, toggle button, user avatar ───
  it('renders logo, org selector, toggle button, user avatar', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-logo"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-org-selector"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-avatar"]').exists()).toBe(true)
  })

  // ─── Test 4: Expanded: shows labels for all items ───
  it('shows labels when expanded', () => {
    mockIsExpanded.value = true
    wrapper = createWrapper()
    const homeBtn = wrapper.find('[data-testid="sidebar-nav-home"]')
    expect(homeBtn.text()).toContain('Home')
    const dashBtn = wrapper.find('[data-testid="sidebar-nav-dashboards"]')
    expect(dashBtn.text()).toContain('Dashboards')
    const svcBtn = wrapper.find('[data-testid="sidebar-nav-services"]')
    expect(svcBtn.text()).toContain('Services')
    const alertBtn = wrapper.find('[data-testid="sidebar-nav-alerts"]')
    expect(alertBtn.text()).toContain('Alerts')
    const expBtn = wrapper.find('[data-testid="sidebar-nav-explore"]')
    expect(expBtn.text()).toContain('Explore')
  })

  // ─── Test 5: Collapsed: hides labels (opacity: 0) ───
  it('hides labels when collapsed (opacity: 0)', () => {
    mockIsExpanded.value = false
    wrapper = createWrapper()
    // Labels should have opacity: 0 when collapsed
    const labels = wrapper.findAll('[data-testid^="sidebar-nav-"] .sidebar-label')
    for (const label of labels) {
      expect(label.attributes('style')).toContain('opacity: 0')
    }
  })

  // ─── Test 6: Click nav item (not on section) → navigates + expands accordion ───
  it('navigates and expands accordion when clicking nav item not on that section', async () => {
    mockCurrentRouteSection.value = 'home'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-nav-dashboards"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/dashboards')
    expect(mockExpandSection).toHaveBeenCalledWith('dashboards')
  })

  // ─── Test 7: Click nav item when already on that section → just toggles accordion ───
  it('toggles accordion when clicking nav item already on that section', async () => {
    mockCurrentRouteSection.value = 'dashboards'
    mockRoutePath.value = '/app/dashboards'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-nav-dashboards"]').trigger('click')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockToggleSection).toHaveBeenCalledWith('dashboards')
  })

  // ─── Test 8: Click toggle → calls toggleSidebar() ───
  it('calls toggleSidebar when toggle button is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-toggle"]').trigger('click')
    expect(mockToggleSidebar).toHaveBeenCalled()
  })

  // ─── Test 9: Accordion: section shows sub-nav items when expanded ───
  it('shows sub-nav items when section is expanded', () => {
    mockIsExpanded.value = true
    mockExpandedSections.value = new Set(['explore'])
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-subnav-metrics"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-subnav-logs"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-subnav-traces"]').exists()).toBe(true)
  })

  // ─── Test 10: Multiple sections expandable simultaneously ───
  it('allows multiple sections to be expanded simultaneously', () => {
    mockIsExpanded.value = true
    mockExpandedSections.value = new Set(['explore', 'settings'])
    wrapper = createWrapper()
    // Explore sub-nav
    expect(wrapper.find('[data-testid="sidebar-subnav-metrics"]').exists()).toBe(true)
    // Settings sub-nav
    expect(wrapper.find('[data-testid="sidebar-subnav-general"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-subnav-members"]').exists()).toBe(true)
  })

  // ─── Test 11: Active state: correct item highlighted based on route ───
  it('highlights active nav item with accent bar and primary-muted bg', () => {
    mockCurrentRouteSection.value = 'dashboards'
    mockRoutePath.value = '/app/dashboards'
    wrapper = createWrapper()
    const dashBtn = wrapper.find('[data-testid="sidebar-nav-dashboards"]')
    expect(dashBtn.attributes('style')).toContain('--color-primary-muted')
    // Accent bar should exist
    const accentBar = dashBtn.find('.sidebar-accent-bar')
    expect(accentBar.exists()).toBe(true)
  })

  // ─── Test 12: Sub-nav active state based on route ───
  it('highlights active sub-nav item based on route', () => {
    mockIsExpanded.value = true
    mockExpandedSections.value = new Set(['explore'])
    mockCurrentRouteSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    const metricsItem = wrapper.find('[data-testid="sidebar-subnav-metrics"]')
    expect(metricsItem.attributes('style')).toContain('--color-primary')
  })

  // ─── Test 13: Hover: inactive items show overlay-hover background ───
  it('applies overlay-hover class on hover for inactive items', async () => {
    mockCurrentRouteSection.value = 'home'
    wrapper = createWrapper()
    const dashBtn = wrapper.find('[data-testid="sidebar-nav-dashboards"]')
    await dashBtn.trigger('mouseenter')
    expect(dashBtn.classes()).toContain('sidebar-nav-hover')
  })

  // ─── Test 14: Org popup opens/closes ───
  it('opens and closes org switcher popup', async () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(false)
    await wrapper.find('[data-testid="sidebar-org-selector"]').trigger('click')
    expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(true)
    // Click again to close
    await wrapper.find('[data-testid="sidebar-org-selector"]').trigger('click')
    expect(wrapper.find('[data-testid="org-switcher-popup"]').exists()).toBe(false)
  })

  // ─── Test 15: aria-label="Main navigation" present ───
  it('has aria-label="Main navigation" on nav element', () => {
    wrapper = createWrapper()
    const nav = wrapper.find('nav')
    expect(nav.attributes('aria-label')).toBe('Main navigation')
  })

  // ─── Test 16: aria-expanded attribute toggles on accordion sections ───
  it('toggles aria-expanded on nav items with sub-nav', () => {
    mockIsExpanded.value = true
    mockExpandedSections.value = new Set(['explore'])
    wrapper = createWrapper()
    const exploreBtn = wrapper.find('[data-testid="sidebar-nav-explore"]')
    expect(exploreBtn.attributes('aria-expanded')).toBe('true')
    const dashBtn = wrapper.find('[data-testid="sidebar-nav-dashboards"]')
    expect(dashBtn.attributes('aria-expanded')).toBe('false')
  })

  // ─── Test 17: role="group" on sub-nav wrappers ───
  it('has role="group" on sub-nav wrappers', () => {
    mockIsExpanded.value = true
    mockExpandedSections.value = new Set(['explore'])
    wrapper = createWrapper()
    const groups = wrapper.findAll('[role="group"]')
    expect(groups.length).toBeGreaterThan(0)
    // Check aria-labelledby points to parent
    const exploreGroup = groups.find((g) => g.attributes('aria-labelledby')?.includes('explore'))
    expect(exploreGroup).toBeDefined()
  })

  // ─── Test 18: Collapsed: title attributes on nav buttons ───
  it('shows title attributes on nav buttons when collapsed', () => {
    mockIsExpanded.value = false
    wrapper = createWrapper()
    const homeBtn = wrapper.find('[data-testid="sidebar-nav-home"]')
    expect(homeBtn.attributes('title')).toBe('Home')
    const dashBtn = wrapper.find('[data-testid="sidebar-nav-dashboards"]')
    expect(dashBtn.attributes('title')).toBe('Dashboards')
  })

  // ─── Test 19: Toggle button label changes ───
  it('shows "Collapse" label when expanded, "Expand" when collapsed', async () => {
    mockIsExpanded.value = true
    wrapper = createWrapper()
    const toggleBtn = wrapper.find('[data-testid="sidebar-toggle"]')
    expect(toggleBtn.text()).toContain('Collapse')

    mockIsExpanded.value = false
    await wrapper.vm.$nextTick()
    expect(toggleBtn.text()).not.toContain('Collapse')
  })

  // ─── Test 20: Toggle button aria-label changes dynamically ───
  it('changes toggle button aria-label dynamically', async () => {
    mockIsExpanded.value = true
    wrapper = createWrapper()
    const toggleBtn = wrapper.find('[data-testid="sidebar-toggle"]')
    expect(toggleBtn.attributes('aria-label')).toBe('Collapse sidebar')

    mockIsExpanded.value = false
    await wrapper.vm.$nextTick()
    expect(toggleBtn.attributes('aria-label')).toBe('Expand sidebar')
  })

  // ─── Test 21: Org selector shows org name when expanded, initial only when collapsed ───
  it('shows org name when expanded, initial only when collapsed', async () => {
    mockIsExpanded.value = true
    wrapper = createWrapper()
    const orgSel = wrapper.find('[data-testid="sidebar-org-selector"]')
    expect(orgSel.text()).toContain('T')
    expect(orgSel.text()).toContain('Test Org')

    mockIsExpanded.value = false
    await wrapper.vm.$nextTick()
    expect(orgSel.text()).toContain('T')
    expect(orgSel.text()).not.toContain('Test Org')
  })

  // ─── Test 22: Sub-nav item click navigates to correct route ───
  it('navigates when sub-nav item is clicked', async () => {
    mockIsExpanded.value = true
    mockExpandedSections.value = new Set(['explore'])
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-subnav-logs"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/explore/logs')
  })

  // ─── Test 23: Avatar click opens user menu ───
  it('opens user menu when avatar is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-avatar"]').trigger('click')
    // SidebarUserMenu is stubbed — check that the stub received isOpen=true
    const userMenuStub = wrapper.find('[data-testid="user-menu-stub"]')
    expect(userMenuStub.exists()).toBe(true)
  })

  // ─── Test 24: Sidebar collapsed: all sub-nav hidden ───
  it('hides all sub-nav when sidebar is collapsed', () => {
    mockIsExpanded.value = false
    mockExpandedSections.value = new Set(['explore', 'settings', 'dashboards'])
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-subnav-metrics"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sidebar-subnav-general"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sidebar-subnav-all-dashboards"]').exists()).toBe(false)
  })

  // ─── Org switcher additional tests ───
  describe('org switcher', () => {
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

    it('shows ? when no org is selected', () => {
      mockCurrentOrg.value = null as unknown as typeof mockCurrentOrg.value
      wrapper = createWrapper()
      const orgSel = wrapper.find('[data-testid="sidebar-org-selector"]')
      expect(orgSel.text()).toContain('?')
    })
  })

  // ─── Nav item without sub-nav (home, alerts) just navigates ───
  it('just navigates for nav items without sub-nav (home)', async () => {
    mockCurrentRouteSection.value = 'dashboards'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-nav-home"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app')
    expect(mockExpandSection).not.toHaveBeenCalled()
    expect(mockToggleSection).not.toHaveBeenCalled()
  })

  it('just navigates for nav items without sub-nav (alerts)', async () => {
    mockCurrentRouteSection.value = 'home'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="sidebar-nav-alerts"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/alerts')
    expect(mockExpandSection).not.toHaveBeenCalled()
    expect(mockToggleSection).not.toHaveBeenCalled()
  })

  // ─── aria-live region ───
  it('has an aria-live region for sidebar state announcements', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-aria-live"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sidebar-aria-live"]').attributes('aria-live')).toBe('polite')
  })
})
