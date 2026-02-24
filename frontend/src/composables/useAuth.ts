import { ref, computed, readonly } from 'vue'
import * as authApi from '../api/auth'
import type { User, MeResponse } from '../api/auth'
import { identifyUser, resetUserAnalytics, trackEvent } from '../analytics'

// Global state (singleton pattern)
const user = ref<User | null>(null)
const userOrganizations = ref<MeResponse['organizations']>([])
const loading = ref(true)
const initialized = ref(false)

export function useAuth() {
  const isAuthenticated = computed(() => !!user.value)

  async function initialize(): Promise<boolean> {
    if (initialized.value) {
      return isAuthenticated.value
    }

    const token = localStorage.getItem('access_token')
    if (!token) {
      loading.value = false
      initialized.value = true
      return false
    }

    try {
      const me = await authApi.getMe()
      user.value = {
        id: me.id,
        email: me.email,
        name: me.name,
        created_at: me.created_at,
        updated_at: me.updated_at,
      }
      userOrganizations.value = me.organizations || []
      identifyUser({
        id: me.id,
        email: me.email,
        name: me.name,
      })
      initialized.value = true
      loading.value = false
      return true
    } catch {
      // Token is invalid, clear it
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      user.value = null
      userOrganizations.value = []
      resetUserAnalytics()
      initialized.value = true
      loading.value = false
      return false
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const response = await authApi.login({ email, password })
    localStorage.setItem('access_token', response.access_token)
    localStorage.setItem('refresh_token', response.refresh_token)

    // Fetch user info
    const me = await authApi.getMe()
    user.value = {
      id: me.id,
      email: me.email,
      name: me.name,
      created_at: me.created_at,
      updated_at: me.updated_at,
    }
    userOrganizations.value = me.organizations || []
    identifyUser({
      id: me.id,
      email: me.email,
      name: me.name,
    })
    trackEvent('auth_login', {
      organization_count: userOrganizations.value.length,
    })
  }

  async function register(email: string, password: string, name?: string): Promise<void> {
    const response = await authApi.register({ email, password, name })
    localStorage.setItem('access_token', response.access_token)
    localStorage.setItem('refresh_token', response.refresh_token)

    // Fetch user info
    const me = await authApi.getMe()
    user.value = {
      id: me.id,
      email: me.email,
      name: me.name,
      created_at: me.created_at,
      updated_at: me.updated_at,
    }
    userOrganizations.value = me.organizations || []
    identifyUser({
      id: me.id,
      email: me.email,
      name: me.name,
    })
    trackEvent('auth_signup', {
      organization_count: userOrganizations.value.length,
    })
  }

  async function logout(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken)
      } catch {
        // Ignore logout errors, clear local state anyway
      }
    }

    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('current_org_id')
    trackEvent('auth_logout')
    resetUserAnalytics()
    user.value = null
    userOrganizations.value = []
  }

  async function refreshUserData(): Promise<void> {
    if (!isAuthenticated.value) return

    try {
      const me = await authApi.getMe()
      user.value = {
        id: me.id,
        email: me.email,
        name: me.name,
        created_at: me.created_at,
        updated_at: me.updated_at,
      }
      userOrganizations.value = me.organizations || []
      identifyUser({
        id: me.id,
        email: me.email,
        name: me.name,
      })
    } catch {
      // If refresh fails, log out
      await logout()
    }
  }

  return {
    user: readonly(user),
    userOrganizations: readonly(userOrganizations),
    isAuthenticated,
    loading: readonly(loading),
    initialized: readonly(initialized),
    initialize,
    login,
    register,
    logout,
    refreshUserData,
  }
}
