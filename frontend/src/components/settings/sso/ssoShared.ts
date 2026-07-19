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
