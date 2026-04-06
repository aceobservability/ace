const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json()
    return data?.error || fallback
  } catch {
    return fallback
  }
}

export interface AIProviderInfo {
  id: string
  provider_type: string
  display_name: string
  base_url: string
  enabled: boolean
  models_override?: Array<{ id: string; name: string }>
  created_at: string
  updated_at: string
}

export interface CreateProviderRequest {
  provider_type: string
  display_name: string
  base_url: string
  api_key?: string
  enabled?: boolean
  models_override?: Array<{ id: string; name: string }>
}

export interface UpdateProviderRequest {
  display_name?: string
  base_url?: string
  api_key?: string
  enabled?: boolean
  models_override?: Array<{ id: string; name: string }>
}

interface AIModel {
  id: string
  name: string
  vendor: string
  category: string
  meta?: Record<string, unknown>
}

export async function listAIProviders(orgId: string): Promise<AIProviderInfo[]> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/providers`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch AI providers')
  }
  return response.json()
}

export async function createAIProvider(
  orgId: string,
  data: CreateProviderRequest,
): Promise<AIProviderInfo> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/providers`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to create AI provider'))
  }
  return response.json()
}

export async function updateAIProvider(
  orgId: string,
  providerId: string,
  data: UpdateProviderRequest,
): Promise<AIProviderInfo> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/providers/${providerId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to update AI provider'))
  }
  return response.json()
}

export async function deleteAIProvider(orgId: string, providerId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/providers/${providerId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to delete AI provider'))
  }
}

export async function testAIProvider(
  orgId: string,
  providerId: string,
): Promise<{ success: boolean; models_count?: number; error?: string }> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/providers/${providerId}/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to test AI provider'))
  }
  return response.json()
}

export async function listAIModels(orgId: string, providerId?: string): Promise<AIModel[]> {
  const params = new URLSearchParams()
  if (providerId) {
    params.set('provider_id', providerId)
  }
  const qs = params.toString()

  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/models${qs ? `?${qs}` : ''}`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch AI models')
  }
  const data = await response.json()
  return data.models ?? []
}
