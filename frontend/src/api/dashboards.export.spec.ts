import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportDashboardYaml } from './dashboards'

describe('exportDashboardYaml', () => {
  const mockFetch = vi.fn()
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockClear()
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('downloads yaml payload from export endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('version: 2\ntitle: Test\n'),
    })

    const result = await exportDashboardYaml('dashboard-1')

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/dashboards/dashboard-1/export?format=yaml',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(result.type).toBe('application/x-yaml')
  })

  it('throws permission error for forbidden response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })

    await expect(exportDashboardYaml('dashboard-1')).rejects.toThrow(
      'Not authorized to export this dashboard',
    )
  })
})
