import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearTokens,
  getTokenExpiresAt,
  hasStoredSession,
  isAccessTokenExpired,
  shouldRefreshAccessToken,
  storeTokens,
} from '@/lib/tokenStorage'

describe('tokenStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores tokens with an expiry timestamp', () => {
    storeTokens('access', 'refresh', 900)
    expect(hasStoredSession()).toBe(true)
    expect(getTokenExpiresAt()).toBeGreaterThan(Date.now())
  })

  it('treats missing expiry metadata as needing refresh', () => {
    localStorage.setItem('access_token', 'access')
    localStorage.setItem('refresh_token', 'refresh')
    expect(shouldRefreshAccessToken()).toBe(true)
    expect(isAccessTokenExpired()).toBe(true)
  })

  it('detects access tokens within the refresh buffer', () => {
    const expiresAt = Date.now() + 30_000
    localStorage.setItem('access_token', 'access')
    localStorage.setItem('refresh_token', 'refresh')
    localStorage.setItem('token_expires_at', String(expiresAt))
    expect(shouldRefreshAccessToken()).toBe(true)
  })

  it('clears all token keys', () => {
    storeTokens('access', 'refresh', 900)
    clearTokens()
    expect(hasStoredSession()).toBe(false)
    expect(getTokenExpiresAt()).toBeNull()
  })
})