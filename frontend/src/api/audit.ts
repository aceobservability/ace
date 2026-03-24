const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface AuditLogEntry {
  id: string
  organization_id: string
  actor_id?: string
  actor_email: string
  action: string
  resource_type?: string
  resource_id?: string
  resource_name?: string
  outcome: string
  ip_address?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface AuditLogResponse {
  entries: AuditLogEntry[]
  total: number
  page: number
  limit: number
}

export interface AuditLogParams {
  actor?: string
  action?: string
  resource_type?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export async function listAuditLog(
  orgId: string,
  params?: AuditLogParams,
): Promise<AuditLogResponse> {
  const query = new URLSearchParams()
  if (params?.actor) query.set('actor', params.actor)
  if (params?.action) query.set('action', params.action)
  if (params?.resource_type) query.set('resource_type', params.resource_type)
  if (params?.from) query.set('from', params.from)
  if (params?.to) query.set('to', params.to)
  if (params?.page !== undefined) query.set('page', String(params.page))
  if (params?.limit !== undefined) query.set('limit', String(params.limit))

  const qs = query.toString()
  const url = `${API_BASE}/api/orgs/${orgId}/audit-log${qs ? `?${qs}` : ''}`

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin or auditor access required')
    }
    throw new Error('Failed to fetch audit log')
  }

  return response.json()
}

export async function exportAuditLog(
  orgId: string,
  format: 'csv' | 'json',
  from?: string,
  to?: string,
): Promise<Blob> {
  const query = new URLSearchParams({ format })
  if (from) query.set('from', from)
  if (to) query.set('to', to)

  const url = `${API_BASE}/api/orgs/${orgId}/audit-log/export?${query.toString()}`

  const response = await fetch(url, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin or auditor access required')
    }
    throw new Error('Failed to export audit log')
  }

  return response.blob()
}
