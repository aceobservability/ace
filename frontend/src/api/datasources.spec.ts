import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listDataSources,
  getDataSource,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  queryDataSource,
  testDataSourceConnection,
  testDataSourceDraftConnection,
  fetchDataSourceLabels,
  fetchDataSourceLabelValues,
  fetchDataSourceTrace,
  fetchDataSourceTraceServiceGraph,
  searchDataSourceTraces,
  fetchDataSourceTraceServices,
} from './datasources'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
})

describe('datasources API', () => {
  describe('listDataSources', () => {
    it('fetches datasources for an org', async () => {
      const mockData = [
        { id: '1', name: 'Prometheus', type: 'prometheus', url: 'http://localhost:9090' },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await listDataSources('org-1')
      expect(result).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/datasources'),
        expect.any(Object),
      )
    })

    it('throws on 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(listDataSources('org-1')).rejects.toThrow('Not a member')
    })
  })

  describe('getDataSource', () => {
    it('fetches a single datasource', async () => {
      const mockData = { id: '1', name: 'Prometheus', type: 'prometheus' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await getDataSource('1')
      expect(result).toEqual(mockData)
    })
  })

  describe('createDataSource', () => {
    it('creates a datasource', async () => {
      const mockData = { id: '1', name: 'Loki', type: 'loki', url: 'http://localhost:3100' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await createDataSource('org-1', {
        name: 'Loki',
        type: 'loki',
        url: 'http://localhost:3100',
      })
      expect(result).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/datasources'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws on 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
      })

      await expect(
        createDataSource('org-1', { name: 'test', type: 'loki', url: 'http://localhost' }),
      ).rejects.toThrow('Only admins')
    })
  })

  describe('updateDataSource', () => {
    it('updates a datasource', async () => {
      const mockData = { id: '1', name: 'Updated', type: 'prometheus' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await updateDataSource('1', { name: 'Updated' })
      expect(result).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/1'),
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  describe('deleteDataSource', () => {
    it('deletes a datasource', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await deleteDataSource('1')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/1'),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  describe('queryDataSource', () => {
    it('queries a datasource', async () => {
      const mockResult = { status: 'success', resultType: 'metrics', data: { result: [] } }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      })

      const result = await queryDataSource('1', {
        query: 'up',
        start: 1000,
        end: 2000,
      })
      expect(result).toEqual(mockResult)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/1/query'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Query failed' }),
      })

      await expect(
        queryDataSource('1', { query: 'up', start: 1000, end: 2000 }),
      ).rejects.toThrow('Query failed')
    })
  })

  describe('testDataSourceConnection', () => {
    it('tests datasource connectivity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      })

      await testDataSourceConnection('ds-1')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/ds-1/test'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws when connection test fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'connection test failed: timeout' }),
      })

      await expect(testDataSourceConnection('ds-1')).rejects.toThrow('connection test failed: timeout')
    })
  })

  describe('testDataSourceDraftConnection', () => {
    it('tests unsaved datasource connectivity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      })

      await testDataSourceDraftConnection('org-1', {
        name: 'Draft Prometheus',
        type: 'prometheus',
        url: 'http://localhost:9090',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/datasources/test'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws admin error on 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
      })

      await expect(testDataSourceDraftConnection('org-1', {
        name: 'Draft Prometheus',
        type: 'prometheus',
        url: 'http://localhost:9090',
      })).rejects.toThrow('Only admins can test datasource connections')
    })
  })

  describe('label metadata', () => {
    it('fetches indexed labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: ['job', 'service'] }),
      })

      const labels = await fetchDataSourceLabels('ds-1')
      expect(labels).toEqual(['job', 'service'])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/ds-1/labels'),
        expect.any(Object),
      )
    })

    it('fetches indexed label values for a label', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: ['api', 'worker'] }),
      })

      const values = await fetchDataSourceLabelValues('ds-1', 'job')
      expect(values).toEqual(['api', 'worker'])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/ds-1/labels/job/values'),
        expect.any(Object),
      )
    })
  })

  describe('trace APIs', () => {
    it('fetches a single trace by id', async () => {
      const trace = {
        traceId: 'trace-1',
        spans: [],
        services: ['api'],
        startTimeUnixNano: 1000,
        durationNano: 5000,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: trace }),
      })

      const result = await fetchDataSourceTrace('ds-1', 'trace-1')
      expect(result).toEqual(trace)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/ds-1/traces/trace-1'),
        expect.any(Object),
      )
    })

    it('searches traces for a datasource', async () => {
      const summaries = [{
        traceId: 'trace-1',
        rootServiceName: 'api',
        rootOperationName: 'GET /health',
        startTimeUnixNano: 1000,
        durationNano: 5000,
        spanCount: 4,
        serviceCount: 2,
        errorSpanCount: 0,
      }]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: summaries }),
      })

      const result = await searchDataSourceTraces('ds-1', { query: 'service=api', limit: 20 })
      expect(result).toEqual(summaries)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/ds-1/traces/search'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('fetches trace service graph from datasource', async () => {
      const graph = {
        nodes: [
          {
            serviceName: 'api',
            requestCount: 5,
            errorCount: 1,
            errorRate: 0.2,
            averageDurationNano: 1500000,
          },
        ],
        edges: [
          {
            source: 'api',
            target: 'postgres',
            requestCount: 3,
            errorCount: 1,
            errorRate: 0.33,
            averageDurationNano: 900000,
          },
        ],
        totalRequests: 5,
        totalErrorCount: 1,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: graph }),
      })

      const result = await fetchDataSourceTraceServiceGraph('ds-1', 'trace-1')
      expect(result).toEqual(graph)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/ds-1/traces/trace-1/service-graph'),
        expect.any(Object),
      )
    })

    it('throws when trace service graph request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'forbidden' }),
      })

      await expect(fetchDataSourceTraceServiceGraph('ds-1', 'trace-1')).rejects.toThrow('forbidden')
    })

    it('fetches trace services from datasource', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: ['api', 'worker'] }),
      })

      const result = await fetchDataSourceTraceServices('ds-1')
      expect(result).toEqual(['api', 'worker'])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasources/ds-1/traces/services'),
        expect.any(Object),
      )
    })
  })

  describe('auth headers', () => {
    it('includes auth token when available', async () => {
      localStorage.setItem('access_token', 'test-token')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listDataSources('org-1')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer test-token')
    })

    it('works without auth token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await listDataSources('org-1')
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBeUndefined()
    })
  })
})
