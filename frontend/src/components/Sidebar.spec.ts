import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import Sidebar from './Sidebar.vue'

const mockPush = vi.fn()
const mockCurrentOrg = ref({ id: 'org-1' })
const mockUser = ref({ email: 'user@example.com' })

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/dashboards',
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    fetchOrganizations: vi.fn(),
    clearOrganizations: vi.fn(),
    currentOrg: mockCurrentOrg,
  }),
}))

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: mockUser,
  }),
}))

describe('Sidebar', () => {
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    })
  })

  it('keeps toggle button in collapsed header layout', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1000,
    })

    const wrapper = mount(Sidebar, {
      global: {
        stubs: {
          OrganizationDropdown: true,
          CreateOrganizationModal: true,
        },
      },
    })

    const aside = wrapper.find('aside')
    // Collapsed: sidebar with width 48px (not expanded width)
    expect(aside.element.style.width).toBe('48px')

    // Click pin button to expand
    const pinBtn = wrapper.find('[data-testid="sidebar-pin-btn"]')
    await pinBtn.trigger('click')

    // Expanded: sidebar with width 220px
    expect(aside.element.style.width).toBe('220px')
  })

  it('temporarily expands when hovered while collapsed', async () => {
    vi.useFakeTimers()

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1000,
    })

    const wrapper = mount(Sidebar, {
      global: {
        stubs: {
          OrganizationDropdown: true,
          CreateOrganizationModal: true,
        },
      },
    })

    const aside = wrapper.find('aside')
    // Collapsed: sidebar with width 48px (not expanded width)
    expect(aside.element.style.width).toBe('48px')

    await aside.trigger('mouseenter')

    // Hover-expanded: sidebar with width 220px
    expect(aside.element.style.width).toBe('220px')

    await aside.trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(200)

    // Back to collapsed: sidebar with width 48px
    expect(aside.element.style.width).toBe('48px')

    vi.useRealTimers()
  })
})
