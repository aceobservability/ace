import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import App from './App.vue'

// Mock composables — useSidebar no longer exports isOpen/open/close/toggle
vi.mock('./composables/useSidebar', () => ({
  useSidebar: () => ({
    hoveredSection: ref(null),
    pinnedSection: ref(null),
    isPeeking: ref(false),
    activeFlyoutSection: ref(null),
    currentRouteSection: ref('dashboards'),
    handleMouseEnter: vi.fn(),
    handleMouseLeave: vi.fn(),
    pinSection: vi.fn(),
    closeFlyout: vi.fn(),
    _reset: vi.fn(),
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

  it('applies 52px left margin when sidebar is shown', () => {
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
    const main = wrapper.find('main')
    expect(main.element.style.marginLeft).toBe('52px')
  })
})
