import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import CopilotConnectionPanel from './CopilotConnectionPanel.vue'

const mockIsConnected = ref(false)
const mockGithubUsername = ref('')
const mockHasCopilot = ref(false)
const mockError = ref<string | null>(null)
const mockDeviceFlowActive = ref(false)
const mockUserCode = ref('')
const mockVerificationUri = ref('')
const mockCheckConnection = vi.fn()
const mockConnect = vi.fn()
const mockCancelDeviceFlow = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('../composables/useCopilot', () => ({
  useCopilot: () => ({
    isConnected: mockIsConnected,
    githubUsername: mockGithubUsername,
    hasCopilot: mockHasCopilot,
    error: mockError,
    deviceFlowActive: mockDeviceFlowActive,
    userCode: mockUserCode,
    verificationUri: mockVerificationUri,
    checkConnection: mockCheckConnection,
    connect: mockConnect,
    cancelDeviceFlow: mockCancelDeviceFlow,
    disconnect: mockDisconnect,
  }),
}))

const iconStubs = {
  Github: { template: '<span class="icon-github" />' },
  Loader2: { template: '<span class="icon-loader" />' },
  ClipboardCopy: { template: '<span class="icon-clipboard" />' },
  ExternalLink: { template: '<span class="icon-external" />' },
  Unplug: { template: '<span class="icon-unplug" />' },
  Check: { template: '<span class="icon-check" />' },
  AlertTriangle: { template: '<span class="icon-alert" />' },
}

describe('CopilotConnectionPanel', () => {
  let wrapper: VueWrapper

  function createWrapper(props: { orgId: string } = { orgId: 'org-123' }) {
    return mount(CopilotConnectionPanel, {
      props,
      global: { stubs: iconStubs },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsConnected.value = false
    mockGithubUsername.value = ''
    mockHasCopilot.value = false
    mockError.value = null
    mockDeviceFlowActive.value = false
    mockUserCode.value = ''
    mockVerificationUri.value = ''
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('calls checkConnection on mount', () => {
    wrapper = createWrapper()
    expect(mockCheckConnection).toHaveBeenCalledOnce()
  })

  it('shows connect button when not connected', () => {
    wrapper = createWrapper()
    const btn = wrapper.find('[data-testid="copilot-connect-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('Connect GitHub Copilot')
  })

  it('shows device flow UI when device flow is active', () => {
    mockDeviceFlowActive.value = true
    mockUserCode.value = 'ABCD-1234'
    mockVerificationUri.value = 'https://github.com/login/device'
    wrapper = createWrapper()

    expect(wrapper.find('[data-testid="copilot-user-code"]').text()).toBe('ABCD-1234')
    expect(wrapper.find('[data-testid="copilot-open-github-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="copilot-cancel-btn"]').exists()).toBe(true)
  })

  it('shows connected state with username and badge when has copilot', () => {
    mockIsConnected.value = true
    mockHasCopilot.value = true
    mockGithubUsername.value = 'octocat'
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('octocat')
    expect(wrapper.find('[data-testid="copilot-active-badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="copilot-active-badge"]').text()).toContain('Copilot Active')
    expect(wrapper.find('[data-testid="copilot-disconnect-btn"]').exists()).toBe(true)
  })

  it('shows warning when connected without copilot subscription', () => {
    mockIsConnected.value = true
    mockHasCopilot.value = false
    mockGithubUsername.value = 'octocat'
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('octocat')
    expect(wrapper.text()).toContain('No active Copilot subscription detected')
    expect(wrapper.find('[data-testid="copilot-disconnect-btn"]').exists()).toBe(true)
  })

  it('shows error message when error exists', () => {
    mockError.value = 'Something went wrong'
    wrapper = createWrapper()

    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('connect button calls connect with orgId', async () => {
    wrapper = createWrapper({ orgId: 'org-123' })
    await wrapper.find('[data-testid="copilot-connect-btn"]').trigger('click')
    expect(mockConnect).toHaveBeenCalledWith('org-123')
  })

  it('disconnect button calls disconnect', async () => {
    mockIsConnected.value = true
    mockHasCopilot.value = true
    mockGithubUsername.value = 'octocat'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="copilot-disconnect-btn"]').trigger('click')
    expect(mockDisconnect).toHaveBeenCalledOnce()
  })

  it('cancel button calls cancelDeviceFlow', async () => {
    mockDeviceFlowActive.value = true
    mockUserCode.value = 'ABCD-1234'
    mockVerificationUri.value = 'https://github.com/login/device'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="copilot-cancel-btn"]').trigger('click')
    expect(mockCancelDeviceFlow).toHaveBeenCalledOnce()
  })

  it('does not show connect button when device flow is active', () => {
    mockDeviceFlowActive.value = true
    mockUserCode.value = 'ABCD-1234'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="copilot-connect-btn"]').exists()).toBe(false)
  })

  it('does not show device flow UI when connected', () => {
    mockIsConnected.value = true
    mockHasCopilot.value = true
    mockGithubUsername.value = 'octocat'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="copilot-user-code"]').exists()).toBe(false)
  })

  it('shows error alongside not-connected state', () => {
    mockError.value = 'Connection failed'
    mockIsConnected.value = false
    wrapper = createWrapper()

    expect(wrapper.find('[data-testid="copilot-connect-btn"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Connection failed')
  })

  it('shows error alongside connected state', () => {
    mockError.value = 'Something broke'
    mockIsConnected.value = true
    mockHasCopilot.value = true
    mockGithubUsername.value = 'octocat'
    wrapper = createWrapper()

    expect(wrapper.find('[data-testid="copilot-active-badge"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Something broke')
  })
})
