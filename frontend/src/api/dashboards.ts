import type { Dashboard, CreateDashboardRequest, UpdateDashboardRequest } from '../types/dashboard'
import { trackEvent } from '../analytics'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function listDashboards(orgId: string): Promise<Dashboard[]> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/dashboards`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    throw new Error('Failed to fetch dashboards')
  }
  return response.json()
}

export async function getDashboard(id: string): Promise<Dashboard> {
  const response = await fetch(`${API_BASE}/api/dashboards/${id}`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    throw new Error('Dashboard not found')
  }
  return response.json()
}

export async function createDashboard(orgId: string, data: CreateDashboardRequest): Promise<Dashboard> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/dashboards`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('dashboard_create_failed', {
      org_id: orgId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Not authorized to create dashboards in this organization')
    }
    throw new Error('Failed to create dashboard')
  }

  const dashboard = await response.json()
  trackEvent('dashboard_created', {
    dashboard_id: dashboard.id,
    org_id: orgId,
  })
  return dashboard
}

export async function updateDashboard(id: string, data: UpdateDashboardRequest): Promise<Dashboard> {
  const response = await fetch(`${API_BASE}/api/dashboards/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('dashboard_update_failed', {
      dashboard_id: id,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Not authorized to update this dashboard')
    }
    throw new Error('Failed to update dashboard')
  }

  const dashboard = await response.json()
  trackEvent('dashboard_updated', {
    dashboard_id: id,
    updated_fields: Object.keys(data),
  })
  return dashboard
}

export async function deleteDashboard(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/dashboards/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    trackEvent('dashboard_delete_failed', {
      dashboard_id: id,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Not authorized to delete this dashboard')
    }
    throw new Error('Failed to delete dashboard')
  }

  trackEvent('dashboard_deleted', {
    dashboard_id: id,
  })
}

export async function exportDashboardYaml(id: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/dashboards/${id}/export?format=yaml`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not authorized to export this dashboard')
    }
    throw new Error('Failed to export dashboard')
  }

  const payload = await response.text()
  return new Blob([payload], { type: 'application/x-yaml' })
}

export async function importDashboardYaml(orgId: string, yamlContent: string): Promise<Dashboard> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/dashboards/import?format=yaml`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/x-yaml',
    },
    body: yamlContent,
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not authorized to import dashboards in this organization')
    }
    if (response.status === 400) {
      throw new Error('Invalid YAML dashboard document')
    }
    throw new Error('Failed to import dashboard')
  }

  return response.json()
}
