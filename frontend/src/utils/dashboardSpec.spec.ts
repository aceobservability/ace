import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardSpec, PanelType } from './dashboardSpec'
import { saveDashboardSpec, validateDashboardSpec } from './dashboardSpec'

// --- Mocks ---

const mockCreateDashboard = vi.hoisted(() => vi.fn())
const mockDeleteDashboard = vi.hoisted(() => vi.fn())
const mockCreatePanel = vi.hoisted(() => vi.fn())

vi.mock('../api/dashboards', () => ({
  createDashboard: mockCreateDashboard,
  deleteDashboard: mockDeleteDashboard,
}))

vi.mock('../api/panels', () => ({
  createPanel: mockCreatePanel,
}))

// --- Helpers ---

function makeValidSpec(overrides?: Partial<DashboardSpec>): DashboardSpec {
  return {
    title: 'Test Dashboard',
    description: 'A test dashboard',
    panels: [
      {
        title: 'Requests per second',
        type: 'line_chart',
        grid_pos: { x: 0, y: 0, w: 6, h: 2 },
        query: { datasource_id: 'ds-1', expr: 'rate(http_requests_total[5m])' },
      },
      {
        title: 'Error rate',
        type: 'stat',
        grid_pos: { x: 6, y: 0, w: 6, h: 2 },
        query: { datasource_id: 'ds-1', expr: 'sum(rate(errors_total[5m]))' },
      },
      {
        title: 'CPU usage',
        type: 'gauge',
        grid_pos: { x: 0, y: 2, w: 4, h: 2 },
        query: { datasource_id: 'ds-1', expr: 'process_cpu_seconds_total' },
      },
    ],
    ...overrides,
  }
}

// --- Tests ---

describe('validateDashboardSpec', () => {
  // T1: valid spec passes
  it('returns valid: true for a well-formed spec with known datasource ids', () => {
    const spec = makeValidSpec()
    const result = validateDashboardSpec(spec, ['ds-1'])

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  // T2: invalid grid_pos (x + w > 12)
  it('returns valid: false when grid_pos x + w exceeds 12 columns', () => {
    const spec = makeValidSpec({
      panels: [
        {
          title: 'Wide panel',
          type: 'line_chart',
          grid_pos: { x: 8, y: 0, w: 6, h: 2 },
          query: { datasource_id: 'ds-1', expr: 'up' },
        },
      ],
    })
    const result = validateDashboardSpec(spec, ['ds-1'])

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('grid_pos.x + w must be <= 12'))).toBe(true)
  })

  // T3: empty expr
  it('returns valid: false when a panel has an empty expr', () => {
    const spec = makeValidSpec({
      panels: [
        {
          title: 'Empty query panel',
          type: 'line_chart',
          grid_pos: { x: 0, y: 0, w: 6, h: 2 },
          query: { datasource_id: 'ds-1', expr: '' },
        },
      ],
    })
    const result = validateDashboardSpec(spec, ['ds-1'])

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('query.expr must be non-empty'))).toBe(true)
  })

  // T4: unknown datasource_id
  it('returns valid: false when datasource_id is not in the known list', () => {
    const spec = makeValidSpec({
      panels: [
        {
          title: 'Unknown ds panel',
          type: 'line_chart',
          grid_pos: { x: 0, y: 0, w: 6, h: 2 },
          query: { datasource_id: 'unknown-id', expr: 'up' },
        },
      ],
    })
    const result = validateDashboardSpec(spec, ['ds-1'])

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('unknown datasource_id "unknown-id"'))).toBe(true)
  })

  // T5: invalid panel type
  it('returns valid: false when a panel has an invalid type', () => {
    const spec = makeValidSpec({
      panels: [
        {
          title: 'Bad type panel',
          type: 'invalid_type' as unknown as PanelType,
          grid_pos: { x: 0, y: 0, w: 6, h: 2 },
          query: { datasource_id: 'ds-1', expr: 'up' },
        },
      ],
    })
    const result = validateDashboardSpec(spec, ['ds-1'])

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('invalid type "invalid_type"'))).toBe(true)
  })
})

describe('saveDashboardSpec', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // T6: happy path
  it('creates a dashboard and all panels, returning the dashboard id', async () => {
    mockCreateDashboard.mockResolvedValue({
      id: 'dash-1',
      title: 'Test Dashboard',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    mockCreatePanel.mockResolvedValue({
      id: 'panel-1',
      dashboard_id: 'dash-1',
      title: 'Panel',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 2 },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const spec = makeValidSpec()
    const dashboardId = await saveDashboardSpec(spec, 'org-1')

    expect(dashboardId).toBe('dash-1')
    expect(mockCreateDashboard).toHaveBeenCalledOnce()
    expect(mockCreateDashboard).toHaveBeenCalledWith('org-1', {
      title: 'Test Dashboard',
      description: 'A test dashboard',
    })
    // One createPanel call per panel in the spec
    expect(mockCreatePanel).toHaveBeenCalledTimes(spec.panels.length)
    expect(mockDeleteDashboard).not.toHaveBeenCalled()
  })

  // T7: panel failure triggers rollback
  it('rolls back (deletes dashboard) when a panel creation fails', async () => {
    mockCreateDashboard.mockResolvedValue({
      id: 'dash-2',
      title: 'Rollback Dashboard',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    // First panel succeeds, second fails
    mockCreatePanel
      .mockResolvedValueOnce({
        id: 'panel-1',
        dashboard_id: 'dash-2',
        title: 'Panel 1',
        type: 'line_chart',
        grid_pos: { x: 0, y: 0, w: 6, h: 2 },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })
      .mockRejectedValueOnce(new Error('Panel creation failed'))
    mockDeleteDashboard.mockResolvedValue(undefined)

    const spec = makeValidSpec()
    await expect(saveDashboardSpec(spec, 'org-1')).rejects.toThrow('Panel creation failed')

    expect(mockDeleteDashboard).toHaveBeenCalledWith('dash-2')
  })

  // T8: dashboard creation failure
  it('throws and does not create panels when dashboard creation fails', async () => {
    mockCreateDashboard.mockRejectedValue(new Error('Dashboard creation failed'))

    const spec = makeValidSpec()
    await expect(saveDashboardSpec(spec, 'org-1')).rejects.toThrow('Dashboard creation failed')

    expect(mockCreatePanel).not.toHaveBeenCalled()
    expect(mockDeleteDashboard).not.toHaveBeenCalled()
  })
})
