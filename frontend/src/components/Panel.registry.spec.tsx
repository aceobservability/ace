import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CrosshairSyncProvider } from '@/contexts/CrosshairSyncContext'
import { VariablesProvider } from '@/contexts/VariablesContext'
import { Panel } from '@/components/Panel'
import type { Panel as PanelType } from '@/types/panel'

const mockChartSeries = [
  {
    name: 'cpu',
    data: [
      { timestamp: 100, value: 1 },
      { timestamp: 200, value: 2 },
    ],
    labels: {},
  },
]

vi.mock('echarts/core', async importOriginal => {
  const actual = await importOriginal<typeof import('echarts/core')>()
  return {
    ...actual,
    init: vi.fn(() => ({
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      group: '',
    })),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
})

vi.mock('@/hooks/usePanelData', () => ({
  usePanelData: () => ({
    loading: false,
    error: null,
    chartSeries: mockChartSeries,
    hasQuery: true,
    refetch: vi.fn(),
  }),
}))

function renderPanel(panel: PanelType) {
  return render(
    <VariablesProvider dashboardId="dash-1">
      <CrosshairSyncProvider dashboardId="dash-1">
        <Panel panel={panel} />
      </CrosshairSyncProvider>
    </VariablesProvider>,
  )
}

describe('Panel registry integration', () => {
  it('renders a registered heatmap panel in dashboard detail view', async () => {
    renderPanel({
      id: 'panel-heatmap',
      dashboard_id: 'dash-1',
      title: 'CPU Heatmap',
      type: 'heatmap',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { datasource_id: 'ds-1', expr: 'cpu_usage', signal: 'metrics' },
      created_at: '2026-02-02T00:00:00Z',
      updated_at: '2026-02-02T00:00:00Z',
    })

    await waitFor(() => {
      expect(screen.getByTestId('heatmap-panel')).toBeTruthy()
    })
  })

  it('keeps built-in line_chart off the registry path', async () => {
    renderPanel({
      id: 'panel-line',
      dashboard_id: 'dash-1',
      title: 'CPU Line',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { promql: 'up' },
      created_at: '2026-02-02T00:00:00Z',
      updated_at: '2026-02-02T00:00:00Z',
    })

    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeTruthy()
    })
    expect(screen.queryByTestId('heatmap-panel')).toBeNull()
  })
})