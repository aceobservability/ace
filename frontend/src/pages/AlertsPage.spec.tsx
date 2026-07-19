import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as alertmanagerApi from '@/api/alertmanager'
import * as datasourcesApi from '@/api/datasources'
import * as vmalertApi from '@/api/vmalert'
import { AlertsPage } from '@/pages/AlertsPage'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { AMSilence, AMStatus, DataSource, VMAlertAlert, VMAlertRuleGroup } from '@/types/datasource'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

const vmalertDatasource: DataSource = {
  id: 'ds-1',
  organization_id: 'org-1',
  name: 'VMAlert',
  type: 'vmalert',
  url: 'http://vmalert:8880',
  is_default: true,
  auth_type: 'none',
  trace_id_field: 'trace_id',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const alertmanagerDatasource: DataSource = {
  id: 'ds-am',
  organization_id: 'org-1',
  name: 'AlertManager',
  type: 'alertmanager',
  url: 'http://alertmanager:9093',
  is_default: false,
  auth_type: 'none',
  trace_id_field: 'trace_id',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockAlerts: VMAlertAlert[] = [
  {
    name: 'HighCPU',
    state: 'firing',
    labels: { severity: 'critical' },
    annotations: {},
    value: '1',
    activeAt: '2026-03-22T10:00:00Z',
  },
  {
    name: 'DiskFull',
    state: 'pending',
    labels: { severity: 'warning' },
    annotations: {},
    value: '1',
    activeAt: '2026-03-22T09:30:00Z',
  },
  {
    name: 'MemoryOK',
    state: 'inactive',
    labels: {},
    annotations: {},
    value: '0',
    activeAt: '',
  },
]

const mockGroups: VMAlertRuleGroup[] = [
  {
    name: 'node.rules',
    file: 'node.yml',
    interval: 30,
    rules: [
      {
        name: 'HighCPU',
        type: 'alerting',
        state: 'firing',
        query: 'cpu > 0.9',
        duration: 60,
        labels: { severity: 'critical' },
        annotations: { summary: 'CPU high' },
      },
    ],
  },
]

const mockAmStatus: AMStatus = {
  cluster: { status: 'ready' },
  versionInfo: { version: '0.27.0' },
  config: {
    original: 'route:\n  receiver: default\nreceivers:\n  - name: default\n',
  },
  uptime: '2026-03-22T08:00:00Z',
}

function renderAlerts() {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [{ path: '/app/alerts', element: <AlertsPage /> }],
    { initialEntries: ['/app/alerts'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('AlertsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useFavoritesStore.setState({ favorites: [], recentDashboards: [] })
    useAuthStore.setState({
      user: {
        id: 'u-1',
        email: 'test@example.com',
        name: 'Test User',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      userOrganizations: [],
      loading: false,
      initialized: true,
      isAuthenticated: true,
    })

    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([vmalertDatasource])
    vi.spyOn(vmalertApi, 'fetchVMAlerts').mockResolvedValue({
      status: 'success',
      data: { alerts: mockAlerts },
    })
    vi.spyOn(vmalertApi, 'fetchVMAlertGroups').mockResolvedValue({
      status: 'success',
      data: { groups: mockGroups },
    })
    vi.spyOn(alertmanagerApi, 'fetchAlertManagerAlerts').mockResolvedValue([])
    vi.spyOn(alertmanagerApi, 'fetchSilences').mockResolvedValue([])
    vi.spyOn(alertmanagerApi, 'fetchReceivers').mockResolvedValue([])
    vi.spyOn(alertmanagerApi, 'fetchAlertManagerStatus').mockResolvedValue(mockAmStatus)
    vi.spyOn(alertmanagerApi, 'createSilence').mockResolvedValue('silence-1')
    vi.spyOn(alertmanagerApi, 'expireSilence').mockResolvedValue()
  })

  it('renders table header with expected columns', async () => {
    renderAlerts()

    await waitFor(() => {
      expect(screen.getByTestId('alert-table-header')).toBeTruthy()
    })

    const headers = screen.getByTestId('alert-table-header').querySelectorAll('th')
    expect(headers.length).toBeGreaterThanOrEqual(4)
    const headerTexts = Array.from(headers).map(h => h.textContent?.toLowerCase() ?? '')
    expect(headerTexts).toContain('status')
    expect(headerTexts).toContain('alert')
  })

  it('renders alert rows from fetched data', async () => {
    renderAlerts()

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-row')).toHaveLength(3)
    })

    expect(screen.getByText('HighCPU')).toBeTruthy()
    expect(screen.getByText('DiskFull')).toBeTruthy()
    expect(screen.getByText('MemoryOK')).toBeTruthy()
  })

  it('renders StatusDot per alert row', async () => {
    renderAlerts()

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-row')).toHaveLength(3)
    })

    const dots = screen.getAllByTestId('status-dot')
    expect(dots.length).toBeGreaterThanOrEqual(3)
  })

  it('expands a row on click to show detail', async () => {
    renderAlerts()

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-row')).toHaveLength(3)
    })

    fireEvent.click(screen.getAllByTestId('alert-row')[0]!)
    expect(screen.getByTestId('alert-detail')).toBeTruthy()
    expect(within(screen.getByTestId('alert-detail')).getByText('firing')).toBeTruthy()
  })

  it('renders AI alert triage when firing alerts exist', async () => {
    renderAlerts()

    await waitFor(() => {
      expect(screen.getByTestId('ai-alert-triage')).toBeTruthy()
    })

    expect(screen.getByText(/1 alert firing/i)).toBeTruthy()
  })

  it('shows rule groups and opens rule editor', async () => {
    const user = userEvent.setup()
    renderAlerts()

    await waitFor(() => {
      expect(screen.getByTestId('alerts-tab-groups')).toBeTruthy()
    })

    await user.click(screen.getByTestId('alerts-tab-groups'))

    await waitFor(() => {
      expect(screen.getByTestId('rule-group')).toBeTruthy()
    })

    expect(screen.getByText('node.rules')).toBeTruthy()
    await user.click(screen.getByText('node.rules'))

    await waitFor(() => {
      expect(screen.getByTestId('rule-item')).toBeTruthy()
    })

    expect(screen.getByText('cpu > 0.9')).toBeTruthy()
    expect(screen.getByText('alerting')).toBeTruthy()

    await user.click(screen.getByTestId('open-rule-editor-HighCPU'))
    expect(screen.getByTestId('rule-editor-modal')).toBeTruthy()
    expect(screen.getByTestId('rule-editor-query').textContent).toContain('cpu > 0.9')
    expect(screen.getByTestId('rule-editor-yaml').textContent).toContain('- alert: HighCPU')
    expect(screen.getByTestId('rule-editor-readonly-notice')).toBeTruthy()
  })

  it('creates and expires Alertmanager silences with mocked API', async () => {
    const user = userEvent.setup()
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([alertmanagerDatasource])

    const silences: AMSilence[] = []
    vi.spyOn(alertmanagerApi, 'fetchSilences').mockImplementation(async () => [...silences])
    vi.spyOn(alertmanagerApi, 'createSilence').mockImplementation(async (_id, silence) => {
      silences.push({
        id: 'silence-1',
        matchers: silence.matchers,
        startsAt: silence.startsAt,
        endsAt: silence.endsAt,
        createdBy: silence.createdBy,
        comment: silence.comment,
        status: { state: 'active' },
        updatedAt: new Date().toISOString(),
      })
      return 'silence-1'
    })
    vi.spyOn(alertmanagerApi, 'expireSilence').mockImplementation(async () => {
      const idx = silences.findIndex(s => s.id === 'silence-1')
      if (idx >= 0) silences[idx] = { ...silences[idx]!, status: { state: 'expired' } }
    })

    renderAlerts()

    await waitFor(() => {
      expect(screen.getByTestId('alerts-tab-am-silences')).toBeTruthy()
    })

    await user.click(screen.getByTestId('alerts-tab-am-silences'))
    await user.click(screen.getByTestId('alerts-new-silence-btn'))

    expect(screen.getByRole('dialog', { name: /create silence/i })).toBeTruthy()

    await user.type(screen.getByTestId('silence-matcher-name-0'), 'alertname')
    await user.type(screen.getByTestId('silence-matcher-value-0'), 'HighCPU')
    await user.type(screen.getByTestId('silence-comment-input'), 'Investigating spike')
    await user.click(screen.getByTestId('silence-create-btn'))

    await waitFor(() => {
      expect(alertmanagerApi.createSilence).toHaveBeenCalledWith(
        'ds-am',
        expect.objectContaining({
          comment: 'Investigating spike',
          createdBy: 'test@example.com',
          matchers: [
            expect.objectContaining({
              name: 'alertname',
              value: 'HighCPU',
              isEqual: true,
              isRegex: false,
            }),
          ],
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('silence-card')).toBeTruthy()
    })

    expect(screen.getByText('Investigating spike')).toBeTruthy()
    await user.click(screen.getByTestId('expire-silence-silence-1'))

    await waitFor(() => {
      expect(alertmanagerApi.expireSilence).toHaveBeenCalledWith('ds-am', 'silence-1')
    })

    await waitFor(() => {
      expect(screen.getByText('expired')).toBeTruthy()
    })
  })

  it('shows Alertmanager configuration from status API', async () => {
    const user = userEvent.setup()
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([alertmanagerDatasource])

    renderAlerts()

    await waitFor(() => {
      expect(screen.getByTestId('alerts-tab-am-config')).toBeTruthy()
    })

    await user.click(screen.getByTestId('alerts-tab-am-config'))

    await waitFor(() => {
      expect(screen.getByTestId('am-config-panel')).toBeTruthy()
    })

    expect(screen.getByTestId('am-config-yaml').textContent).toContain('receiver: default')
    expect(screen.getByTestId('am-version').textContent).toContain('0.27.0')
  })

  it('resets stale datasource selection when org datasources change', async () => {
    const org2Vmalert: DataSource = {
      ...vmalertDatasource,
      id: 'ds-org2',
      organization_id: 'org-2',
      name: 'VMAlert Org2',
    }

    const listSpy = vi
      .spyOn(datasourcesApi, 'listDataSources')
      .mockResolvedValueOnce([vmalertDatasource])
      .mockResolvedValue([org2Vmalert])

    renderAlerts()

    await waitFor(() => {
      expect((screen.getByTestId('alerts-datasource-select') as HTMLSelectElement).value).toBe(
        'ds-1',
      )
    })

    useOrgStore.setState({ currentOrgId: 'org-2' })

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalled()
      expect((screen.getByTestId('alerts-datasource-select') as HTMLSelectElement).value).toBe(
        'ds-org2',
      )
    })
  })

  it('shows empty state when no alerting datasources are configured', async () => {
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([])

    renderAlerts()

    await waitFor(() => {
      expect(screen.getByText('No alerting datasources configured')).toBeTruthy()
    })
  })
})
