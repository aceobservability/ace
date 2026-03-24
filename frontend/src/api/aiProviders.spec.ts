import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAIProvider,
  deleteAIProvider,
  listAIModels,
  listAIProviders,
  testAIProvider,
  updateAIProvider,
} from './aiProviders'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
})

describe('aiProviders API', () => {
  describe('listAIProviders', () => {
    it('fetches AI providers for an org', async () => {
      const mockData = [
        {
          id: 'prov-1',
          provider_type: 'openai',
          display_name: 'OpenAI',
          base_url: 'https://api.openai.com/v1',
          enabled: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await listAIProviders('org-1')
      expect(result).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/providers'),
        expect.any(Object),
      )
    })

    it('uses GET method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listAIProviders('org-1')
      const [, options] = mockFetch.mock.calls[0]
      expect(options.method).toBeUndefined()
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(listAIProviders('org-1')).rejects.toThrow('Failed to fetch AI providers')
    })

    it('includes auth headers when token is set', async () => {
      localStorage.setItem('access_token', 'tok-abc')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listAIProviders('org-1')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer tok-abc')
    })

    it('omits auth header when no token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listAIProviders('org-1')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBeUndefined()
    })
  })

  describe('createAIProvider', () => {
    it('creates an AI provider', async () => {
      const mockData = {
        id: 'prov-1',
        provider_type: 'openai',
        display_name: 'My OpenAI',
        base_url: 'https://api.openai.com/v1',
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await createAIProvider('org-1', {
        provider_type: 'openai',
        display_name: 'My OpenAI',
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        enabled: true,
      })

      expect(result).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/providers'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('sends the request body as JSON', async () => {
      const requestBody = {
        provider_type: 'anthropic',
        display_name: 'Anthropic',
        base_url: 'https://api.anthropic.com',
        api_key: 'sk-ant-key',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'prov-2', ...requestBody, enabled: false, created_at: '', updated_at: '' }),
      })

      await createAIProvider('org-2', requestBody)
      const [, options] = mockFetch.mock.calls[0]
      expect(JSON.parse(options.body)).toEqual(requestBody)
    })

    it('throws on non-ok response with backend error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Forbidden' }),
      })

      await expect(
        createAIProvider('org-1', {
          provider_type: 'openai',
          display_name: 'Test',
          base_url: 'https://api.openai.com/v1',
        }),
      ).rejects.toThrow('Forbidden')
    })

    it('throws generic error when backend provides no error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(
        createAIProvider('org-1', {
          provider_type: 'openai',
          display_name: 'Test',
          base_url: 'https://api.openai.com/v1',
        }),
      ).rejects.toThrow('Failed to create AI provider')
    })

    it('includes Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'p', provider_type: 'openai', display_name: 'x', base_url: '', enabled: true, created_at: '', updated_at: '' }),
      })

      await createAIProvider('org-1', { provider_type: 'openai', display_name: 'x', base_url: '' })
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('updateAIProvider', () => {
    it('updates an AI provider', async () => {
      const mockData = {
        id: 'prov-1',
        provider_type: 'openai',
        display_name: 'Updated Name',
        base_url: 'https://api.openai.com/v1',
        enabled: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-02-01T00:00:00Z',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await updateAIProvider('org-1', 'prov-1', {
        display_name: 'Updated Name',
        enabled: false,
      })

      expect(result).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/providers/prov-1'),
        expect.objectContaining({ method: 'PUT' }),
      )
    })

    it('sends the request body as JSON', async () => {
      const updateBody = { display_name: 'New Name', api_key: 'new-key' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'p', provider_type: 'openai', display_name: 'New Name', base_url: '', enabled: true, created_at: '', updated_at: '' }),
      })

      await updateAIProvider('org-1', 'prov-1', updateBody)
      const [, options] = mockFetch.mock.calls[0]
      expect(JSON.parse(options.body)).toEqual(updateBody)
    })

    it('URL contains both orgId and providerId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'prov-42', provider_type: 'openai', display_name: 'x', base_url: '', enabled: true, created_at: '', updated_at: '' }),
      })

      await updateAIProvider('org-99', 'prov-42', { enabled: true })
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/orgs/org-99/ai/providers/prov-42')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(updateAIProvider('org-1', 'prov-1', { enabled: false })).rejects.toThrow(
        'Failed to update AI provider',
      )
    })
  })

  describe('deleteAIProvider', () => {
    it('deletes an AI provider', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await deleteAIProvider('org-1', 'prov-1')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/providers/prov-1'),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('URL contains both orgId and providerId', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await deleteAIProvider('org-77', 'prov-99')
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/orgs/org-77/ai/providers/prov-99')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      await expect(deleteAIProvider('org-1', 'prov-1')).rejects.toThrow(
        'Failed to delete AI provider',
      )
    })

    it('returns void on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await deleteAIProvider('org-1', 'prov-1')
      expect(result).toBeUndefined()
    })

    it('includes auth headers', async () => {
      localStorage.setItem('access_token', 'tok-del')
      mockFetch.mockResolvedValueOnce({ ok: true })

      await deleteAIProvider('org-1', 'prov-1')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer tok-del')
    })
  })

  describe('testAIProvider', () => {
    it('sends POST to provider test endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, models_count: 5 }),
      })

      const result = await testAIProvider('org-1', 'prov-1')
      expect(result).toEqual({ success: true, models_count: 5 })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/providers/prov-1/test'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('URL contains both orgId and providerId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await testAIProvider('org-55', 'prov-88')
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/orgs/org-55/ai/providers/prov-88/test')
    })

    it('returns error result on failure response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'invalid api key' }),
      })

      const result = await testAIProvider('org-1', 'prov-1')
      expect(result).toEqual({ success: false, error: 'invalid api key' })
    })

    it('throws on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

      await expect(testAIProvider('org-1', 'prov-1')).rejects.toThrow('Failed to test AI provider')
    })

    it('includes auth headers', async () => {
      localStorage.setItem('access_token', 'tok-test')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await testAIProvider('org-1', 'prov-1')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer tok-test')
    })
  })

  describe('listAIModels', () => {
    it('fetches AI models for an org', async () => {
      const mockData = [
        {
          id: 'gpt-4o',
          name: 'GPT-4o',
          vendor: 'openai',
          category: 'chat',
        },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await listAIModels('org-1')
      expect(result).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/models'),
        expect.any(Object),
      )
    })

    it('appends provider_id query param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listAIModels('org-1', 'prov-1')
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('provider_id=prov-1')
    })

    it('omits provider_id query param when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listAIModels('org-1')
      const [url] = mockFetch.mock.calls[0]
      expect(url).not.toContain('provider_id')
    })

    it('uses GET method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listAIModels('org-1')
      const [, options] = mockFetch.mock.calls[0]
      expect(options.method).toBeUndefined()
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

      await expect(listAIModels('org-1')).rejects.toThrow('Failed to fetch AI models')
    })

    it('includes auth headers', async () => {
      localStorage.setItem('access_token', 'tok-models')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listAIModels('org-1')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer tok-models')
    })
  })
})
