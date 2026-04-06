import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/app/dashboards/new/ai' }),
  useRouter: () => ({ push: mockPush }),
}))

const mockRegisterContext = vi.fn()
vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: { value: null },
    registerContext: mockRegisterContext,
    deregisterContext: vi.fn(),
  }),
}))

vi.mock('../components/DashboardSpecPreview.vue', () => ({
  default: {
    name: 'DashboardSpecPreview',
    props: ['spec'],
    emits: ['saved'],
    template: '<div data-testid="spec-preview">{{ spec.title }}</div>',
  },
}))

const mockProviders = ref<Array<{ id: string; display_name: string }>>([
  { id: 'p1', display_name: 'OpenAI' },
])
const mockSelectedProviderId = ref('p1')
vi.mock('../composables/useAIProvider', () => ({
  useAIProvider: () => ({
    fetchProviders: vi.fn().mockResolvedValue(undefined),
    fetchModels: vi.fn().mockResolvedValue(undefined),
    providers: mockProviders,
    selectedProviderId: mockSelectedProviderId,
  }),
}))

vi.mock('../composables/useOrganization', async () => {
  const { ref } = await import('vue')
  return {
    useOrganization: () => ({
      currentOrg: ref({ id: 'org-1' }),
      currentOrgId: ref('org-1'),
    }),
  }
})

const mockGenerate = vi.fn()
const mockCancel = vi.fn()
const mockIsGenerating = ref(false)
const mockGenError = ref<string | null>(null)
const mockToolStatuses = ref<Array<{ name: string; status: string }>>([])
const mockProgressText = ref('')

vi.mock('../composables/useDashboardGeneration', () => ({
  useDashboardGeneration: () => ({
    generate: mockGenerate,
    cancel: mockCancel,
    isGenerating: mockIsGenerating,
    error: mockGenError,
    toolStatuses: mockToolStatuses,
    progressText: mockProgressText,
  }),
}))

vi.mock('../composables/useCopilotTools', () => ({
  getToolsForDatasourceType: vi.fn().mockReturnValue([]),
}))

const mockListDataSources = vi.fn()
vi.mock('../api/datasources', () => ({
  listDataSources: (...args: unknown[]) => mockListDataSources(...args),
}))

import DashboardGenView from './DashboardGenView.vue'

describe('DashboardGenView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsGenerating.value = false
    mockGenError.value = null
    mockToolStatuses.value = []
    mockProgressText.value = ''
    mockProviders.value = [{ id: 'p1', display_name: 'OpenAI' }]
    mockListDataSources.mockResolvedValue([
      { id: 'ds-1', name: 'VictoriaMetrics', type: 'victoriametrics' },
      { id: 'ds-2', name: 'Loki', type: 'loki' },
    ])
    mockGenerate.mockResolvedValue({ spec: null, content: null })
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders describe step with heading', async () => {
    const wrapper = mount(DashboardGenView)
    await flushPromises()
    expect(wrapper.text()).toContain('What do you want to monitor?')
  })

  it('shows suggestion chips', async () => {
    const wrapper = mount(DashboardGenView)
    await flushPromises()
    expect(wrapper.text()).toContain('API latency')
    expect(wrapper.text()).toContain('K8s cluster health')
  })

  it('has a text input for the description', async () => {
    const wrapper = mount(DashboardGenView)
    await flushPromises()
    expect(wrapper.find('[data-testid="gen-describe-input"]').exists()).toBe(true)
  })

  it('has a generate button that is disabled when input is empty', async () => {
    const wrapper = mount(DashboardGenView)
    await flushPromises()
    const btn = wrapper.find('[data-testid="gen-generate-btn"]')
    expect(btn.exists()).toBe(true)
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('transitions to generate step on button click', async () => {
    mockGenerate.mockImplementation(() => new Promise(() => {})) // never resolves
    const wrapper = mount(DashboardGenView)
    await flushPromises()

    await wrapper.find('[data-testid="gen-describe-input"]').setValue('Monitor API latency')
    await wrapper.find('[data-testid="gen-generate-btn"]').trigger('click')
    await flushPromises()

    expect(mockGenerate).toHaveBeenCalled()
  })

  it('shows review step with spec preview after generation completes', async () => {
    mockGenerate.mockResolvedValue({
      spec: { title: 'Test Dashboard', panels: [] },
      content: null,
    })

    const wrapper = mount(DashboardGenView)
    await flushPromises()

    await wrapper.find('[data-testid="gen-describe-input"]').setValue('Monitor API latency')
    await wrapper.find('[data-testid="gen-generate-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="spec-preview"]').exists()).toBe(true)
  })

  it('registers command context on mount', async () => {
    mount(DashboardGenView)
    await flushPromises()
    expect(mockRegisterContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: 'Dashboard Generation',
      }),
    )
  })

  it('clicking a suggestion chip fills the input', async () => {
    const wrapper = mount(DashboardGenView)
    await flushPromises()

    const chip = wrapper.find('[data-testid="gen-suggestion-chip"]')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')

    const input = wrapper.find('[data-testid="gen-describe-input"]')
    expect((input.element as HTMLInputElement).value).not.toBe('')
  })

  it('shows datasource dropdown when multiple datasources exist', async () => {
    const wrapper = mount(DashboardGenView)
    await flushPromises()

    expect(wrapper.find('[data-testid="gen-datasource-select"]').exists()).toBe(true)
  })

  it('hides dropdown and auto-selects when single datasource', async () => {
    mockListDataSources.mockResolvedValue([
      { id: 'ds-1', name: 'VictoriaMetrics', type: 'victoriametrics' },
    ])

    const wrapper = mount(DashboardGenView)
    await flushPromises()

    expect(wrapper.find('[data-testid="gen-datasource-select"]').exists()).toBe(false)
  })

  it('shows "No datasources" warning with settings link when zero DS', async () => {
    mockListDataSources.mockResolvedValue([])

    const wrapper = mount(DashboardGenView)
    await flushPromises()

    expect(wrapper.text()).toContain('No datasources configured')
    expect(wrapper.text()).toContain('Add one in Settings')
  })

  it('shows "No AI provider" warning when providers is empty', async () => {
    mockProviders.value = []

    const wrapper = mount(DashboardGenView)
    await flushPromises()

    expect(wrapper.find('[data-testid="gen-no-provider-warning"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No AI provider configured')
  })

  it('persists selected datasource to localStorage on generate', async () => {
    mockGenerate.mockResolvedValue({ spec: null, content: null })

    const wrapper = mount(DashboardGenView)
    await flushPromises()

    await wrapper.find('[data-testid="gen-describe-input"]').setValue('Test')
    await wrapper.find('[data-testid="gen-generate-btn"]').trigger('click')
    await flushPromises()

    expect(localStorage.getItem('ace:lastDatasource:org-1')).toBeTruthy()
  })

  it('restores datasource from localStorage on mount', async () => {
    localStorage.setItem('ace:lastDatasource:org-1', 'ds-2')

    const wrapper = mount(DashboardGenView)
    await flushPromises()

    const select = wrapper.find('[data-testid="gen-datasource-select"]')
    expect((select.element as HTMLSelectElement).value).toBe('ds-2')
  })
})
