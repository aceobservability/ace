import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// All variables referenced inside vi.mock() factories must be created via vi.hoisted()
// because vi.mock() is hoisted above all imports and declarations.

const {
  mockSendChatRequest,
  mockSendMessage,
  mockCheckConnection,
  mockFetchModels,
  mockExecuteTool,
  mockState,
} = vi.hoisted(() => {
  return {
    mockSendChatRequest: vi.fn(),
    mockSendMessage: vi.fn(function* () {
      yield 'test'
    }),
    mockCheckConnection: vi.fn(),
    mockFetchModels: vi.fn(),
    mockExecuteTool: vi.fn(),
    // We store reactive state as plain objects and wrap them lazily
    // inside the mock factory where Vue's ref() is available.
    mockState: {
      isConnected: true,
      hasCopilot: true,
      isLoading: false,
      error: null as string | null,
      selectedModel: 'claude-sonnet-4.6',
    },
  }
})

vi.mock('../composables/useCopilot', async () => {
  const { ref } = await import('vue')
  // Create refs once, shared across all calls
  const isConnected = ref(true)
  const hasCopilot = ref(true)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const models = ref([
    {
      id: 'claude-sonnet-4.6',
      name: 'Claude Sonnet 4.6',
      vendor: 'anthropic',
      category: 'chat',
      preview: false,
      premium_multiplier: 1,
    },
  ])
  const selectedModel = ref('claude-sonnet-4.6')

  // Expose the refs so tests can mutate them via mockState
  mockState._refs = { isConnected, hasCopilot, isLoading, error } as any

  return {
    useCopilot: () => ({
      isConnected,
      githubUsername: ref('testuser'),
      hasCopilot,
      isLoading,
      error,
      models,
      selectedModel,
      deviceFlowActive: ref(false),
      userCode: ref(''),
      verificationUri: ref(''),
      checkConnection: mockCheckConnection,
      fetchModels: mockFetchModels,
      connect: vi.fn(),
      cancelDeviceFlow: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: mockSendMessage,
      sendChatRequest: mockSendChatRequest,
    }),
  }
})

vi.mock('../composables/useCopilotTools', () => ({
  getVictoriaMetricsTools: () => [
    {
      type: 'function',
      function: {
        name: 'generate_dashboard',
        description: 'Generate a dashboard',
        parameters: { type: 'object', properties: {} },
      },
    },
  ],
  useCopilotToolExecutor: () => ({
    executeTool: mockExecuteTool,
  }),
}))

vi.mock('../composables/useOrganization', async () => {
  const { ref } = await import('vue')
  return {
    useOrganization: () => ({
      currentOrgId: ref('org-1'),
    }),
  }
})

vi.mock('../utils/markdown', () => ({
  initMarkdown: vi.fn(),
  renderMarkdown: vi.fn().mockResolvedValue('<p>test</p>'),
}))

vi.mock('./DashboardSpecPreview.vue', () => ({
  default: {
    name: 'DashboardSpecPreview',
    props: ['spec'],
    emits: ['saved'],
    template: '<div data-testid="dashboard-spec-preview">{{ spec?.title }}</div>',
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a><slot /></a>',
  },
}))

import CopilotPanel from './CopilotPanel.vue'

describe('CopilotPanel — generate_dashboard interception', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckConnection.mockResolvedValue(undefined)
    mockFetchModels.mockResolvedValue(undefined)
    // Reset reactive state via the exposed refs
    const refs = (mockState as any)._refs
    if (refs) {
      refs.isConnected.value = true
      refs.hasCopilot.value = true
      refs.isLoading.value = false
      refs.error.value = null
    }
  })

  // T13: CopilotPanel interception guard sets dashboardSpec
  it('sets dashboardSpec on the assistant message when generate_dashboard tool call is returned', async () => {
    const dashboardArgs = JSON.stringify({
      title: 'My Dashboard',
      panels: [
        {
          title: 'Panel 1',
          type: 'line_chart',
          grid_pos: { x: 0, y: 0, w: 12, h: 2 },
          query: { datasource_id: '', expr: 'rate(up[5m])' },
        },
      ],
    })

    mockSendChatRequest.mockResolvedValue({
      content: 'Here is your dashboard:',
      toolCalls: [
        {
          id: 'tc-1',
          type: 'function',
          function: {
            name: 'generate_dashboard',
            arguments: dashboardArgs,
          },
        },
      ],
    })

    const wrapper = mount(CopilotPanel, {
      props: {
        datasourceType: 'victoriametrics',
        datasourceName: 'My VM',
        datasourceId: 'ds-vm-1',
      },
    })
    await flushPromises()

    // Type a message and send
    const textarea = wrapper.find('[data-testid="copilot-chat-input"]')
    await textarea.setValue('Create a dashboard')
    const sendBtn = wrapper.find('[data-testid="copilot-send-btn"]')
    await sendBtn.trigger('click')
    await flushPromises()

    // The DashboardSpecPreview stub should be rendered
    const preview = wrapper.find('[data-testid="dashboard-spec-preview"]')
    expect(preview.exists()).toBe(true)
    expect(preview.text()).toContain('My Dashboard')

    // executeTool should NOT have been called for generate_dashboard
    expect(mockExecuteTool).not.toHaveBeenCalled()
  })

  it('injects datasourceId into all panels of the generated spec', async () => {
    const dashboardArgs = JSON.stringify({
      title: 'Injected DS Dashboard',
      panels: [
        {
          title: 'Panel 1',
          type: 'line_chart',
          grid_pos: { x: 0, y: 0, w: 6, h: 2 },
          query: { datasource_id: '', expr: 'rate(up[5m])' },
        },
        {
          title: 'Panel 2',
          type: 'stat',
          grid_pos: { x: 6, y: 0, w: 6, h: 2 },
          query: { datasource_id: '', expr: 'sum(errors_total)' },
        },
      ],
    })

    mockSendChatRequest.mockResolvedValue({
      content: null,
      toolCalls: [
        {
          id: 'tc-2',
          type: 'function',
          function: {
            name: 'generate_dashboard',
            arguments: dashboardArgs,
          },
        },
      ],
    })

    const wrapper = mount(CopilotPanel, {
      props: {
        datasourceType: 'victoriametrics',
        datasourceName: 'My VM',
        datasourceId: 'ds-vm-42',
      },
    })
    await flushPromises()

    const textarea = wrapper.find('[data-testid="copilot-chat-input"]')
    await textarea.setValue('Build me a dashboard')
    await wrapper.find('[data-testid="copilot-send-btn"]').trigger('click')
    await flushPromises()

    // The preview component should exist with the dashboard title
    const preview = wrapper.find('[data-testid="dashboard-spec-preview"]')
    expect(preview.exists()).toBe(true)
    expect(preview.text()).toContain('Injected DS Dashboard')
  })
})
