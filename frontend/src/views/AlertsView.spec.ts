import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'

const mockRegisterContext = vi.fn()
const mockDeregisterContext = vi.fn()

vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: ref(null),
    registerContext: mockRegisterContext,
    deregisterContext: mockDeregisterContext,
  }),
}))

vi.mock('../composables/useAlertManager', () => ({
  createSilence: vi.fn(),
  expireSilence: vi.fn(),
  fetchAlertManagerAlerts: vi.fn().mockResolvedValue([]),
  fetchReceivers: vi.fn().mockResolvedValue([]),
  fetchSilences: vi.fn().mockResolvedValue([]),
}))

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    user: ref({ email: 'test@example.com', name: 'Test User' }),
  }),
}))

// Start empty so the watcher fires when we populate it
const mockAlertingDatasources = ref<{ id: string; name: string; type: string }[]>([])

vi.mock('../composables/useDatasource', () => ({
  useDatasource: () => ({
    alertingDatasources: mockAlertingDatasources,
    fetchDatasources: vi.fn(() => {
      // Simulate fetching datasources by populating the ref
      mockAlertingDatasources.value = [{ id: 'ds-1', name: 'VMAlert', type: 'vmalert' }]
    }),
  }),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: ref({ id: 'org-1', name: 'Test Org' }),
  }),
}))

vi.mock('../composables/useVMAlert', () => ({
  fetchAlerts: vi.fn().mockResolvedValue({
    data: {
      alerts: [
        { name: 'HighCPU', state: 'firing', labels: { severity: 'critical' }, activeAt: '2026-03-22T10:00:00Z' },
        { name: 'DiskFull', state: 'pending', labels: { severity: 'warning' }, activeAt: '2026-03-22T09:30:00Z' },
        { name: 'MemoryOK', state: 'inactive', labels: {}, activeAt: '' },
      ],
    },
  }),
  fetchGroups: vi.fn().mockResolvedValue({
    data: { groups: [] },
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/app/alerts' }),
  useRouter: () => ({ push: vi.fn() }),
}))

import AlertsView from './AlertsView.vue'

describe('AlertsView', () => {
  beforeEach(() => {
    mockRegisterContext.mockClear()
    mockDeregisterContext.mockClear()
    // Reset to empty — each test will trigger population via fetchDatasources called in onMounted
    mockAlertingDatasources.value = []
  })

  async function createWrapper() {
    const wrapper = mount(AlertsView, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    })
    // onMounted calls fetchDatasources which populates mockAlertingDatasources
    // -> watcher on alertingDatasources fires and sets selectedDatasourceId
    // -> watcher on selectedDatasourceId fires and calls loadData (async)
    await flushPromises()
    await nextTick()
    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('renders table header with expected columns', async () => {
    const wrapper = await createWrapper()
    const headers = wrapper.findAll('[data-testid="alert-table-header"] th')
    expect(headers.length).toBeGreaterThanOrEqual(4)
    const headerTexts = headers.map((h) => h.text().toLowerCase())
    expect(headerTexts).toContain('status')
    expect(headerTexts).toContain('alert')
  })

  it('renders alert rows from fetched data', async () => {
    const wrapper = await createWrapper()
    const rows = wrapper.findAll('[data-testid="alert-row"]')
    expect(rows.length).toBe(3)
  })

  it('renders StatusDot per alert row', async () => {
    const wrapper = await createWrapper()
    const dots = wrapper.findAllComponents({ name: 'StatusDot' })
    expect(dots.length).toBe(3)
  })

  it('expands a row on click to show detail', async () => {
    const wrapper = await createWrapper()
    const rows = wrapper.findAll('[data-testid="alert-row"]')
    expect(rows.length).toBe(3)
    await rows[0].trigger('click')
    await nextTick()
    const detail = wrapper.find('[data-testid="alert-detail"]')
    expect(detail.exists()).toBe(true)
  })

  it('renders AI insight card when firing alerts exist', async () => {
    const wrapper = await createWrapper()
    const aiCard = wrapper.findComponent({ name: 'AiInsightCard' })
    expect(aiCard.exists()).toBe(true)
  })

  it('registers command context on mount', async () => {
    await createWrapper()
    expect(mockRegisterContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: 'Alerts',
      }),
    )
  })
})
