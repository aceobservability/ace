import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import App from './App.vue'

// Mock composables
const mockIsOpen = ref(true)
vi.mock('./composables/useSidebar', () => ({
  useSidebar: () => ({
    isOpen: mockIsOpen,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
}))

vi.mock('./composables/useAuth', () => ({
  useAuth: () => ({
    user: ref({ email: 'test@test.com' }),
    isAuthenticated: ref(true),
  }),
}))

vi.mock('./composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: ref({ id: 'org-1', name: 'Test' }),
    currentOrgId: ref('org-1'),
    fetchOrganizations: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('./composables/useDatasource', () => ({
  useDatasource: () => ({
    fetchDatasources: vi.fn().mockResolvedValue(undefined),
    metricsDatasources: ref([]),
    alertingDatasources: ref([]),
  }),
}))

vi.mock('./composables/useOrgBranding', () => ({
  useOrgBranding: () => ({}),
}))

vi.mock('./composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    register: vi.fn().mockReturnValue(vi.fn()),
    showHelp: ref(false),
    shortcuts: ref([]),
  }),
}))

vi.mock('./composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: ref(null),
  }),
}))

vi.mock('vue-router', () => ({
  RouterView: {
    name: 'RouterView',
    template: '<div data-testid="router-view">Router View</div>',
  },
  useRoute: () => ({
    path: '/app/dashboards',
    meta: { appLayout: 'app' },
    params: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

describe('App', () => {
  it('renders router view', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          AppSidebar: true,
          CmdKModal: true,
          ShortcutsOverlay: true,
          ToastNotification: true,
          CookieConsentBanner: true,
        },
      },
    })
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })

  it('renders main landmark element', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          AppSidebar: true,
          CmdKModal: true,
          ShortcutsOverlay: true,
          ToastNotification: true,
          CookieConsentBanner: true,
        },
      },
    })
    expect(wrapper.find('main').exists()).toBe(true)
  })

  it('includes AppSidebar component', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          AppSidebar: true,
          CmdKModal: true,
          ShortcutsOverlay: true,
          ToastNotification: true,
          CookieConsentBanner: true,
        },
      },
    })
    expect(wrapper.findComponent({ name: 'AppSidebar' }).exists()).toBe(true)
  })

  it('includes CmdKModal component', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          AppSidebar: true,
          CmdKModal: true,
          ShortcutsOverlay: true,
          ToastNotification: true,
          CookieConsentBanner: true,
        },
      },
    })
    expect(wrapper.findComponent({ name: 'CmdKModal' }).exists()).toBe(true)
  })

  it('shows hamburger button when sidebar is closed', async () => {
    mockIsOpen.value = false
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          AppSidebar: true,
          CmdKModal: true,
          ShortcutsOverlay: true,
          ToastNotification: true,
          CookieConsentBanner: true,
          Menu: { template: '<span />' },
        },
      },
    })
    expect(wrapper.find('[data-testid="sidebar-hamburger"]').exists()).toBe(true)
    mockIsOpen.value = true
  })
})
