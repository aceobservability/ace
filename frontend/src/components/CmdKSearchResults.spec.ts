import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as dashboardApi from '../api/dashboards'
import CmdKSearchResults from './CmdKSearchResults.vue'

// --- Mocks ---

const mockIsConnected = ref(false)

vi.mock('../composables/useCopilot', () => ({
  useCopilot: () => ({
    isConnected: mockIsConnected,
  }),
}))

const mockCurrentOrgId = ref<string | null>('org-1')

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: mockCurrentOrgId,
  }),
}))

vi.mock('../api/dashboards')

const mockDashboards = [
  {
    id: 'dash-1',
    title: 'API Metrics',
    description: 'Tracks API performance',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'dash-2',
    title: 'Infrastructure Overview',
    description: 'System health dashboard',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'dash-3',
    title: 'User Analytics',
    description: 'API usage analytics',
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
]

const iconStubs = {
  LayoutGrid: { template: '<span class="icon-layout-grid" />' },
  Sparkles: { template: '<span class="icon-sparkles" />' },
}

describe('CmdKSearchResults', () => {
  let wrapper: VueWrapper

  function createWrapper(props: { query: string } = { query: '' }) {
    return mount(CmdKSearchResults, {
      props,
      global: { stubs: iconStubs },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentOrgId.value = 'org-1'
    mockIsConnected.value = false
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  // --- 1. Shows all dashboards when query is empty ---
  it('shows all dashboards when query is empty', async () => {
    wrapper = createWrapper({ query: '' })
    await flushPromises()

    expect(wrapper.find('[data-testid="search-result-dash-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-result-dash-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-result-dash-3"]').exists()).toBe(true)
  })

  // --- 2. Filters dashboards by title match ---
  it('filters dashboards by title match', async () => {
    wrapper = createWrapper({ query: 'API' })
    await flushPromises()

    // "API Metrics" matches title, "User Analytics" matches description ("API usage")
    expect(wrapper.find('[data-testid="search-result-dash-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-result-dash-2"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="search-result-dash-3"]').exists()).toBe(true)
  })

  // --- 3. Shows empty state when no results match ---
  it('shows empty state when no results match', async () => {
    wrapper = createWrapper({ query: 'zzz-nonexistent' })
    await flushPromises()

    expect(wrapper.find('[data-testid="search-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-empty"]').text()).toContain('No results found')
  })

  // --- 4. Shows "Ask Copilot" when connected and query non-empty ---
  it('shows "Ask Copilot" when connected and query non-empty', async () => {
    mockIsConnected.value = true
    wrapper = createWrapper({ query: 'metrics' })
    await flushPromises()

    const askCopilot = wrapper.find('[data-testid="ask-copilot-option"]')
    expect(askCopilot.exists()).toBe(true)
  })

  // --- 5. Does NOT show "Ask Copilot" when not connected ---
  it('does NOT show "Ask Copilot" when not connected', async () => {
    mockIsConnected.value = false
    wrapper = createWrapper({ query: 'metrics' })
    await flushPromises()

    expect(wrapper.find('[data-testid="ask-copilot-option"]').exists()).toBe(false)
  })

  // --- 5b. Does NOT show "Ask Copilot" when connected but query is empty ---
  it('does NOT show "Ask Copilot" when connected but query is empty', async () => {
    mockIsConnected.value = true
    wrapper = createWrapper({ query: '' })
    await flushPromises()

    expect(wrapper.find('[data-testid="ask-copilot-option"]').exists()).toBe(false)
  })

  // --- 6. Emits navigate with path when result clicked ---
  it('emits navigate with path when result clicked', async () => {
    wrapper = createWrapper({ query: '' })
    await flushPromises()

    await wrapper.find('[data-testid="search-result-dash-1"]').trigger('click')

    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual(['/app/dashboards/dash-1'])
  })

  // --- 7. Emits enter-chat with query when Ask Copilot clicked ---
  it('emits enter-chat with query when Ask Copilot clicked', async () => {
    mockIsConnected.value = true
    wrapper = createWrapper({ query: 'show me metrics' })
    await flushPromises()

    await wrapper.find('[data-testid="ask-copilot-option"]').trigger('click')

    expect(wrapper.emitted('enter-chat')).toBeTruthy()
    expect(wrapper.emitted('enter-chat')![0]).toEqual(['show me metrics'])
  })

  // --- 8. Handles listDashboards failure gracefully ---
  it('handles listDashboards failure gracefully (shows empty state)', async () => {
    vi.mocked(dashboardApi.listDashboards).mockRejectedValue(new Error('Network error'))

    wrapper = createWrapper({ query: '' })
    await flushPromises()

    // Should not crash — should show empty state
    expect(wrapper.find('[data-testid="search-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-empty"]').text()).toContain('No results found')
  })

  // --- 9. Filters are case-insensitive ---
  it('filters case-insensitively', async () => {
    wrapper = createWrapper({ query: 'api' })
    await flushPromises()

    // "API Metrics" and "User Analytics" (description: "API usage analytics") match
    expect(wrapper.find('[data-testid="search-result-dash-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-result-dash-3"]').exists()).toBe(true)
  })

  // --- 10. Re-filters when query prop changes ---
  it('re-filters when query prop changes', async () => {
    wrapper = createWrapper({ query: '' })
    await flushPromises()

    expect(wrapper.findAll('[data-testid^="search-result-"]').length).toBe(3)

    await wrapper.setProps({ query: 'Infrastructure' })

    expect(wrapper.findAll('[data-testid^="search-result-"]').length).toBe(1)
    expect(wrapper.find('[data-testid="search-result-dash-2"]').exists()).toBe(true)
  })
})
