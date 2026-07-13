import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { storeTokens } from '@/lib/tokenStorage'
import { useAuthStore } from '@/stores/authStore'
import { useOrgStore } from '@/stores/orgStore'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      user: null,
      userOrganizations: [],
      loading: false,
      initialized: false,
      isAuthenticated: false,
    })
    useOrgStore.setState({ currentOrgId: null })
    vi.restoreAllMocks()
  })

  it('initializes session from stored tokens', async () => {
    storeTokens('access-1', 'refresh-1', 900)
    vi.spyOn(authApi, 'getMeWithRefresh').mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      organizations: [{ id: 'org-1', name: 'Org', slug: 'org', role: 'admin' }],
    })

    const authenticated = await useAuthStore.getState().initialize()

    expect(authenticated).toBe(true)
    expect(useAuthStore.getState().user?.email).toBe('user@example.com')
    expect(useAuthStore.getState().userOrganizations).toHaveLength(1)
  })

  it('refreshes legacy sessions without expiry metadata before loading', async () => {
    localStorage.setItem('access_token', 'stale-access')
    localStorage.setItem('refresh_token', 'refresh-1')

    const refreshSpy = vi.spyOn(authApi, 'refreshTokens').mockImplementation(async () => {
      storeTokens('fresh-access', 'fresh-refresh', 900)
      return {
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        token_type: 'Bearer',
        expires_in: 900,
      }
    })
    vi.spyOn(authApi, 'getMeWithRefresh').mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      organizations: [],
    })

    const authenticated = await useAuthStore.getState().initialize()

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(authenticated).toBe(true)
  })

  it('refreshes expired access tokens before loading the session', async () => {
    const expiredAt = Date.now() - 1000
    localStorage.setItem('access_token', 'stale-access')
    localStorage.setItem('refresh_token', 'refresh-1')
    localStorage.setItem('token_expires_at', String(expiredAt))

    const refreshSpy = vi.spyOn(authApi, 'refreshTokens').mockImplementation(async () => {
      storeTokens('fresh-access', 'fresh-refresh', 900)
      return {
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        token_type: 'Bearer',
        expires_in: 900,
      }
    })
    vi.spyOn(authApi, 'getMeWithRefresh').mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      organizations: [],
    })

    const authenticated = await useAuthStore.getState().initialize()

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(authenticated).toBe(true)
    expect(localStorage.getItem('access_token')).toBe('fresh-access')
  })

  it('logs in, stores tokens, and initializes org context from memberships', async () => {
    localStorage.setItem('current_org_id', 'org-2')
    vi.spyOn(authApi, 'login').mockResolvedValue({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'Bearer',
      expires_in: 900,
    })
    vi.spyOn(authApi, 'getMeWithRefresh').mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      organizations: [
        { id: 'org-1', name: 'One', slug: 'one', role: 'viewer' },
        { id: 'org-2', name: 'Two', slug: 'two', role: 'admin' },
      ],
    })

    await useAuthStore.getState().login('user@example.com', 'Password1')

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useOrgStore.getState().currentOrgId).toBe('org-2')
  })
})