import { flushPromises, mount } from '@vue/test-utils'
import DashboardSettingsView from './DashboardSettingsView.vue'

const mockRouteParams = { id: 'dashboard-1', section: 'general' }
const mockPush = vi.fn()
const mockReplace = vi.fn()

const mockGetDashboard = vi.hoisted(() => vi.fn())
const mockUpdateDashboard = vi.hoisted(() => vi.fn())
const mockExportDashboardYaml = vi.hoisted(() => vi.fn())
const mockFetchOrganizations = vi.hoisted(() => vi.fn())

const mockConvertGrafanaDashboard = vi.hoisted(() => vi.fn())

const mockCurrentOrg = {
  value: {
    id: 'org-1',
    name: 'Acme',
    slug: 'acme',
    role: 'admin' as 'admin' | 'editor' | 'viewer',
    created_at: '2026-02-08T00:00:00Z',
    updated_at: '2026-02-08T00:00:00Z',
  },
}

const mockCurrentOrgId = { value: 'org-1' as string | null }

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

vi.mock('../api/dashboards', () => ({
  getDashboard: mockGetDashboard,
  updateDashboard: mockUpdateDashboard,
  exportDashboardYaml: mockExportDashboardYaml,
}))

vi.mock('../api/converter', () => ({
  convertGrafanaDashboard: mockConvertGrafanaDashboard,
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: mockCurrentOrg,
    currentOrgId: mockCurrentOrgId,
    fetchOrganizations: mockFetchOrganizations,
  }),
}))

vi.mock('../components/DashboardPermissionsEditor.vue', () => ({
  default: {
    name: 'DashboardPermissionsEditor',
    template: '<div data-testid="dashboard-permissions-editor"></div>',
    props: ['dashboard', 'orgId'],
  },
}))

const mockDashboard = {
  id: 'dashboard-1',
  title: 'Production Overview',
  description: 'Main prod metrics',
  organization_id: 'org-1',
  created_at: '2026-02-09T00:00:00Z',
  updated_at: '2026-02-09T00:00:00Z',
}

const initialYaml = `schema_version: 1
dashboard:
  title: Production Overview
  description: Main prod metrics
  panels: []
`

describe('DashboardSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteParams.id = 'dashboard-1'
    mockRouteParams.section = 'general'
    mockCurrentOrg.value.role = 'admin'
    localStorage.removeItem('dashboard_view_settings')

    mockGetDashboard.mockResolvedValue({ ...mockDashboard })
    mockUpdateDashboard.mockResolvedValue({ ...mockDashboard })
    mockExportDashboardYaml.mockResolvedValue(new Blob([initialYaml], { type: 'application/x-yaml' }))
    mockFetchOrganizations.mockResolvedValue(undefined)
    mockConvertGrafanaDashboard.mockResolvedValue({
      format: 'yaml',
      content: initialYaml,
      document: {
        schema_version: 1,
        dashboard: { title: 'Production Overview', panels: [] },
      },
      warnings: [],
    })
  })

  it('renders general section with secondary sidebar', async () => {
    const wrapper = mount(DashboardSettingsView)
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-settings-sidebar"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="settings-section-general"]').classes()).toContain('text-emerald-600')
    expect(wrapper.text()).toContain('Dashboard Settings')
  })

  it('navigates sections through sidebar links', async () => {
    const wrapper = mount(DashboardSettingsView)
    await flushPromises()

    await wrapper.get('[data-testid="settings-section-yaml"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/dashboards/dashboard-1/settings/yaml')
  })

  it('redirects invalid section routes to general', async () => {
    mockRouteParams.section = 'invalid'

    mount(DashboardSettingsView)
    await flushPromises()

    expect(mockReplace).toHaveBeenCalledWith('/dashboards/dashboard-1/settings/general')
  })

  it('hides permissions section for viewers and redirects direct permissions route', async () => {
    mockCurrentOrg.value.role = 'viewer'
    mockRouteParams.section = 'permissions'

    const wrapper = mount(DashboardSettingsView)
    await flushPromises()

    expect(mockReplace).toHaveBeenCalledWith('/dashboards/dashboard-1/settings/general')
    expect(wrapper.find('[data-testid="settings-section-permissions"]').exists()).toBe(false)
  })

  it('saves general settings and persists dashboard view preferences', async () => {
    const wrapper = mount(DashboardSettingsView)
    await flushPromises()

    await wrapper.get('#dashboard-name').setValue('Updated Overview')
    await wrapper.get('#dashboard-refresh').setValue('30s')
    await wrapper.get('#dashboard-variables').setValue('env,cluster')
    await wrapper.get('[data-testid="save-dashboard-settings"]').trigger('click')
    await flushPromises()

    expect(mockUpdateDashboard).toHaveBeenCalledWith('dashboard-1', {
      title: 'Updated Overview',
      description: 'Main prod metrics',
    })

    const storedSettings = JSON.parse(localStorage.getItem('dashboard_view_settings') || '{}')
    expect(storedSettings['dashboard-1']).toEqual({
      timeRangePreset: '1h',
      refreshInterval: '30s',
      variables: ['env', 'cluster'],
    })
  })

  it('renders dashboard permissions editor inline on permissions section', async () => {
    mockRouteParams.section = 'permissions'

    const wrapper = mount(DashboardSettingsView)
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-permissions-editor"]').exists()).toBe(true)
  })
})
