import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPanel, deletePanel, listPanels, updatePanel } from './panels'

describe('Panel API', () => {
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

  describe('listPanels', () => {
    it('fetches panels for a dashboard from API', async () => {
      const mockData = [{ id: '1', title: 'Test Panel' }]
      localStorage.setItem('access_token', 'token-123')
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await listPanels('dashboard-123')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboards/dashboard-123/panels',
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-123',
          },
        },
      )
      expect(result).toEqual(mockData)
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false })
      await expect(listPanels('dashboard-123')).rejects.toThrow('Failed to fetch panels')
    })
  })

  describe('createPanel', () => {
    it('creates panel via API', async () => {
      const mockData = { id: '1', title: 'New Panel' }
      localStorage.setItem('access_token', 'token-123')
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await createPanel('dashboard-123', {
        title: 'New Panel',
        grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboards/dashboard-123/panels',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-123',
          },
          body: JSON.stringify({
            title: 'New Panel',
            grid_pos: { x: 0, y: 0, w: 6, h: 4 },
          }),
        }),
      )
      expect(result).toEqual(mockData)
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false })
      await expect(
        createPanel('dashboard-123', {
          title: 'Test',
          grid_pos: { x: 0, y: 0, w: 6, h: 4 },
        }),
      ).rejects.toThrow('Failed to create panel')
    })
  })

  describe('updatePanel', () => {
    it('updates panel via API', async () => {
      const mockData = { id: '1', title: 'Updated' }
      localStorage.setItem('access_token', 'token-123')
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await updatePanel('panel-1', { title: 'Updated' })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/panels/panel-1',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-123',
          },
          body: JSON.stringify({ title: 'Updated' }),
        }),
      )
      expect(result).toEqual(mockData)
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false })
      await expect(updatePanel('1', { title: 'Test' })).rejects.toThrow('Failed to update panel')
    })
  })

  describe('deletePanel', () => {
    it('deletes panel via API', async () => {
      localStorage.setItem('access_token', 'token-123')
      mockFetch.mockResolvedValue({ ok: true })

      await deletePanel('panel-1')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/panels/panel-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-123',
          },
        }),
      )
    })

    it('throws error on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false })
      await expect(deletePanel('1')).rejects.toThrow('Failed to delete panel')
    })
  })
})
