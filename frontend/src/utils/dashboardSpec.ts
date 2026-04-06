import { createDashboard, deleteDashboard } from '../api/dashboards'
import { createPanel } from '../api/panels'
import type { GridPos } from '../types/panel'

// --- Types ---

const VALID_PANEL_TYPES = ['line_chart', 'bar_chart', 'gauge', 'stat', 'table', 'pie'] as const
export type PanelType = (typeof VALID_PANEL_TYPES)[number]

export interface DashboardSpec {
  title: string
  description?: string
  panels: PanelSpec[]
}

export interface PanelSpec {
  title: string
  type: PanelType
  grid_pos: GridPos
  query: {
    datasource_id: string // injected by frontend, AI omits this
    expr: string
    signal?: 'metrics' | 'logs' | 'traces'
    legend_format?: string
  }
}

// --- Validation ---

const GRID_COLUMNS = 12

export function validateDashboardSpec(
  spec: DashboardSpec,
  knownDatasourceIds: string[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Dashboard title must be non-empty
  if (!spec.title || spec.title.trim().length === 0) {
    errors.push('Dashboard title must be non-empty')
  }

  // Panels array must be non-empty
  if (!spec.panels || spec.panels.length === 0) {
    errors.push('Dashboard must have at least one panel')
  }

  if (spec.panels) {
    for (let i = 0; i < spec.panels.length; i++) {
      const panel = spec.panels[i]
      const prefix = `Panel ${i + 1}`

      // Panel title must be non-empty
      if (!panel.title || panel.title.trim().length === 0) {
        errors.push(`${prefix}: title must be non-empty`)
      }

      // Panel type must be valid
      if (!VALID_PANEL_TYPES.includes(panel.type)) {
        errors.push(
          `${prefix}: invalid type "${panel.type}", must be one of: ${VALID_PANEL_TYPES.join(', ')}`,
        )
      }

      // Grid position validation
      if (!panel.grid_pos) {
        errors.push(`${prefix}: grid_pos is required`)
      } else {
        const { x, y, w, h } = panel.grid_pos
        if (x < 0) {
          errors.push(`${prefix}: grid_pos.x must be >= 0, got ${x}`)
        }
        if (y < 0) {
          errors.push(`${prefix}: grid_pos.y must be >= 0, got ${y}`)
        }
        if (w <= 0) {
          errors.push(`${prefix}: grid_pos.w must be > 0, got ${w}`)
        }
        if (h <= 0) {
          errors.push(`${prefix}: grid_pos.h must be > 0, got ${h}`)
        }
        if (x + w > GRID_COLUMNS) {
          errors.push(`${prefix}: grid_pos.x + w must be <= ${GRID_COLUMNS}, got ${x + w}`)
        }
      }

      // Query expression must be non-empty
      if (!panel.query.expr || panel.query.expr.trim().length === 0) {
        errors.push(`${prefix}: query.expr must be non-empty`)
      }

      // Datasource ID must exist in known list
      if (!knownDatasourceIds.includes(panel.query.datasource_id)) {
        errors.push(
          `${prefix}: unknown datasource_id "${panel.query.datasource_id}"`,
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// --- Converter ---

/**
 * Persist a DashboardSpec as a real dashboard with panels.
 *
 * Callers must run {@link validateDashboardSpec} before calling this function.
 * No validation is performed here; invalid specs will result in API errors.
 */
export async function saveDashboardSpec(
  spec: DashboardSpec,
  orgId: string,
): Promise<string> {
  const dashboard = await createDashboard(orgId, {
    title: spec.title,
    description: spec.description,
  })

  const dashboardId = dashboard.id

  try {
    for (const panel of spec.panels) {
      await createPanel(dashboardId, {
        title: panel.title,
        type: panel.type,
        grid_pos: panel.grid_pos,
        query: {
          datasource_id: panel.query.datasource_id,
          expr: panel.query.expr,
          ...(panel.query.signal !== undefined ? { signal: panel.query.signal } : {}),
          ...(panel.query.legend_format !== undefined
            ? { legend_format: panel.query.legend_format }
            : {}),
        },
      })
    }
  } catch (panelError: unknown) {
    // Rollback: delete the dashboard if any panel creation fails
    try {
      await deleteDashboard(dashboardId)
    } catch (rollbackError: unknown) {
      const panelMsg =
        panelError instanceof Error ? panelError.message : String(panelError)
      const rollbackMsg =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      throw new Error(
        `Failed to create panels: ${panelMsg}. Rollback also failed: ${rollbackMsg}`,
      )
    }
    throw panelError
  }

  return dashboardId
}
