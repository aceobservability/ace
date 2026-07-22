import {
  getAllPanels,
  lookupPanel,
  type PanelCategory,
  type PanelQueryMode,
  type PanelRegistration,
} from '@/utils/panelRegistry'

export const BUILTIN_PANEL_TYPES = [
  'line_chart',
  'bar_chart',
  'pie',
  'gauge',
  'stat',
  'table',
  'logs',
  'trace_list',
  'trace_heatmap',
] as const

export type BuiltinPanelType = (typeof BUILTIN_PANEL_TYPES)[number]

export const BUILTIN_TYPE_SET = new Set<string>(BUILTIN_PANEL_TYPES)

export const DEFAULT_GRID_POS = { x: 0, y: 0, w: 6, h: 4 }

/** Matches DashboardGrid minW/minH. */
export const MIN_PANEL_WIDTH = 2
export const MIN_PANEL_HEIGHT = 2
export const MAX_PANEL_WIDTH = 12
export const MAX_PANEL_HEIGHT = 20

export type QuerySignal = 'logs' | 'metrics' | 'traces'

export type PanelTypeOption = {
  value: string
  label: string
  disabled?: boolean
}

export type PanelTypeGroup = {
  id: string
  label: string
  options: PanelTypeOption[]
}

const CATEGORY_ORDER: PanelCategory[] = ['charts', 'stats', 'observability', 'widgets']

const CATEGORY_LABELS: Record<PanelCategory, string> = {
  charts: 'Charts',
  stats: 'Stats',
  observability: 'Observability',
  widgets: 'Widgets',
}

const BUILTIN_OPTIONS: PanelTypeOption[] = [
  { value: 'line_chart', label: 'Line Chart' },
  { value: 'bar_chart', label: 'Bar Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'stat', label: 'Stat' },
  { value: 'table', label: 'Table' },
  { value: 'logs', label: 'Logs' },
  { value: 'trace_list', label: 'Trace List' },
  { value: 'trace_heatmap', label: 'Trace Heatmap' },
]

export function isQuerySignal(value: unknown): value is QuerySignal {
  return value === 'logs' || value === 'metrics' || value === 'traces'
}

export function getDefaultQuerySignal(panelType: string): QuerySignal {
  if (panelType === 'logs') return 'logs'
  if (panelType === 'trace_list' || panelType === 'trace_heatmap') return 'traces'
  return 'metrics'
}

export function panelOptionLabel(reg: PanelRegistration): string {
  if (reg.supportStatus === 'unsupported') return `${reg.label} (not supported)`
  if (reg.supportStatus === 'setup_required') return `${reg.label} (setup required)`
  return reg.label
}

export function getQueryMode(panelType: string): PanelQueryMode {
  if (panelType === 'logs') return 'logs'
  if (panelType === 'trace_list' || panelType === 'trace_heatmap') return 'traces'
  if (BUILTIN_TYPE_SET.has(panelType)) return 'metrics'
  return lookupPanel(panelType)?.queryMode ?? 'metrics'
}

export function isSignalDatasourceType(type: string | undefined): boolean {
  return type === 'clickhouse' || type === 'cloudwatch' || type === 'elasticsearch'
}

/** Build category-grouped options for the panel type picker. */
export function buildPanelTypeGroups(): PanelTypeGroup[] {
  const registered = getAllPanels().filter(entry => !BUILTIN_TYPE_SET.has(entry.type))
  const groups: PanelTypeGroup[] = [
    {
      id: 'core',
      label: 'Core',
      options: BUILTIN_OPTIONS,
    },
  ]

  for (const category of CATEGORY_ORDER) {
    const options = registered
      .filter(entry => entry.category === category)
      .map(entry => ({
        value: entry.type,
        label: panelOptionLabel(entry),
        // Still selectable so existing dashboards can open unsupported types for edit;
        // Panel renders an empty state for non-live types.
        disabled: false,
      }))
    if (options.length === 0) continue
    groups.push({
      id: category,
      label: CATEGORY_LABELS[category],
      options,
    })
  }

  return groups
}

export type PanelSizeInput = {
  w: number
  h: number
}

export function normalizePanelSize(w: number, h: number): PanelSizeInput {
  return {
    w: Number.isFinite(w) ? Math.floor(w) : DEFAULT_GRID_POS.w,
    h: Number.isFinite(h) ? Math.floor(h) : DEFAULT_GRID_POS.h,
  }
}

export function validatePanelSize(size: PanelSizeInput): string | null {
  const { w, h } = normalizePanelSize(size.w, size.h)
  if (w < MIN_PANEL_WIDTH || h < MIN_PANEL_HEIGHT) {
    return `Panel size must be at least ${MIN_PANEL_WIDTH}×${MIN_PANEL_HEIGHT}`
  }
  if (w > MAX_PANEL_WIDTH) {
    return `Panel width cannot exceed ${MAX_PANEL_WIDTH} columns`
  }
  if (h > MAX_PANEL_HEIGHT) {
    return `Panel height cannot exceed ${MAX_PANEL_HEIGHT} rows`
  }
  return null
}

export type PanelSaveValidationInput = {
  title: string
  panelType: string
  size: PanelSizeInput
  queryMode: PanelQueryMode
  selectedDatasourceId: string
  queryText: string
  gaugeMin?: number
  gaugeMax?: number
}

/**
 * Validates title, size, and query/datasource requirements before save.
 * Returns an error message or null when valid.
 */
export function validatePanelSave(input: PanelSaveValidationInput): string | null {
  if (!input.title.trim()) {
    return 'Title is required'
  }

  const sizeError = validatePanelSize(input.size)
  if (sizeError) return sizeError

  const queryMode = input.queryMode
  const datasourceId = input.selectedDatasourceId.trim()

  if (queryMode === 'logs' && !datasourceId) {
    return 'Logs datasource is required for logs panels'
  }

  if (queryMode === 'traces' && !datasourceId) {
    return 'Tracing datasource is required for trace panels'
  }

  // Empty query is allowed for metrics (panel shows "No query configured").

  if (
    input.panelType === 'gauge' &&
    typeof input.gaugeMin === 'number' &&
    typeof input.gaugeMax === 'number' &&
    Number.isFinite(input.gaugeMin) &&
    Number.isFinite(input.gaugeMax) &&
    input.gaugeMin >= input.gaugeMax
  ) {
    return 'Gauge max must be greater than min'
  }

  return null
}
