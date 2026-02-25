import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
    // Collapsed: w-16 (narrow)
    expect(aside.classes()).toContain('w-16')
    expect(aside.classes()).not.toContain('w-58')

    // Click toggle button (Expand/Collapse title button)
    const toggleBtn = wrapper.findAll('button').find(b =>
      b.attributes('title') === 'Expand' || b.attributes('title') === 'Collapse'
    )!
    await toggleBtn.trigger('click')

    // Expanded: w-58 (wide)
    expect(aside.classes()).toContain('w-58')
    expect(aside.classes()).not.toContain('w-16')
  })

  it('temporarily expands when hovered while collapsed', async () => {
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
    // Collapsed: w-16
    expect(aside.classes()).toContain('w-16')

    await aside.trigger('mouseenter')

    // Hover-expanded: w-58
    expect(aside.classes()).toContain('w-58')

    await aside.trigger('mouseleave')

    // Back to collapsed: w-16
    expect(aside.classes()).toContain('w-16')
  })
})
