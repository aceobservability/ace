import { identifyUser, resetUserAnalytics } from '@/analytics'
import type { MeResponse, User } from '@/api/auth'
import * as authApi from '@/api/auth'
import { create } from 'zustand'

type AuthState = {
  user: User | null
  userOrganizations: MeResponse['organizations']
  loading: boolean
  initialized: boolean
  isAuthenticated: boolean
  initialize: () => Promise<boolean>
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

    const token = localStorage.getItem('access_token')
    if (!token) {
      set({ loading: false, initialized: true, isAuthenticated: false })
      return false
    }

    try {
      const me = await authApi.getMe()
      const user: User = {
        id: me.id,
        email: me.email,
        name: me.name,
        created_at: me.created_at,
        updated_at: me.updated_at,
      }
      identifyUser({ id: me.id, email: me.email, name: me.name })
      set({
        user,
        userOrganizations: me.organizations ?? [],
        loading: false,
        initialized: true,
        isAuthenticated: true,
      })
      return true
    } catch {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      resetUserAnalytics()
      set({
        user: null,
        userOrganizations: [],
        loading: false,
        initialized: true,
        isAuthenticated: false,
      })
      return false
    }
  },
}))