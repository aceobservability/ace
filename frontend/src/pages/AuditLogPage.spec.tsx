import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { createTestQueryClient } from '@/test/renderWithProviders'

const mockListAuditLog = vi.hoisted(() => vi.fn())
const mockExportAuditLog = vi.hoisted(() => vi.fn())

vi.mock('@/api/audit', () => ({
  listAuditLog: (...args: unknown[]) => mockListAuditLog(...args),
  exportAuditLog: (...args: unknown[]) => mockExportAuditLog(...args),
}))

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: 'org-1',
    currentOrg: {
      id: 'org-1',
      name: 'Test Org',
      slug: 'test',
      role: 'admin' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    organizations: [],
    selectOrganization: vi.fn(),
    isLoading: false,
    error: null,
  }),
}))

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

function renderPage() {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter([{ path: '/app/audit-log', element: <AuditLogPage /> }], {
    initialEntries: ['/app/audit-log'],
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListAuditLog.mockResolvedValue({
      entries: MOCK_ENTRIES,
      total: 2,
      page: 1,
      limit: 50,
    })
    mockExportAuditLog.mockResolvedValue(new Blob(['csv,data'], { type: 'text/csv' }))
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders audit log heading', async () => {
    renderPage()
    expect((await screen.findByTestId('audit-log-heading')).textContent).toContain('Audit Log')
  })

  it('renders table when entries are returned', async () => {
    renderPage()
    expect(await screen.findByTestId('audit-log-table')).toBeTruthy()
    expect(screen.getAllByTestId('audit-log-row')).toHaveLength(2)
    expect(screen.getByText('admin@example.com')).toBeTruthy()
    expect(screen.getByText('login')).toBeTruthy()
    expect(screen.getByText('success')).toBeTruthy()
  })

  it('shows empty state when no entries are returned', async () => {
    mockListAuditLog.mockResolvedValueOnce({
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
    })
    renderPage()
    expect((await screen.findByTestId('empty-state')).textContent).toContain('No audit log entries found')
  })

  it('renders export buttons and triggers CSV export', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('audit-log-table')

    expect(screen.getByTestId('export-csv-btn')).toBeTruthy()
    expect(screen.getByTestId('export-json-btn')).toBeTruthy()

    await user.click(screen.getByTestId('export-csv-btn'))
    await waitFor(() => {
      expect(mockExportAuditLog).toHaveBeenCalledWith('org-1', 'csv', undefined, undefined)
    })
  })

  it('shows error banner when list fails', async () => {
    mockListAuditLog.mockRejectedValueOnce(new Error('Admin or auditor access required'))
    renderPage()
    expect((await screen.findByTestId('error-banner')).textContent).toContain('Admin or auditor access required')
  })
})
