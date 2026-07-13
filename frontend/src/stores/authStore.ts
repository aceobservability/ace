import { identifyUser, resetUserAnalytics, trackEvent } from '@/analytics'
import type { MeResponse, OrganizationMembership, User } from '@/api/auth'
import * as authApi from '@/api/auth'
import { clearTokens, getRefreshToken, hasStoredSession, shouldRefreshAccessToken } from '@/lib/tokenStorage'
import { useOrgStore } from '@/stores/orgStore'
import { create } from 'zustand'

type AuthState = {
  user: User | null
  userOrganizations: OrganizationMembership[]
  loading: boolean
  initialized: boolean
  isAuthenticated: boolean
  initialize: () => Promise<boolean>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => Promise<void>
  applySession: () => Promise<void>
  refreshSession: () => Promise<boolean>
}

let initPromise: Promise<boolean> | null = null

function applyUserSession(me: MeResponse): void {
  const user: User = {
    id: me.id,
    email: me.email,
    name: me.name,
    created_at: me.created_at,
    updated_at: me.updated_at,
  }
  identifyUser({ id: me.id, email: me.email, name: me.name })
  useOrgStore.getState().initializeFromMemberships(me.organizations)
  useAuthStore.setState({
    user,
    userOrganizations: me.organizations,
    isAuthenticated: true,
  })
}

function clearSession(): void {
  clearTokens()
  resetUserAnalytics()
  useOrgStore.getState().clear()
  useAuthStore.setState({
    user: null,
    userOrganizations: [],
    isAuthenticated: false,
  })
}

async function ensureFreshAccessToken(): Promise<boolean> {
  if (!hasStoredSession()) return false
  if (!shouldRefreshAccessToken()) return true

  try {
    await authApi.refreshTokens()
    return true
  } catch {
    clearSession()
    return false
  }
}

async function loadSession(set: (partial: Partial<AuthState>) => void): Promise<boolean> {
  set({ loading: true })

  if (!hasStoredSession()) {
    useOrgStore.getState().clear()
    set({ loading: false, initialized: true, isAuthenticated: false })
    return false
  }

  try {
    const hasToken = await ensureFreshAccessToken()
    if (!hasToken) {
      set({ loading: false, initialized: true, isAuthenticated: false })
      return false
    }

    const me = await authApi.getMeWithRefresh()
    applyUserSession(me)
    set({ loading: false, initialized: true, isAuthenticated: true })
    return true
  } catch {
    clearSession()
    set({ loading: false, initialized: true, isAuthenticated: false })
    return false
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userOrganizations: [],
  loading: true,
  initialized: false,
  isAuthenticated: false,

  async initialize() {
    if (get().initialized) {
      return get().isAuthenticated
    }

    initPromise ??= loadSession(set).finally(() => {
      initPromise = null
    })
    return initPromise
  },

  async applySession() {
    const me = await authApi.getMeWithRefresh()
    applyUserSession(me)
    set({ isAuthenticated: true, loading: false, initialized: true })
  },

  async refreshSession() {
    if (!hasStoredSession()) {
      clearSession()
      set({ loading: false, initialized: true, isAuthenticated: false })
      return false
    }

    try {
      await authApi.refreshTokens()
      await get().applySession()
      return true
    } catch {
      clearSession()
      set({ loading: false, initialized: true, isAuthenticated: false })
      return false
    }
  },

  async login(email, password) {
    await authApi.login({ email, password })
    await get().applySession()
    trackEvent('auth_login', {
      organization_count: get().userOrganizations.length,
    })
  },

  async register(email, password, name) {
    await authApi.register({ email, password, name })
    await get().applySession()
    trackEvent('auth_signup', {
      organization_count: get().userOrganizations.length,
    })
  },

  async logout() {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken)
      } catch {
        // Clear local session even if server logout fails.
      }
    }

    trackEvent('auth_logout')
    clearSession()
    set({ loading: false, initialized: true, isAuthenticated: false })
  },
}))