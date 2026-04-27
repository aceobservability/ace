import type { ReplaceResourcePermissionsRequest, ResourcePermissionEntry } from '../types/rbac'
import { API_BASE } from './base'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  const error = (await response.json().catch(() => ({}))) as { error?: string }
  return error.error || fallback
}

export async function listFolderPermissions(folderId: string): Promise<ResourcePermissionEntry[]> {
  const response = await fetch(`${API_BASE}/api/folders/${folderId}/permissions`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Folder not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch folder permissions'))
  }

  return response.json()
}

export async function replaceFolderPermissions(
  folderId: string,
  data: ReplaceResourcePermissionsRequest,
): Promise<ResourcePermissionEntry[]> {
  const response = await fetch(`${API_BASE}/api/folders/${folderId}/permissions`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Folder not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to update folder permissions'))
  }

  return response.json()
}

export async function listDashboardPermissions(
  dashboardId: string,
): Promise<ResourcePermissionEntry[]> {
  const response = await fetch(`${API_BASE}/api/dashboards/${dashboardId}/permissions`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Dashboard not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch dashboard permissions'))
  }

  return response.json()
}

export async function replaceDashboardPermissions(
  dashboardId: string,
  data: ReplaceResourcePermissionsRequest,
): Promise<ResourcePermissionEntry[]> {
  const response = await fetch(`${API_BASE}/api/dashboards/${dashboardId}/permissions`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Dashboard not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to update dashboard permissions'))
  }

  return response.json()
}
