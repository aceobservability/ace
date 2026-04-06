const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface Variable {
  id: string
  dashboard_id: string
  name: string
  type: string
  label?: string
  query?: string
  multi: boolean
  include_all: boolean
  sort_order: number
}

interface CreateVariableRequest {
  name: string
  type: string
  label?: string
  query?: string
  multi: boolean
  include_all: boolean
  sort_order: number
}

export async function listVariables(dashboardId: string): Promise<Variable[]> {
  const resp = await fetch(`${API_BASE}/api/dashboards/${dashboardId}/variables`, {
    headers: getAuthHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to fetch variables')
  return resp.json()
}

export async function bulkCreateVariables(dashboardId: string, variables: CreateVariableRequest[]): Promise<Variable[]> {
  const resp = await fetch(`${API_BASE}/api/dashboards/${dashboardId}/variables`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ variables }),
  })
  if (!resp.ok) throw new Error('Failed to create variables')
  return resp.json()
}

async function updateVariable(varId: string, data: Partial<CreateVariableRequest>): Promise<Variable> {
  const resp = await fetch(`${API_BASE}/api/variables/${varId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('Failed to update variable')
  return resp.json()
}

async function deleteVariable(varId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/variables/${varId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to delete variable')
}
