import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import CmdKModal from './CmdKModal.vue'

// --- Mocks ---

const mockContext = ref<{ viewName: string; viewRoute: string; description: string } | null>(null)

vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: mockContext,
  }),
}))

const mockRegister = vi.fn().mockReturnValue(vi.fn())

vi.mock('../composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    register: mockRegister,
  }),
}))

const mockIsConnected = ref(false)
const mockChatMessages = ref<unknown[]>([])
vi.mock('../composables/useCopilot', () => ({
  useCopilot: () => ({
    isConnected: mockIsConnected,
    chatMessages: mockChatMessages,
  }),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: ref({ id: 'org-1' }),
    currentOrgId: ref('org-1'),
  }),
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('CmdKModal', () => {
  let wrapper: VueWrapper

  function createWrapper(props: { isOpen: boolean } = { isOpen: false }) {
    return mount(CmdKModal, {
      props,
      global: {
        stubs: {
          Command: { template: '<span class="icon-command" />' },
          X: { template: '<span class="icon-x" />' },
          CmdKSearchResults: {
            template: '<div data-testid="search-results" />',
            emits: ['navigate', 'enter-chat'],
          },
          CmdKChatView: {
            template: '<div data-testid="chat-view" />',
            emits: ['exit-chat'],
          },
        },
      },
      attachTo: document.body,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.value = null
    mockIsConnected.value = false
    mockChatMessages.value = []
    mockPush.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  // --- 1. Does not render when closed ---
  it('does not show modal content when isOpen is false', () => {
    wrapper = createWrapper({ isOpen: false })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(false)
  })

  // --- 2. Renders when open ---
  it('renders modal content when isOpen is true', () => {
    wrapper = createWrapper({ isOpen: true })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
  })

  // --- 3. Accessibility attributes ---
  it('has role="dialog", aria-modal="true", and aria-label="AI Command"', () => {
    wrapper = createWrapper({ isOpen: true })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-label')).toBe('AI Command')
  })

  // --- 4. Input gets focus when modal opens ---
  it('input field gets focus when modal opens', async () => {
    wrapper = createWrapper({ isOpen: true })
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(document.activeElement).toBe(input.element)
  })

  // --- 5. Escape closes modal ---
  it('pressing Escape emits close event', async () => {
    wrapper = createWrapper({ isOpen: true })

    await wrapper.find('input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close')!.length).toBe(1)
  })

  // --- 6. Shows context pill when context exists ---
  it('shows context pill from useCommandContext when context exists', () => {
    mockContext.value = {
      viewName: 'Metrics Explorer',
      viewRoute: '/app/explore/metrics',
      description: 'Explore metrics',
    }
    wrapper = createWrapper({ isOpen: true })

    expect(wrapper.text()).toContain('Metrics Explorer')
  })

  it('does not show context pill when context is null', () => {
    mockContext.value = null
    wrapper = createWrapper({ isOpen: true })

    // The context pill element should not be present
    const pill = wrapper.find('[data-testid="context-pill"]')
    expect(pill.exists()).toBe(false)
  })

  // --- 7. Clicking backdrop/scrim closes modal ---
  it('clicking the scrim backdrop emits close event', async () => {
    wrapper = createWrapper({ isOpen: true })

    const scrim = wrapper.find('[data-testid="cmdk-scrim"]')
    expect(scrim.exists()).toBe(true)
    await scrim.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close')!.length).toBe(1)
  })

  // --- Input has placeholder ---
  it('input has descriptive placeholder text', () => {
    wrapper = createWrapper({ isOpen: true })
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBeTruthy()
  })

  // --- Max width styling ---
  it('modal dialog has max-width constraint', () => {
    wrapper = createWrapper({ isOpen: true })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.element.style.maxWidth).toBe('640px')
  })

  // --- Orchestrator: search/chat mode switching ---

  it('renders CmdKSearchResults in search mode', () => {
    wrapper = createWrapper({ isOpen: true })
    expect(wrapper.find('[data-testid="search-results"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="chat-view"]').exists()).toBe(false)
  })

  it('switches to chat mode when enter-chat emitted and connected', async () => {
    mockIsConnected.value = true
    wrapper = createWrapper({ isOpen: true })

    const searchResults = wrapper.findComponent('[data-testid="search-results"]')
    searchResults.vm.$emit('enter-chat', 'show me CPU metrics')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="chat-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-results"]').exists()).toBe(false)
  })

  it('shows not-connected message when trying to chat without connection', async () => {
    mockIsConnected.value = false
    wrapper = createWrapper({ isOpen: true })

    const searchResults = wrapper.findComponent('[data-testid="search-results"]')
    searchResults.vm.$emit('enter-chat', 'show me CPU metrics')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="not-connected-message"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="chat-view"]').exists()).toBe(false)
  })

  it('resets mode to search when modal closes', async () => {
    mockIsConnected.value = true
    wrapper = createWrapper({ isOpen: true })

    // Enter chat mode
    const searchResults = wrapper.findComponent('[data-testid="search-results"]')
    searchResults.vm.$emit('enter-chat', 'test query')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="chat-view"]').exists()).toBe(true)

    // Close the modal
    await wrapper.setProps({ isOpen: false })
    await wrapper.vm.$nextTick()

    // Reopen the modal
    await wrapper.setProps({ isOpen: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="search-results"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="chat-view"]').exists()).toBe(false)
  })

  it('navigates and closes modal when navigate event is emitted', async () => {
    wrapper = createWrapper({ isOpen: true })

    const searchResults = wrapper.findComponent('[data-testid="search-results"]')
    searchResults.vm.$emit('navigate', '/app/dashboards/123')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(mockPush).toHaveBeenCalledWith('/app/dashboards/123')
  })
})
