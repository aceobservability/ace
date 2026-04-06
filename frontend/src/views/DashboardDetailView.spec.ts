import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardDetailView from './DashboardDetailView.vue'

// Mock vue-router
const mockRouteParams = { id: 'test-dashboard-id' }
const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: mockRouteParams,
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock useCommandContext
const mockRegisterContext = vi.fn()
const mockDeregisterContext = vi.fn()
vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: { value: null },
    registerContext: mockRegisterContext,
    deregisterContext: mockDeregisterContext,
  }),
}))

// Mock useFavorites
const mockAddRecent = vi.fn()
vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    favorites: { value: [] },
    recentDashboards: { value: [] },
    toggleFavorite: vi.fn(),
    isFavorite: vi.fn(() => false),
    addRecent: mockAddRecent,
    _reset: vi.fn(),
  }),
}))

// Mock useVariables
vi.mock('../composables/useVariables', () => ({
  useVariables: () => ({
    variables: { value: [] },
    hasVariables: { value: false },
    loading: { value: false },
    error: { value: null },
    fetchVariables: vi.fn(),
    setVariableValue: vi.fn(),
    interpolate: (q: string) => q,
    detectCycles: () => [],
  }),
}))

// Mock api functions
const mockDashboard = {
  id: 'test-dashboard-id',
  title: 'Test Dashboard',
  description: 'Test Description',
  created_at: '2026-02-02T00:00:00Z',
  updated_at: '2026-02-02T00:00:00Z',
}

const mockPanels = [
  {
    id: 'panel-1',
    dashboard_id: 'test-dashboard-id',
    title: 'Panel 1',
    type: 'line_chart',
    grid_pos: { x: 0, y: 0, w: 6, h: 3 },
    query: { promql: 'up' },
    created_at: '2026-02-02T00:00:00Z',
    updated_at: '2026-02-02T00:00:00Z',
  },
  {
    id: 'panel-2',
    dashboard_id: 'test-dashboard-id',
    title: 'Panel 2',
    type: 'line_chart',
    grid_pos: { x: 6, y: 0, w: 6, h: 3 },
    query: { promql: 'process_cpu_seconds_total' },
    created_at: '2026-02-02T00:00:00Z',
    updated_at: '2026-02-02T00:00:00Z',
  },
]

vi.mock('../api/dashboards', () => ({
  getDashboard: vi.fn(() => Promise.resolve(mockDashboard)),
}))

vi.mock('../api/panels', () => ({
  listPanels: vi.fn(() => Promise.resolve(mockPanels)),
  deletePanel: vi.fn(() => Promise.resolve()),
  updatePanel: vi.fn(() => Promise.resolve()),
}))

vi.mock('../api/datasources', () => ({
  listDataSources: vi.fn().mockResolvedValue([]),
  createDataSource: vi.fn(),
  updateDataSource: vi.fn(),
  deleteDataSource: vi.fn(),
  queryDataSource: vi.fn().mockResolvedValue({
    status: 'success',
    resultType: 'matrix',
    data: {
      result: [],
    },
  }),
  searchDataSourceTraces: vi.fn().mockResolvedValue([]),
  fetchDataSourceLabelValues: vi.fn().mockResolvedValue([]),
}))

const mockCurrentOrg = {
  value: {
    id: 'org-1',
    name: 'Acme',
    slug: 'acme',
    role: 'admin' as 'admin' | 'editor' | 'viewer' | 'auditor',
    created_at: '2026-02-08T00:00:00Z',
    updated_at: '2026-02-08T00:00:00Z',
  },
}

const mockCurrentOrgId = { value: 'org-1' as string | null }

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: mockCurrentOrg,
    currentOrgId: mockCurrentOrgId,
    fetchOrganizations: vi.fn(() => Promise.resolve()),
  }),
}))

// Mock vue3-grid-layout-next
vi.mock('vue3-grid-layout-next', () => ({
  GridLayout: {
    name: 'GridLayout',
    template: '<div class="grid-layout"><slot /></div>',
    props: [
      'layout',
      'colNum',
      'rowHeight',
      'isDraggable',
      'isResizable',
      'verticalCompact',
      'useCssTransforms',
      'responsive',
      'breakpoints',
      'cols',
    ],
  },
  GridItem: {
    name: 'GridItem',
    template: '<div class="grid-item"><slot /></div>',
    props: ['i', 'x', 'y', 'w', 'h', 'minW', 'minH', 'dragAllowFrom', 'dragIgnoreFrom'],
  },
}))

// Mock useTimeRange
import { computed, ref } from 'vue'

vi.mock('../composables/useTimeRange', () => ({
  useTimeRange: () => ({
    timeRange: computed(() => ({ start: Date.now() - 3600000, end: Date.now() })),
    displayText: computed(() => 'Last 1 hour'),
    selectedPreset: ref('1h'),
    isCustomRange: ref(false),
    customRange: ref(null),
    refreshInterval: computed(() => ({ label: 'Off', value: 'off', interval: 0 })),
    refreshIntervalValue: ref('off'),
    lastRefreshTime: ref(Date.now()),
    isRefreshing: ref(false),
    isPaused: ref(false),
    presets: [],
    refreshIntervals: [],
    onRefresh: vi.fn(() => () => {}),
    cleanup: vi.fn(),
    pauseAutoRefresh: vi.fn(),
    resumeAutoRefresh: vi.fn(),
    setPreset: vi.fn(),
    setCustomRange: vi.fn(),
    setRefreshInterval: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Mock useProm (used by Panel component)
vi.mock('../composables/useProm', () => ({
  fetchMetrics: vi.fn().mockResolvedValue([]),
  fetchLabels: vi.fn().mockResolvedValue([]),
  fetchLabelValues: vi.fn().mockResolvedValue([]),
  useProm: () => ({
    chartData: { value: { series: [] } },
    loading: { value: false },
    error: { value: null },
    fetch: vi.fn(),
  }),
}))

// Mock MonacoQueryEditor component (Monaco doesn't work in test environment)
vi.mock('../components/MonacoQueryEditor.vue', () => ({
  default: {
    name: 'MonacoQueryEditor',
    props: ['modelValue', 'disabled', 'height', 'placeholder'],
    emits: ['update:modelValue', 'submit'],
    template: `
      <textarea
        id="promql-query-input"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
    `,
  },
}))

describe('DashboardDetailView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-02T12:00:00Z'))
    mockCurrentOrg.value.role = 'admin'
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should render dashboard title after loading', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Test Dashboard')
  })

  it('should render panels using grid layout', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    // Should render Panel components (which are inside grid items)
    const panels = wrapper.findAllComponents({ name: 'Panel' })
    expect(panels).toHaveLength(2)
  })

  it('should display loading state initially', () => {
    const wrapper = mount(DashboardDetailView)

    expect(wrapper.text()).toContain('Loading dashboard')
  })

  it('should show back button that navigates to dashboards', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    const backBtn = wrapper
      .findAll('button')
      .find((b) => b.attributes('title') === 'Back to Dashboards')
    expect(backBtn).toBeDefined()

    await backBtn?.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/dashboards')
  })

  it('should show Add Panel button', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('Add Panel'))
    expect(addBtn).toBeDefined()
    expect(addBtn?.text()).toContain('Add Panel')
  })

  it('should hide dashboard permissions button from dashboard header', async () => {
    const adminWrapper = mount(DashboardDetailView)
    await flushPromises()

    expect(adminWrapper.find('[data-testid="dashboard-permissions-button"]').exists()).toBe(false)

    mockCurrentOrg.value.role = 'viewer'
    const viewerWrapper = mount(DashboardDetailView)
    await flushPromises()

    expect(viewerWrapper.find('[data-testid="dashboard-permissions-button"]').exists()).toBe(false)
  })

  it('navigates to dashboard settings view from header button', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    await wrapper.get('[data-testid="dashboard-settings-button"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/dashboards/test-dashboard-id/settings/general')
  })

  it('shows dashboard settings button for viewers and admins', async () => {
    mockCurrentOrg.value.role = 'admin'
    const adminWrapper = mount(DashboardDetailView)
    await flushPromises()
    expect(adminWrapper.find('[data-testid="dashboard-settings-button"]').exists()).toBe(true)

    mockCurrentOrg.value.role = 'viewer'
    const viewerWrapper = mount(DashboardDetailView)
    await flushPromises()
    expect(viewerWrapper.find('[data-testid="dashboard-settings-button"]').exists()).toBe(true)
  })

  it('shows forbidden state for denied dashboard deep link', async () => {
    const { getDashboard } = await import('../api/dashboards')
    vi.mocked(getDashboard).mockRejectedValueOnce(new Error('Not a member of this organization'))

    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('You do not have permission to view this dashboard')
  })

  it('should open panel modal when Add Panel is clicked', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('Add Panel'))
    await addBtn?.trigger('click')

    expect(wrapper.findComponent({ name: 'PanelEditModal' }).exists()).toBe(true)
  })

  it('should render TimeRangePicker', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TimeRangePicker' }).exists()).toBe(true)
  })

  it('should show empty state when no panels', async () => {
    const { listPanels } = await import('../api/panels')
    vi.mocked(listPanels).mockResolvedValueOnce([])

    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('No panels yet')
  })

  it('navigates to traces explorer when a trace row is selected from panel', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    const panel = wrapper.findComponent({ name: 'Panel' })
    panel.vm.$emit('open-trace', { datasourceId: 'ds-trace-1', traceId: 'trace-abc' })
    await flushPromises()

    expect(mockPush).toHaveBeenCalledWith('/explore/traces')
    expect(JSON.parse(localStorage.getItem('dashboard_trace_navigation') || '{}')).toEqual({
      datasourceId: 'ds-trace-1',
      traceId: 'trace-abc',
      createdAt: Date.now(),
    })
  })

  it('registers command context on mount', async () => {
    mount(DashboardDetailView)
    await flushPromises()

    expect(mockRegisterContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: 'Dashboard Detail',
        dashboardId: 'test-dashboard-id',
      }),
    )
  })

  it('adds dashboard to recents on mount', async () => {
    mount(DashboardDetailView)
    await flushPromises()

    expect(mockAddRecent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-dashboard-id',
        title: 'Test Dashboard',
      }),
    )
  })

  it('uses font-display for dashboard title', async () => {
    const wrapper = mount(DashboardDetailView)
    await flushPromises()

    const h1 = wrapper.find('h1')
    expect(h1.classes()).toContain('font-display')
  })
})
