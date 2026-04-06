import { trackEvent } from '../analytics'
import type {
  GoogleSSOConfig,
  MicrosoftSSOConfig,
  UpdateGoogleSSOConfigRequest,
  UpdateMicrosoftSSOConfigRequest,
} from '../types/sso'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export function getAuthHeaders(): HeadersInit {
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

export async function getGoogleSSOConfig(orgId: string): Promise<GoogleSSOConfig> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/google`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Google SSO not configured')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch Google SSO config'))
  }

  return response.json()
}

export async function updateGoogleSSOConfig(
  orgId: string,
  data: UpdateGoogleSSOConfigRequest,
): Promise<GoogleSSOConfig> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/google`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    trackEvent('settings_sso_google_update_failed', {
      org_id: orgId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error(await getErrorMessage(response, 'Failed to update Google SSO config'))
  }

  const config = await response.json()
  trackEvent('settings_sso_google_updated', {
    org_id: orgId,
    enabled: config.enabled,
  })
  return config
}

export async function getMicrosoftSSOConfig(orgId: string): Promise<MicrosoftSSOConfig> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/microsoft`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Microsoft SSO not configured')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch Microsoft SSO config'))
  }

  return response.json()
}

export async function updateMicrosoftSSOConfig(
  orgId: string,
  data: UpdateMicrosoftSSOConfigRequest,
): Promise<MicrosoftSSOConfig> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/microsoft`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    trackEvent('settings_sso_microsoft_update_failed', {
      org_id: orgId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error(await getErrorMessage(response, 'Failed to update Microsoft SSO config'))
  }

  const config = await response.json()
  trackEvent('settings_sso_microsoft_updated', {
    org_id: orgId,
    enabled: config.enabled,
  })
  return config
}

// --- Okta ---

interface OktaSSOConfig {
  tenant_id: string // Okta domain
  client_id: string
  groups_claim_name: string
  default_role: string
  enabled: boolean
  created_at: string
  updated_at: string
}

interface UpdateOktaSSOConfigRequest {
  tenant_id: string
  client_id: string
  client_secret: string
  groups_claim_name: string
  default_role: string
  enabled: boolean
}

export async function getOktaSSOConfig(orgId: string): Promise<OktaSSOConfig | null> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/okta`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch Okta SSO config'))
  }

  const data = await response.json()
  return data || null
}

export async function updateOktaSSOConfig(
  orgId: string,
  data: UpdateOktaSSOConfigRequest,
): Promise<OktaSSOConfig> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/okta`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    trackEvent('settings_sso_okta_update_failed', {
      org_id: orgId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error(await getErrorMessage(response, 'Failed to save Okta SSO config'))
  }

  const config = await response.json()
  trackEvent('settings_sso_okta_updated', {
    org_id: orgId,
    enabled: config.enabled,
  })
  return config
}

export async function testOktaConnection(
  orgId: string,
): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/okta/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return response.json()
}

