import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { DashboardSpec } from '../utils/dashboardSpec'

// --- Hoisted mocks ---

const mockSaveDashboardSpec = vi.hoisted(() => vi.fn())
const mockValidateDashboardSpec = vi.hoisted(() => vi.fn())
const mockQueryDataSource = vi.hoisted(() => vi.fn())

vi.mock('../utils/dashboardSpec', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/dashboardSpec')>()
  return {
    ...actual,
    saveDashboardSpec: mockSaveDashboardSpec,
    validateDashboardSpec: mockValidateDashboardSpec,
  }
})

vi.mock('../api/datasources', () => ({
  queryDataSource: mockQueryDataSource,
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: ref('org-1'),
  }),
}))

vi.mock('../composables/useDatasource', () => ({
  useDatasource: () => ({
    datasources: ref([{ id: 'ds-1', name: 'VictoriaMetrics', type: 'victoriametrics' }]),
  }),
}))

// Stub RouterLink to avoid router dependency
const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

// --- Import component after mocks ---

import DashboardSpecPreview from './DashboardSpecPreview.vue'

// --- Helpers ---

function makeSpec(overrides?: Partial<DashboardSpec>): DashboardSpec {
  return {
    title: 'Test Dashboard',
    description: 'A test description',
    panels: [
      {
        title: 'Requests',
        type: 'line_chart',
        grid_pos: { x: 0, y: 0, w: 6, h: 2 },
        query: { datasource_id: 'ds-1', expr: 'rate(up[5m])' },
      },
      {
        title: 'Errors',
        type: 'stat',
        grid_pos: { x: 6, y: 0, w: 6, h: 2 },
        query: { datasource_id: 'ds-1', expr: 'sum(errors_total)' },
      },
      {
        title: 'CPU',
        type: 'gauge',
        grid_pos: { x: 0, y: 2, w: 4, h: 2 },
        query: { datasource_id: 'ds-1', expr: 'process_cpu_seconds_total' },
      },
    ],
    ...overrides,
  }
}

function mountPreview(spec: DashboardSpec) {
  return mount(DashboardSpecPreview, {
    props: { spec },
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  })
}

// --- Tests ---

describe('DashboardSpecPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: dry-run queries return empty but successful
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      data: { result: [] },
    })
    // Default: validation passes
    mockValidateDashboardSpec.mockReturnValue({ valid: true, errors: [] })
  })

  // T9: Renders spec title and panel count
  it('renders spec title and panel count', () => {
    const spec = makeSpec()
    const wrapper = mountPreview(spec)

    expect(wrapper.text()).toContain('Test Dashboard')
    expect(wrapper.text()).toContain('3 panels')
  })

  // T10: Save button triggers saveDashboardSpec
  it('calls saveDashboardSpec when save button is clicked', async () => {
    mockSaveDashboardSpec.mockResolvedValue('new-dash-id')
    const spec = makeSpec()
    const wrapper = mountPreview(spec)

    const saveBtn = wrapper.find('[data-testid="spec-preview-save-btn"]')
    expect(saveBtn.exists()).toBe(true)
    await saveBtn.trigger('click')
    await flushPromises()

    expect(mockSaveDashboardSpec).toHaveBeenCalledOnce()
    expect(mockSaveDashboardSpec).toHaveBeenCalledWith(spec, 'org-1')
  })

  // T11: Shows validation errors when spec is invalid
  it('shows validation errors and disables save when spec is invalid', async () => {
    mockValidateDashboardSpec.mockReturnValue({
      valid: false,
      errors: ['Panel 1: grid_pos.x + w must be <= 12, got 14'],
    })

    const spec = makeSpec({
      panels: [
        {
          title: 'Wide panel',
          type: 'line_chart',
          grid_pos: { x: 8, y: 0, w: 6, h: 2 },
          query: { datasource_id: 'ds-1', expr: 'up' },
        },
      ],
    })
    const wrapper = mountPreview(spec)

    // Click save to trigger validation
    const saveBtn = wrapper.find('[data-testid="spec-preview-save-btn"]')
    await saveBtn.trigger('click')
    await flushPromises()

    // Validation errors should appear
    expect(wrapper.text()).toContain('grid_pos.x + w must be <= 12')
    // Save button should be disabled after validation errors are set
    expect(saveBtn.attributes('disabled')).toBeDefined()
  })

  // T12: Shows demo badge for demo metrics
  it('shows demo badge when spec contains demo metric expressions', () => {
    const spec = makeSpec({
      panels: [
        {
          title: 'HTTP Requests',
          type: 'line_chart',
          grid_pos: { x: 0, y: 0, w: 12, h: 2 },
          query: { datasource_id: 'ds-1', expr: 'rate(http_requests_total[5m])' },
        },
      ],
    })
    const wrapper = mountPreview(spec)

    expect(wrapper.text()).toContain('Demo dashboard')
  })

  it('does not show demo badge for non-demo metrics', () => {
    const spec = makeSpec({
      panels: [
        {
          title: 'Custom metric',
          type: 'line_chart',
          grid_pos: { x: 0, y: 0, w: 12, h: 2 },
          query: { datasource_id: 'ds-1', expr: 'rate(my_custom_metric[5m])' },
        },
      ],
    })
    const wrapper = mountPreview(spec)

    expect(wrapper.text()).not.toContain('Demo dashboard')
  })
})
