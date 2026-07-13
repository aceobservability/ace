import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSSOProviders } from './auth'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('auth API', () => {
  it('encodes org slug in fetchSSOProviders path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ provider: 'google' }]),
    })

    const result = await fetchSSOProviders('acme/corp')

    expect(result).toEqual([{ provider: 'google' }])
    expect(mockFetch).toHaveBeenCalledWith('/api/orgs/acme%2Fcorp/sso/providers')
  })

  it('returns empty array when fetchSSOProviders fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
    })

    const result = await fetchSSOProviders('acme')

    expect(result).toEqual([])
  })
})