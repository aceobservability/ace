const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

interface GrafanaConnectResponse {
  ok: boolean
  version?: string
  error?: string
}

export interface GrafanaDashboardSummary {
  uid: string
  title: string
  tags?: string[]
}

export async function connectToGrafana(url: string, apiKey: string): Promise<GrafanaConnectResponse> {
  const resp = await fetch(`${API_BASE}/api/grafana/connect`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ url, api_key: apiKey }),
  })
  return resp.json()
}

export async function listGrafanaDashboards(url: string, apiKey: string): Promise<GrafanaDashboardSummary[]> {
  const params = new URLSearchParams({ url, api_key: apiKey })
  const resp = await fetch(`${API_BASE}/api/grafana/dashboards?${params}`, {
    headers: getAuthHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to list Grafana dashboards')
  return resp.json()
}

export async function getGrafanaDashboard(uid: string, url: string, apiKey: string): Promise<string> {
  const params = new URLSearchParams({ url, api_key: apiKey })
  const resp = await fetch(`${API_BASE}/api/grafana/dashboards/${uid}?${params}`, {
    headers: getAuthHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to get Grafana dashboard')
  return resp.text()
}
