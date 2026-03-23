import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import SidebarRail from './SidebarRail.vue'

const mockRoutePath = ref('/app/dashboards')
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: vi.fn() }),
}))

const mockUser = ref<{ email: string; name?: string } | null>({
  email: 'jane@example.com',
  name: 'Jane Doe',
})
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

describe('SidebarRail', () => {
  let wrapper: VueWrapper

  function createWrapper(props: { activeSection?: string | null } = {}) {
    return mount(SidebarRail, {
      props: {
        activeSection: props.activeSection ?? null,
      },
      global: {
        stubs: {
          Sparkles: { template: '<span class="icon-sparkles" />' },
          LayoutGrid: { template: '<span class="icon-layout-grid" />' },
          Activity: { template: '<span class="icon-activity" />' },
          AlertTriangle: { template: '<span class="icon-alert-triangle" />' },
          Search: { template: '<span class="icon-search" />' },
          Settings: { template: '<span class="icon-settings" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutePath.value = '/app/dashboards'
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders 5 nav icons + settings icon + user avatar', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="rail-home"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-dashboards"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-services"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-alerts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-explore"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-user-avatar"]').exists()).toBe(true)
  })

  it('renders the Ace logo at the top', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="rail-logo"]').exists()).toBe(true)
  })

  it('emits hover event with section ID on mouseenter', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-explore"]').trigger('mouseenter')
    expect(wrapper.emitted('hover')?.[0]).toEqual(['explore'])
  })

  it('emits hoverEnd event on mouseleave', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-explore"]').trigger('mouseleave')
    expect(wrapper.emitted('hoverEnd')).toBeTruthy()
  })

  it('emits click event with section ID on click', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-dashboards"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['dashboards'])
  })

  it('emits avatarClick event when user avatar is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-user-avatar"]').trigger('click')
    expect(wrapper.emitted('avatarClick')).toBeTruthy()
  })

  it('shows active indicator on the active section', () => {
    wrapper = createWrapper({ activeSection: 'explore' })
    const exploreItem = wrapper.find('[data-testid="rail-explore"]')
    expect(exploreItem.find('[data-testid="rail-accent-bar"]').exists()).toBe(true)
  })

  it('does not show accent bar on inactive items', () => {
    wrapper = createWrapper({ activeSection: 'explore' })
    const homeItem = wrapper.find('[data-testid="rail-home"]')
    expect(homeItem.find('[data-testid="rail-accent-bar"]').exists()).toBe(false)
  })

  it('user avatar shows initials from user name', () => {
    wrapper = createWrapper()
    const avatar = wrapper.find('[data-testid="rail-user-avatar"]')
    expect(avatar.text()).toBe('JD')
  })

  it('user avatar shows first letter of email when no name', () => {
    mockUser.value = { email: 'jane@example.com' }
    wrapper = createWrapper()
    const avatar = wrapper.find('[data-testid="rail-user-avatar"]')
    expect(avatar.text()).toBe('J')
  })

  it('rail has tokenized width', () => {
    wrapper = createWrapper()
    const rail = wrapper.find('[data-testid="sidebar-rail"]')
    expect(rail.element.style.width).toBe('var(--sidebar-rail-width)')
  })
})
