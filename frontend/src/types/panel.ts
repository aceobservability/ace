export interface GridPos {
  x: number
  y: number
  w: number
  h: number
}

export interface Panel {
  id: string
  dashboard_id: string
  title: string
  type: string
  grid_pos: GridPos
  query?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CreatePanelRequest {
  title: string
  type?: string
  grid_pos: GridPos
  query?: Record<string, unknown>
}

export interface UpdatePanelRequest {
  title?: string
  type?: string
  grid_pos?: GridPos
  query?: Record<string, unknown>
}

export interface RawQueryResult {
  series: Array<{
    name: string
    data: unknown[]
  }>
  logs?: unknown[]
  traces?: unknown[]
}
