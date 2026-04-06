export interface DashboardVariable {
  name: string
  type: string
  label?: string
  query?: string
  multi?: boolean
  include_all?: boolean
}

interface DashboardPanelResource {
  title: string
  type: string
  position: { x: number; y: number; w: number; h: number }
  datasource?: { name?: string; type: string }
  query?: Record<string, unknown>
  display?: Record<string, unknown>
}

export interface DashboardDocument {
  version: number
  title: string
  description?: string
  panels: DashboardPanelResource[]
}

export interface PanelDiagnostic {
  index: number
  title: string
  original_type: string
  mapped_type: string
  status: 'mapped' | 'unsupported' | 'partial'
  warning?: string
  has_query: boolean
  field_overrides_dropped?: number
}

export interface ConversionReport {
  total_panels: number
  mapped_panels: number
  unsupported_panels: number
  partial_panels: number
  variables_found: number
  fidelity_percent: number
  panel_diagnostics: PanelDiagnostic[]
}

export interface GrafanaConvertResponse {
  format: 'json' | 'yaml'
  content: string
  document: DashboardDocument
  warnings: string[]
  report?: ConversionReport
}
