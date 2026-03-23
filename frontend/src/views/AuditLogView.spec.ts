import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// --- Mocks ---

const mockListAuditLog = vi.fn()
const mockExportAuditLog = vi.fn()

vi.mock('../api/audit', () => ({
  listAuditLog: (...args: unknown[]) => mockListAuditLog(...args),
  exportAuditLog: (...args: unknown[]) => mockExportAuditLog(...args),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: ref({ id: 'org-1', name: 'Test Org' }),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/app/audit-log', params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

// Import after mocks
import AuditLogView from './AuditLogView.vue'

const MOCK_ENTRIES = [
  {
    id: 'entry-1',
    organization_id: 'org-1',
    actor_email: 'admin@example.com',
    action: 'login',
    outcome: 'success',
    ip_address: '192.168.1.1',
    created_at: '2026-03-23T10:00:00Z',
  },
  {
    id: 'entry-2',
    organization_id: 'org-1',
    actor_email: 'user@example.com',
    action: 'delete',
    resource_type: 'dashboard',
    resource_name: 'My Dashboard',
    outcome: 'denied',
    ip_address: '10.0.0.5',
    created_at: '2026-03-23T09:30:00Z',
  },
]

describe('AuditLogView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListAuditLog.mockResolvedValue({
      entries: MOCK_ENTRIES,
      total: 2,
      page: 1,
      limit: 50,
    })
    mockExportAuditLog.mockResolvedValue(new Blob(['csv,data'], { type: 'text/csv' }))

    // Stub URL methods used by export
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- 1. Heading ---
  it('renders audit log heading', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const heading = wrapper.find('[data-testid="audit-log-heading"]')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toContain('Audit Log')
  })

  // --- 2. Table rendered with entries ---
  it('renders table when entries are returned', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const table = wrapper.find('[data-testid="audit-log-table"]')
    expect(table.exists()).toBe(true)
  })

  it('renders correct number of rows', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="audit-log-row"]')
    expect(rows).toHaveLength(2)
  })

  it('displays actor email in rows', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    expect(wrapper.text()).toContain('admin@example.com')
    expect(wrapper.text()).toContain('user@example.com')
  })

  it('displays action in rows', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    expect(wrapper.text()).toContain('login')
    expect(wrapper.text()).toContain('delete')
  })

  it('displays outcome badges', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    expect(wrapper.text()).toContain('success')
    expect(wrapper.text()).toContain('denied')
  })

  // --- 3. Empty state ---
  it('shows empty state when no entries are returned', async () => {
    mockListAuditLog.mockResolvedValueOnce({
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
    })

    const wrapper = mount(AuditLogView)
    await flushPromises()

    const emptyState = wrapper.find('[data-testid="empty-state"]')
    expect(emptyState.exists()).toBe(true)
    expect(emptyState.text()).toContain('No audit log entries found')
  })

  it('does NOT show empty state when entries exist', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const emptyState = wrapper.find('[data-testid="empty-state"]')
    expect(emptyState.exists()).toBe(false)
  })

  // --- 4. Export buttons ---
  it('renders CSV export button', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const btn = wrapper.find('[data-testid="export-csv-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('CSV')
  })

  it('renders JSON export button', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const btn = wrapper.find('[data-testid="export-json-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('JSON')
  })

  it('calls exportAuditLog with csv when CSV button is clicked', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    await wrapper.find('[data-testid="export-csv-btn"]').trigger('click')
    await flushPromises()

    expect(mockExportAuditLog).toHaveBeenCalledWith('org-1', 'csv', undefined, undefined)
  })

  it('calls exportAuditLog with json when JSON button is clicked', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    await wrapper.find('[data-testid="export-json-btn"]').trigger('click')
    await flushPromises()

    expect(mockExportAuditLog).toHaveBeenCalledWith('org-1', 'json', undefined, undefined)
  })

  // --- 5. Filter inputs ---
  it('renders actor filter input', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const input = wrapper.find('[data-testid="filter-actor"]')
    expect(input.exists()).toBe(true)
  })

  it('renders action filter dropdown', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const select = wrapper.find('[data-testid="filter-action"]')
    expect(select.exists()).toBe(true)
  })

  it('renders resource type filter input', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const input = wrapper.find('[data-testid="filter-resource-type"]')
    expect(input.exists()).toBe(true)
  })

  it('renders from and to date filters', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    expect(wrapper.find('[data-testid="filter-from"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="filter-to"]').exists()).toBe(true)
  })

  // --- 6. Pagination ---
  it('renders pagination controls when entries exist', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    const pagination = wrapper.find('[data-testid="pagination"]')
    expect(pagination.exists()).toBe(true)
  })

  it('shows page count in pagination', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    expect(wrapper.text()).toContain('Page 1 of 1')
  })

  it('renders prev/next page buttons', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    expect(wrapper.find('[data-testid="prev-page-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="next-page-btn"]').exists()).toBe(true)
  })

  // --- 7. Loading state ---
  it('shows loading state while fetching', async () => {
    // Return a never-resolving promise to keep loading state
    mockListAuditLog.mockReturnValueOnce(new Promise(() => {}))

    const wrapper = mount(AuditLogView)
    // Don't await — the component is in mid-fetch (loading = true)
    // Use nextTick to let Vue render the current state without resolving the promise
    await wrapper.vm.$nextTick()

    const loading = wrapper.find('[data-testid="loading-state"]')
    expect(loading.exists()).toBe(true)
  })

  // --- 8. API call on mount ---
  it('calls listAuditLog on mount with org ID', async () => {
    const wrapper = mount(AuditLogView)
    await flushPromises()

    expect(mockListAuditLog).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ page: 1, limit: 50 }),
    )
    wrapper.unmount()
  })

  // --- 9. Error state ---
  it('shows error banner when listAuditLog throws', async () => {
    mockListAuditLog.mockRejectedValueOnce(new Error('Admin or auditor access required'))

    const wrapper = mount(AuditLogView)
    await flushPromises()

    const errorBanner = wrapper.find('[data-testid="error-banner"]')
    expect(errorBanner.exists()).toBe(true)
    expect(errorBanner.text()).toContain('Admin or auditor access required')
  })
})
