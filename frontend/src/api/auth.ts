import { API_BASE } from './base'
import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from '@/lib/tokenStorage'

export interface User {
  id: string
  email: string
  name?: string
  created_at: string
  updated_at: string
}

export type OrganizationMembership = {
  id: string
  name: string
  slug: string
  role: 'admin' | 'editor' | 'viewer' | 'auditor'
}

export interface MeResponse extends User {
  organizations: OrganizationMembership[]
}

interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

interface LoginRequest {
  email: string
  password: string
}

interface RegisterRequest {
  email: string
  password: string
  name?: string
}

type MeApiOrganization = {
  organization_id: string
  organization_name: string
  organization_slug: string
  role: OrganizationMembership['role']
}

type MeApiResponse = User & {
  organizations?: MeApiOrganization[]
}

export type SSOProvider = {
  provider: string
}

function normalizeMe(me: MeApiResponse): MeResponse {
  return {
    ...me,
    organizations: (me.organizations ?? []).map(org => ({
      id: org.organization_id,
      name: org.organization_name,
      slug: org.organization_slug,
      role: org.role,
    })),
  }
}

export function getAuthHeaders(): HeadersInit {
  const token = getAccessToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function persistAuthResponse(response: AuthResponse): void {
  storeTokens(response.access_token, response.refresh_token, response.expires_in)
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid email or password')
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Login failed')
  }
  const auth = (await response.json()) as AuthResponse
  persistAuthResponse(auth)
  return auth
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    if (response.status === 409) {
      throw new Error('Email already registered')
    }
    if (response.status === 400) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'Invalid registration data')
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Registration failed')
  }
  const auth = (await response.json()) as AuthResponse
  persistAuthResponse(auth)
  return auth
}

export async function getMe(): Promise<MeResponse> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Not authenticated')
    }
    throw new Error('Failed to get user info')
  }
  const me = (await response.json()) as MeApiResponse
  return normalizeMe(me)
}

export async function getMeWithRefresh(): Promise<MeResponse> {
  try {
    return await getMe()
  } catch (error) {
    if (error instanceof Error && error.message === 'Not authenticated' && getRefreshToken()) {
      await refreshTokens()
      return await getMe()
    }
    throw error
  }
}

export async function refreshTokens(): Promise<AuthResponse> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('No refresh token')
  }

  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!response.ok) {
    clearTokens()
    if (response.status === 401) {
      throw new Error('Session expired')
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Token refresh failed')
  }

  const auth = (await response.json()) as AuthResponse
  persistAuthResponse(auth)
  return auth
}

export async function logout(refreshToken: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) {
    throw new Error('Logout failed')
  }
}

export async function fetchSSOProviders(orgSlug: string): Promise<SSOProvider[]> {
  try {
    const response = await fetch(`${API_BASE}/api/orgs/${encodeURIComponent(orgSlug)}/sso/providers`)
    if (!response.ok) return []
    return (await response.json()) as SSOProvider[]
  } catch {
    return []
  }
}

export function storeSessionFromTokens(accessToken: string, refreshToken: string, expiresIn = 900): void {
  storeTokens(accessToken, refreshToken, expiresIn)
}