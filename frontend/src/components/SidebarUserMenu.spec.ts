import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import SidebarUserMenu from './SidebarUserMenu.vue'

const mockUser = ref({ email: 'jane@example.com', name: 'Jane Doe' })
const mockLogout = vi.fn()
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}))

const mockOrganizations = ref([
  { id: 'org-1', name: 'Acme Corp', role: 'admin' },
  { id: 'org-2', name: 'Side Project', role: 'member' },
])
const mockCurrentOrg = ref({ id: 'org-1', name: 'Acme Corp', role: 'admin' })
const mockSelectOrganization = vi.fn()
vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    organizations: mockOrganizations,
    currentOrg: mockCurrentOrg,
    selectOrganization: mockSelectOrganization,
  }),
}))

describe('SidebarUserMenu', () => {
  let wrapper: VueWrapper

  function createWrapper() {
    return mount(SidebarUserMenu, {
      props: { isOpen: true },
      global: {
        stubs: {
          Check: { template: '<span class="icon-check" />' },
          LogOut: { template: '<span class="icon-logout" />' },
          Keyboard: { template: '<span class="icon-keyboard" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
    mockCurrentOrg.value = { id: 'org-1', name: 'Acme Corp', role: 'admin' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('shows user name and email', () => {
    wrapper = createWrapper()
    const text = wrapper.text()
    expect(text).toContain('Jane Doe')
    expect(text).toContain('jane@example.com')
  })

  it('renders organization list', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="user-menu-org-org-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="user-menu-org-org-2"]').exists()).toBe(true)
  })

  it('shows checkmark on current org', () => {
    wrapper = createWrapper()
    const orgItem = wrapper.find('[data-testid="user-menu-org-org-1"]')
    expect(orgItem.find('.lucide-check').exists()).toBe(true)
  })

  it('does not show checkmark on non-current org', () => {
    wrapper = createWrapper()
    const orgItem = wrapper.find('[data-testid="user-menu-org-org-2"]')
    expect(orgItem.find('.lucide-check').exists()).toBe(false)
  })

  it('calls selectOrganization when clicking an org', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu-org-org-2"]').trigger('click')
    expect(mockSelectOrganization).toHaveBeenCalledWith('org-2')
  })

  it('emits close when org is selected', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu-org-org-2"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('calls logout when logout button is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu-logout"]').trigger('click')
    expect(mockLogout).toHaveBeenCalled()
  })

  it('does not render when isOpen is false', () => {
    wrapper = mount(SidebarUserMenu, {
      props: { isOpen: false },
    })
    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(false)
  })

  it('renders keyboard shortcuts link', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="user-menu-shortcuts"]').exists()).toBe(true)
  })

  it('closes on Escape key', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu"]').trigger('keydown', { key: 'Escape' })
    // The component listens on document, so dispatch there
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
