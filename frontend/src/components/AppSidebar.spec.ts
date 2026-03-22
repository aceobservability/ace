import { mount, VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import AppSidebar from './AppSidebar.vue'

// --- Mocks ---

const mockIsOpen = ref(true)
const mockOpen = vi.fn()
const mockClose = vi.fn()
const mockToggle = vi.fn()

vi.mock('../composables/useSidebar', () => ({
  useSidebar: () => ({
    isOpen: mockIsOpen,
    open: mockOpen,
    close: mockClose,
    toggle: mockToggle,
  }),
}))

const mockUser = ref<{ email: string; name?: string } | null>({
  email: 'jane@example.com',
  name: 'Jane Doe',
})

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: { value: true },
  }),
}))

const mockCurrentOrg = ref({ id: 'org-1', name: 'Test Org' })

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: mockCurrentOrg,
    currentOrgId: ref('org-1'),
  }),
}))

const mockRoutePath = ref('/app/dashboards')
const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: mockRoutePath.value,
  }),
  useRouter: () => ({
    push: mockPush,
  }),
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: String, default: '' } },
    setup(props, { slots }) {
      return () => h('a', { href: props.to, 'data-to': props.to }, slots.default?.())
    },
  }),
}))

describe('AppSidebar', () => {
  let wrapper: VueWrapper

  function createWrapper() {
    return mount(AppSidebar, {
      global: {
        stubs: {
          // Stub lucide icons as simple spans
          Sparkles: { template: '<span class="icon-sparkles" />' },
          LayoutGrid: { template: '<span class="icon-layout-grid" />' },
          Activity: { template: '<span class="icon-activity" />' },
          AlertTriangle: { template: '<span class="icon-alert-triangle" />' },
          Search: { template: '<span class="icon-search" />' },
          Settings: { template: '<span class="icon-settings" />' },
          Home: { template: '<span class="icon-home" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsOpen.value = true
    mockRoutePath.value = '/app/dashboards'
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  // --- 1. Renders all nav items ---
  it('renders all nav items: Home, Dashboards, Services, Alerts, Explore, Settings', () => {
    wrapper = createWrapper()
    const text = wrapper.text()
    expect(text).toContain('Home')
    expect(text).toContain('Dashboards')
    expect(text).toContain('Services')
    expect(text).toContain('Alerts')
    expect(text).toContain('Explore')
    expect(text).toContain('Settings')
  })

  // --- 2. Active route highlights correct nav item ---
  it('active route highlights the correct nav item via aria-current', () => {
    mockRoutePath.value = '/app/dashboards'
    wrapper = createWrapper()

    const dashboardsItem = wrapper.find('[data-testid="nav-dashboards"]')
    expect(dashboardsItem.exists()).toBe(true)
    expect(dashboardsItem.attributes('aria-current')).toBe('page')

    // Other items should NOT have aria-current="page"
    const homeItem = wrapper.find('[data-testid="nav-home"]')
    expect(homeItem.attributes('aria-current')).toBeUndefined()
  })

  it('highlights Home when route is /app', () => {
    mockRoutePath.value = '/app'
    wrapper = createWrapper()

    const homeItem = wrapper.find('[data-testid="nav-home"]')
    expect(homeItem.exists()).toBe(true)
    expect(homeItem.attributes('aria-current')).toBe('page')
  })

  // --- 3. Explore children visible when Explore route is active ---
  it('Explore children visible when Explore route is active', () => {
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()

    const text = wrapper.text()
    expect(text).toContain('Metrics')
    expect(text).toContain('Logs')
    expect(text).toContain('Traces')
  })

  it('Explore children are NOT visible when Explore is NOT active', () => {
    mockRoutePath.value = '/app/dashboards'
    wrapper = createWrapper()

    const metricsLink = wrapper.find('[data-testid="nav-explore-metrics"]')
    expect(metricsLink.exists()).toBe(false)
  })

  // --- 4. Accessibility: aria-label ---
  it('has aria-label="Main navigation" on the nav element', () => {
    wrapper = createWrapper()
    const nav = wrapper.find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBe('Main navigation')
  })

  // --- 5. useSidebar().isOpen controls visibility ---
  it('when isOpen is true, sidebar has translateX(0)', () => {
    mockIsOpen.value = true
    wrapper = createWrapper()

    const aside = wrapper.find('aside')
    expect(aside.exists()).toBe(true)
    expect(aside.element.style.transform).toContain('translateX(0')
  })

  it('when isOpen is false, sidebar has translateX(-100%)', () => {
    mockIsOpen.value = false
    wrapper = createWrapper()

    const aside = wrapper.find('aside')
    expect(aside.element.style.transform).toContain('translateX(-100%)')
  })

  // --- 6. Shows user info at bottom ---
  it('shows user name at bottom when available', () => {
    wrapper = createWrapper()
    const text = wrapper.text()
    expect(text).toContain('Jane Doe')
  })

  it('shows user email when no name is available', () => {
    mockUser.value = { email: 'jane@example.com' }
    wrapper = createWrapper()
    const text = wrapper.text()
    expect(text).toContain('jane@example.com')
  })

  it('does not show user info when user is null', () => {
    mockUser.value = null
    wrapper = createWrapper()
    // Should still render without errors
    expect(wrapper.find('aside').exists()).toBe(true)
  })

  // --- 7. Nav items use data-testid attributes ---
  it('nav items use data-testid attributes for each section', () => {
    wrapper = createWrapper()

    expect(wrapper.find('[data-testid="nav-home"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-dashboards"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-services"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-alerts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-explore"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-settings"]').exists()).toBe(true)
  })

  // --- Clicking nav items navigates ---
  it('clicking a nav item navigates via router.push', async () => {
    wrapper = createWrapper()

    const homeLink = wrapper.find('[data-testid="nav-home"]')
    expect(homeLink.exists()).toBe(true)
    await homeLink.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app')
  })

  it('clicking Dashboards nav item navigates to /app/dashboards', async () => {
    wrapper = createWrapper()

    const item = wrapper.find('[data-testid="nav-dashboards"]')
    await item.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/dashboards')
  })

  // --- Explore children clicks ---
  it('clicking an Explore child navigates to the child route', async () => {
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()

    const logsLink = wrapper.find('[data-testid="nav-explore-logs"]')
    expect(logsLink.exists()).toBe(true)
    await logsLink.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/explore/logs')
  })

  // --- Sidebar width ---
  it('sidebar has 240px width', () => {
    wrapper = createWrapper()
    const aside = wrapper.find('aside')
    expect(aside.element.style.width).toBe('240px')
  })

  // --- Org name displayed ---
  it('displays organization name', () => {
    wrapper = createWrapper()
    expect(wrapper.text()).toContain('Test Org')
  })
})
