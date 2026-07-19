import type { CSSProperties } from 'react'

export type SsoProviderKey = 'google' | 'microsoft' | 'okta'

export type SsoProviderSummary = {
  key: SsoProviderKey
  name: string
  issuer: string
  configured: boolean
  enabled: boolean
  mappingCount: number
}

export const ROLE_OPTIONS = ['viewer', 'editor', 'admin', 'auditor'] as const

export function roleBadgeStyle(role: string): CSSProperties {
  if (role === 'admin') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
      color: 'var(--color-error)',
    }
  }
  if (role === 'editor') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
      color: 'var(--color-primary)',
    }
  }
  if (role === 'auditor') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-info) 15%, transparent)',
      color: 'var(--color-info)',
    }
  }
  return {
    backgroundColor: 'color-mix(in srgb, var(--color-on-surface-variant) 15%, transparent)',
    color: 'var(--color-on-surface-variant)',
  }
}

export const fieldStyle: CSSProperties = {
  backgroundColor: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid var(--color-outline-variant)',
}

export const secondaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid var(--color-outline-variant)',
}

export const primaryButtonStyle: CSSProperties = {
  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
  color: '#fff',
  border: 'none',
}

export function errorBannerStyle(): CSSProperties {
  return {
    backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
    color: 'var(--color-error)',
  }
}

/**
 * Normalize Okta domain input to a full hostname.
 * Accepts `dev-12345` or `dev-12345.okta.com` (strips protocol/path if pasted).
 */
export function normalizeOktaDomain(input: string): string {
  let value = input.trim()
  if (!value) return value

  // Strip protocol and path/query if a URL was pasted.
  value = value.replace(/^https?:\/\//i, '')
  value = value.split('/')[0] ?? value
  value = value.split('?')[0] ?? value

  // Prefix-only form used in the UI hint.
  if (value && !value.includes('.')) {
    return `${value}.okta.com`
  }
  return value
}

/** Display Okta issuer host; keep full hostname if already present. */
export function formatOktaIssuer(domain: string): string {
  const normalized = normalizeOktaDomain(domain)
  return normalized || 'okta.com'
}
