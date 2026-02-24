import type { AMAlert, AMSilence, AMSilenceCreate, AMReceiver } from '../types/datasource'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function fetchAlertManagerAlerts(
  datasourceId: string,
  filters: { active: boolean; silenced: boolean; inhibited: boolean },
): Promise<AMAlert[]> {
  const params = new URLSearchParams({
    active: String(filters.active),
    silenced: String(filters.silenced),
    inhibited: String(filters.inhibited),
  })
  const response = await fetch(
    `${API_BASE}/api/datasources/${datasourceId}/alertmanager/alerts?${params}`,
    { headers: getAuthHeaders() },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to fetch alerts')
  }
  return response.json() as Promise<AMAlert[]>
}

export async function fetchSilences(datasourceId: string): Promise<AMSilence[]> {
  const response = await fetch(
    `${API_BASE}/api/datasources/${datasourceId}/alertmanager/silences`,
    { headers: getAuthHeaders() },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to fetch silences')
  }
  return response.json() as Promise<AMSilence[]>
}

export async function createSilence(
  datasourceId: string,
  silence: AMSilenceCreate,
): Promise<string> {
  const response = await fetch(
    `${API_BASE}/api/datasources/${datasourceId}/alertmanager/silences`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(silence),
    },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to create silence')
  }
  const result = (await response.json()) as { silenceID: string }
  return result.silenceID
}

export async function expireSilence(datasourceId: string, silenceId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/datasources/${datasourceId}/alertmanager/silences/${silenceId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to expire silence')
  }
}

export async function fetchReceivers(datasourceId: string): Promise<AMReceiver[]> {
  const response = await fetch(
    `${API_BASE}/api/datasources/${datasourceId}/alertmanager/receivers`,
    { headers: getAuthHeaders() },
  )
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to fetch receivers')
  }
  return response.json() as Promise<AMReceiver[]>
}
