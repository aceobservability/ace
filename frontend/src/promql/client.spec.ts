import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type PrometheusQueryResult,
  queryPrometheus,
  transformToChartData,
} from '@/promql/client'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('transformToChartData', () => {
  it('returns empty series for error status', () => {
    const result: PrometheusQueryResult = {
      status: 'error',
      error: 'some error',
    }

    expect(transformToChartData(result).series).toEqual([])
  })

  it('transforms single metric result correctly', () => {
    const result: PrometheusQueryResult = {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up', instance: 'localhost:9090', job: 'prometheus' },
            values: [
              [1704067200, '1'],
              [1704067215, '1'],
            ],
          },
        ],
      },
    }

    const chartData = transformToChartData(result)

    expect(chartData.series).toHaveLength(1)
    expect(chartData.series[0]?.name).toBe('up{instance="localhost:9090",job="prometheus"}')
    expect(chartData.series[0]?.data).toEqual([
      { timestamp: 1704067200, value: 1 },
      { timestamp: 1704067215, value: 1 },
    ])
  })
})

describe('queryPrometheus', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('constructs correct URL with query parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 'success', data: { resultType: 'matrix', result: [] } }),
    })

    await queryPrometheus('up', 1704067200, 1704070800, 15)

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('/api/datasources/prometheus/query')
    expect(calledUrl).toContain('query=up')
    expect(calledUrl).toContain('start=1704067200')
    expect(calledUrl).toContain('end=1704070800')
    expect(calledUrl).toContain('step=15')
  })

  it('floors timestamp values', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 'success', data: { resultType: 'matrix', result: [] } }),
    })

    await queryPrometheus('up', 1704067200.5, 1704070800.9, 15)

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('start=1704067200')
    expect(calledUrl).toContain('end=1704070800')
  })
})