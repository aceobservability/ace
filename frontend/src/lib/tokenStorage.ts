const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at'

/** Refresh when less than this many seconds remain before expiry. */
const REFRESH_BUFFER_SECONDS = 60

export type StoredTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getTokenExpiresAt(): number | null {
  const raw = localStorage.getItem(TOKEN_EXPIRES_AT_KEY)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function storeTokens(accessToken: string, refreshToken: string, expiresInSeconds: number): void {
  const expiresAt = Date.now() + expiresInSeconds * 1000
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAt))
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY)
}

export function isAccessTokenExpired(): boolean {
  return shouldRefreshAccessToken()
}

/** True when the access token should be refreshed before use. */
export function shouldRefreshAccessToken(): boolean {
  if (!hasStoredSession()) return false
  const expiresAt = getTokenExpiresAt()
  // Legacy sessions (Vue migration) lack expiry metadata — refresh to be safe.
  if (!expiresAt) return true
  return Date.now() >= expiresAt - REFRESH_BUFFER_SECONDS * 1000
}

export function hasStoredSession(): boolean {
  return Boolean(getAccessToken() && getRefreshToken())
}