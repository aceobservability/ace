import type { Panel, CreatePanelRequest, UpdatePanelRequest } from '../types/panel'
import { trackEvent } from '../analytics'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function listPanels(dashboardId: string): Promise<Panel[]> {
  const response = await fetch(`${API_BASE}/api/dashboards/${dashboardId}/panels`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch panels')
  }
  return response.json()
}

export async function createPanel(dashboardId: string, data: CreatePanelRequest): Promise<Panel> {
  const response = await fetch(`${API_BASE}/api/dashboards/${dashboardId}/panels`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('panel_create_failed', {
      dashboard_id: dashboardId,
      status_code: response.status,
    })
    throw new Error('Failed to create panel')
  }

  const panel = await response.json()
  trackEvent('panel_created', {
    panel_id: panel.id,
    dashboard_id: dashboardId,
    panel_type: panel.type,
  })
  return panel
}

export async function updatePanel(id: string, data: UpdatePanelRequest): Promise<Panel> {
  const response = await fetch(`${API_BASE}/api/panels/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('panel_update_failed', {
      panel_id: id,
      status_code: response.status,
    })
    throw new Error('Failed to update panel')
  }

  const panel = await response.json()
  trackEvent('panel_updated', {
    panel_id: id,
    updated_fields: Object.keys(data),
  })
  return panel
}

export async function deletePanel(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/panels/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    trackEvent('panel_delete_failed', {
      panel_id: id,
      status_code: response.status,
    })
    throw new Error('Failed to delete panel')
  }

  trackEvent('panel_deleted', {
    panel_id: id,
  })
}
