export interface User {
  id: string
  email: string
  name?: string
  created_at: string
  updated_at: string
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

export interface MeResponse extends User {
  organizations: Array<{
    id: string
    name: string
    slug: string
    role: 'admin' | 'editor' | 'viewer' | 'auditor'
  }>
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
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
  return response.json()
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
  return response.json()
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
  return response.json()
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
