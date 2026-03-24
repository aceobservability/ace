import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// --- Hoisted mock functions (no Vue refs here) ---

const mockSendChatRequest = vi.hoisted(() => vi.fn())
const mockFetchModels = vi.hoisted(() => vi.fn())
const mockExecuteTool = vi.hoisted(() => vi.fn())
const mockGetToolsForDatasourceType = vi.hoisted(() => vi.fn().mockReturnValue([]))

// --- Shared reactive state (created after Vue import above) ---

const mockChatMessages = ref<Array<{ role: string; content: string }>>([])
const mockModels = ref<Array<{ id: string; name: string }>>([])
const mockSelectedModel = ref('')
const mockIsLoading = ref(false)
const mockError = ref<string | null>(null)

vi.mock('../composables/useCopilot', () => ({
  useCopilot: () => ({
    sendChatRequest: mockSendChatRequest,
    chatMessages: mockChatMessages,
    models: mockModels,
    selectedModel: mockSelectedModel,
    fetchModels: mockFetchModels,
    isLoading: mockIsLoading,
    error: mockError,
  }),
}))

vi.mock('../composables/useCopilotTools', () => ({
  getMetricsTools: () => [],
  getToolsForDatasourceType: mockGetToolsForDatasourceType,
  useCopilotToolExecutor: () => ({
    executeTool: mockExecuteTool,
  }),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: ref({ id: 'org-1', name: 'Test Org' }),
  }),
}))

vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: ref(null),
  }),
}))

vi.mock('../utils/markdown', () => ({
  initMarkdown: vi.fn().mockResolvedValue(undefined),
  renderMarkdown: vi.fn().mockResolvedValue('<p>rendered</p>'),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

// --- Import component after mocks ---

import CmdKChatView from './CmdKChatView.vue'

// --- Helpers ---

const defaultProps = {
  initialQuery: 'show me metrics',
  datasourceType: 'victoriametrics',
  datasourceName: 'VictoriaMetrics',
  datasourceId: 'ds-1',
}

function createWrapper(props = defaultProps) {
  return mount(CmdKChatView, {
    props,
    global: {
      stubs: {
        DashboardSpecPreview: {
          name: 'DashboardSpecPreview',
          template: '<div data-testid="dashboard-spec-preview">Preview</div>',
          props: ['spec'],
        },
      },
    },
  })
}

// --- Tests ---

describe('CmdKChatView', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    mockChatMessages.value = []
    mockModels.value = []
    mockSelectedModel.value = ''
    mockIsLoading.value = false
    mockError.value = null
    // Default: sendChatRequest resolves with no tool calls
    mockSendChatRequest.mockResolvedValue({ content: 'Hello!', toolCalls: [] })
    mockFetchModels.mockResolvedValue(undefined)
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  // --- 1. Sends initial query via sendChatRequest on mount ---
  it('sends initial query via sendChatRequest on mount', async () => {
    wrapper = createWrapper()
    await flushPromises()

    expect(mockSendChatRequest).toHaveBeenCalledOnce()
    expect(mockSendChatRequest).toHaveBeenCalledWith(
      'victoriametrics',
      'VictoriaMetrics',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'show me metrics' }),
      ]),
      expect.any(Array),
    )
  })

  // --- 2. Shows user message text in chat ---
  it('shows user message text in chat', async () => {
    wrapper = createWrapper()
    await flushPromises()

    // The initial query should have been pushed to chatMessages
    expect(
      mockChatMessages.value.some((m) => m.role === 'user' && m.content === 'show me metrics'),
    ).toBe(true)
    // And rendered in the DOM
    expect(wrapper.text()).toContain('show me metrics')
  })

  // --- 3. Emits exit-chat when back button clicked ---
  it('emits exit-chat when back button clicked', async () => {
    wrapper = createWrapper()
    await flushPromises()

    const backBtn = wrapper.find('[data-testid="chat-back-btn"]')
    expect(backBtn.exists()).toBe(true)
    await backBtn.trigger('click')

    expect(wrapper.emitted('exit-chat')).toBeTruthy()
    expect(wrapper.emitted('exit-chat')!.length).toBe(1)
  })

  // --- 4. Disables textarea when loading ---
  it('disables textarea when loading', async () => {
    mockIsLoading.value = true
    // Prevent the initial handleSend from completing
    mockSendChatRequest.mockImplementation(() => new Promise(() => {}))
    wrapper = createWrapper()
    await flushPromises()

    const textarea = wrapper.find('[data-testid="chat-input"]')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('disabled')).toBeDefined()
  })

  // --- 5. Shows error message when error exists ---
  it('shows error message when error exists', async () => {
    // Let the initial send complete, then set error after
    mockSendChatRequest.mockResolvedValue({ content: 'Hi', toolCalls: [] })
    wrapper = createWrapper()
    await flushPromises()

    // Simulate an error occurring (e.g. from a follow-up request)
    mockError.value = 'Something went wrong'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Something went wrong')
  })

  // --- 6. Shows model selector when models available ---
  it('shows model selector when models available', async () => {
    mockModels.value = [
      { id: 'model-1', name: 'Claude Sonnet' },
      { id: 'model-2', name: 'GPT-4o' },
    ]
    wrapper = createWrapper()
    await flushPromises()

    const modelSelector = wrapper.find('[data-testid="model-selector"]')
    expect(modelSelector.exists()).toBe(true)
  })

  it('does not show model selector when no models available', async () => {
    mockModels.value = []
    wrapper = createWrapper()
    await flushPromises()

    const modelSelector = wrapper.find('[data-testid="model-selector"]')
    expect(modelSelector.exists()).toBe(false)
  })

  // --- 7. Calls fetchModels on mount ---
  it('calls fetchModels on mount', async () => {
    wrapper = createWrapper()
    await flushPromises()

    expect(mockFetchModels).toHaveBeenCalledOnce()
  })

  // --- 8. System message with datasource info ---
  it('prepends system message with datasource info when datasourceId is set', async () => {
    wrapper = createWrapper()
    await flushPromises()

    const call = mockSendChatRequest.mock.calls[0]!
    const messages = call[2] as Array<{ role: string; content: string }>
    const systemMsg = messages.find((m) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg!.content).toContain('ds-1')
    expect(systemMsg!.content).toContain('VictoriaMetrics')
  })

  // --- 9. System message without datasource ---
  it('prepends system message instructing list_datasources when datasourceId is empty', async () => {
    wrapper = createWrapper({
      ...defaultProps,
      datasourceId: '',
      datasourceType: '',
      datasourceName: '',
    })
    await flushPromises()

    const call = mockSendChatRequest.mock.calls[0]!
    const messages = call[2] as Array<{ role: string; content: string }>
    const systemMsg = messages.find((m) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg!.content).toContain('list_datasources')
  })

  // --- 10. Uses getToolsForDatasourceType ---
  it('uses getToolsForDatasourceType with correct type', async () => {
    wrapper = createWrapper()
    await flushPromises()

    expect(mockGetToolsForDatasourceType).toHaveBeenCalledWith('victoriametrics')
  })
})
