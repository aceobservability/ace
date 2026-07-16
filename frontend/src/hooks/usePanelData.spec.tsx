import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasourceApi from '@/api/datasources'
import { usePanelData } from '@/hooks/usePanelData'
import * as promqlClient from '@/promql/client'
import type { Panel } from '@/types/panel'

const panel: Panel = {
  id: 'panel-1',
  dashboard_id: 'dash-1',
  title: 'CPU',
  type: 'line_chart',
  grid_pos: { x: 0, y: 0, w: 6, h: 3 },
  query: {
    datasource_id: 'ds-1',
    expr: 'cpu_usage{job="$job"}',
    signal: 'metrics',
  },
  created_at: '2026-02-02T00:00:00Z',
  updated_at: '2026-02-02T00:00:00Z',
}

describe('usePanelData', () => {
  beforeEach(() => {
    vi.spyOn(datasourceApi, 'queryDataSource').mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'cpu_usage', job: 'api' },
            values: [
              [1_700_000_000, '12'],
              [1_700_000_015, '15'],
            ],
          },
        ],
      },
    })
  })

  it('fetches datasource metrics with interpolated variables', async () => {
    const interpolate = (query: string) => query.replace('$job', 'api')

    const { result } = renderHook(() => usePanelData(panel, interpolate))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(datasourceApi.queryDataSource).toHaveBeenCalledWith(
      'ds-1',
      expect.objectContaining({
        query: 'cpu_usage{job="api"}',
        signal: 'metrics',
      }),
    )
    expect(result.current.chartSeries).toHaveLength(1)
    expect(result.current.chartSeries[0].name).toContain('cpu_usage')
  })

  it('fetches legacy promql when no datasource is configured', async () => {
    const promPanel: Panel = {
      ...panel,
      query: { promql: 'up' },
    }

    vi.spyOn(promqlClient, 'queryPrometheus').mockResolvedValue({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up' },
            values: [
              [1_700_000_000, '1'],
              [1_700_000_015, '1'],
            ],
          },
        ],
      },
    })

    const { result } = renderHook(() => usePanelData(promPanel, query => query))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(promqlClient.queryPrometheus).toHaveBeenCalledWith('up', expect.any(Number), expect.any(Number), 15)
    expect(result.current.chartSeries).toHaveLength(1)
  })
})