import { describe, expect, it, vi } from 'vitest'
import { normalizeApiBase } from './base'

describe('API base helper', () => {
  it('defaults to same-origin relative API calls', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', '')

    const { API_BASE } = await import('./base')

    expect(API_BASE).toBe('')
    vi.unstubAllEnvs()
  })

  it('normalizes configured API URL overrides', () => {
    expect(normalizeApiBase(' http://localhost:8080/ ')).toBe('http://localhost:8080')
  })
})
