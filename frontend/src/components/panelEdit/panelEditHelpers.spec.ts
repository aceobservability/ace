import { beforeEach, describe, expect, it } from 'vitest'
import { ensurePanelTypesRegistered } from '@/components/panels/registerPanelTypes'
import {
  buildPanelTypeGroups,
  DEFAULT_GRID_POS,
  getQueryMode,
  validatePanelSave,
  validatePanelSize,
} from '@/components/panelEdit/panelEditHelpers'
import { clearRegistry } from '@/utils/panelRegistry'

describe('panelEditHelpers', () => {
  beforeEach(() => {
    clearRegistry()
    // ensurePanelTypesRegistered is idempotent via module flag; re-register via clear + force path
    // The register module caches `registered` — call once after clear by resetting through import side effects.
    // For tests we only need types present after first ensure.
    ensurePanelTypesRegistered()
  })

  it('groups panel types into Core + registry categories', () => {
    // Registry may already be populated from module load; ensure still safe
    ensurePanelTypesRegistered()
    const groups = buildPanelTypeGroups()
    const labels = groups.map(group => group.label)
    expect(labels[0]).toBe('Core')
    expect(labels).toContain('Charts')
    expect(labels).toContain('Stats')
    expect(labels).toContain('Observability')
    expect(labels).toContain('Widgets')

    const coreValues = groups[0]!.options.map(option => option.value)
    expect(coreValues).toContain('line_chart')
    expect(coreValues).toContain('logs')

    const chartLabels = groups.find(group => group.id === 'charts')?.options.map(o => o.label) ?? []
    expect(chartLabels).toContain('Heatmap')
    expect(chartLabels.some(text => text.includes('not supported'))).toBe(true)
  })

  it('validates panel size against grid bounds', () => {
    expect(validatePanelSize({ w: 6, h: 4 })).toBeNull()
    expect(validatePanelSize({ w: 1, h: 4 })).toMatch(/at least/)
    expect(validatePanelSize({ w: 13, h: 4 })).toMatch(/width/)
    expect(validatePanelSize({ w: 6, h: 21 })).toMatch(/height/)
  })

  it('requires logs datasource', () => {
    expect(
      validatePanelSave({
        title: 'Logs',
        panelType: 'logs',
        size: DEFAULT_GRID_POS,
        queryMode: 'logs',
        selectedDatasourceId: '',
        queryText: '{job="api"}',
      }),
    ).toBe('Logs datasource is required for logs panels')

    expect(
      validatePanelSave({
        title: 'Logs',
        panelType: 'logs',
        size: DEFAULT_GRID_POS,
        queryMode: 'logs',
        selectedDatasourceId: 'ds-loki',
        queryText: '',
      }),
    ).toBeNull()
  })

  it('allows empty metrics query (configure-later UX)', () => {
    expect(
      validatePanelSave({
        title: 'CPU',
        panelType: 'line_chart',
        size: DEFAULT_GRID_POS,
        queryMode: 'metrics',
        selectedDatasourceId: '',
        queryText: '',
      }),
    ).toBeNull()
  })

  it('requires title', () => {
    expect(
      validatePanelSave({
        title: '   ',
        panelType: 'line_chart',
        size: DEFAULT_GRID_POS,
        queryMode: 'metrics',
        selectedDatasourceId: '',
        queryText: 'up',
      }),
    ).toBe('Title is required')
  })

  it('requires tracing datasource', () => {
    expect(
      validatePanelSave({
        title: 'Traces',
        panelType: 'trace_list',
        size: DEFAULT_GRID_POS,
        queryMode: 'traces',
        selectedDatasourceId: '',
        queryText: '',
      }),
    ).toBe('Tracing datasource is required for trace panels')
  })

  it('resolves query modes for builtin and registry types', () => {
    ensurePanelTypesRegistered()
    expect(getQueryMode('logs')).toBe('logs')
    expect(getQueryMode('trace_list')).toBe('traces')
    expect(getQueryMode('line_chart')).toBe('metrics')
    expect(getQueryMode('text')).toBe('none')
    expect(getQueryMode('flame_graph')).toBe('none')
  })
})
