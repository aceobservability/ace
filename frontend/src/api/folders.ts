import type { CreateFolderRequest, Folder, UpdateFolderRequest } from '../types/folder'
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
  if (error.error) {
    return error.error
  }
  return fallback
}

export async function listFolders(orgId: string): Promise<Folder[]> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/folders`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch folders'))
  }

  return response.json()
}

export async function getFolder(id: string): Promise<Folder> {
  const response = await fetch(`${API_BASE}/api/folders/${id}`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    if (response.status === 404) {
      throw new Error('Folder not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch folder'))
  }

  return response.json()
}

export async function createFolder(orgId: string, data: CreateFolderRequest): Promise<Folder> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/folders`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not authorized to create folders in this organization')
    }
    throw new Error(await getErrorMessage(response, 'Failed to create folder'))
  }

  return response.json()
}

export async function updateFolder(id: string, data: UpdateFolderRequest): Promise<Folder> {
  const response = await fetch(`${API_BASE}/api/folders/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not authorized to update this folder')
    }
    if (response.status === 404) {
      throw new Error('Folder not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to update folder'))
  }

  return response.json()
}

export async function deleteFolder(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/folders/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not authorized to delete this folder')
    }
    if (response.status === 404) {
      throw new Error('Folder not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to delete folder'))
  }
}
