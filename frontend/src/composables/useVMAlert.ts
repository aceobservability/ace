import type { VMAlertAlertsResponse, VMAlertGroupsResponse } from '../types/datasource'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function fetchAlerts(datasourceId: string): Promise<VMAlertAlertsResponse> {
  const response = await fetch(`${API_BASE}/api/datasources/${datasourceId}/vmalert/alerts`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to fetch alerts')
  }
  return response.json() as Promise<VMAlertAlertsResponse>
}

export async function fetchGroups(datasourceId: string): Promise<VMAlertGroupsResponse> {
  const response = await fetch(`${API_BASE}/api/datasources/${datasourceId}/vmalert/groups`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to fetch rule groups')
  }
  return response.json() as Promise<VMAlertGroupsResponse>
}
