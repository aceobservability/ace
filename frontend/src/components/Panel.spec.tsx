import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Panel } from '@/components/Panel'
import type { Panel as PanelType } from '@/types/panel'
import { clearRegistry, registerPanel } from '@/utils/panelRegistry'

const mockUsePanelData = vi.fn()

vi.mock('@/hooks/usePanelData', () => ({
  usePanelData: (...args: unknown[]) => mockUsePanelData(...args),
}))

vi.mock('@/contexts/VariablesContext', () => ({
  useDashboardVariables: () => ({
    interpolate: (query: string) => query,
    variables: [],
  }),
}))

vi.mock('@/contexts/CrosshairSyncContext', () => ({
  useCrosshairSync: () => ({ groupId: null }),
}))

vi.mock('@/components/LineChart', () => ({
  LineChart: () => <div data-testid="line-chart" />,
}))

vi.mock('@/components/BarChart', () => ({
  BarChart: () => <div data-testid="bar-chart" />,
}))

vi.mock('@/components/GaugeChart', () => ({
  GaugeChart: () => <div data-testid="gauge-chart" />,
}))

vi.mock('@/components/PieChart', () => ({
  PieChart: () => <div data-testid="pie-chart" />,
}))

vi.mock('@/components/StatPanel', () => ({
  StatPanel: () => <div data-testid="stat-panel" />,
}))

vi.mock('@/components/TablePanel', () => ({
  TablePanel: () => <div data-testid="table-panel" />,
}))

vi.mock('@/components/LogViewer', () => ({
  LogViewer: () => <div data-testid="log-viewer" />,
}))

vi.mock('@/components/TraceListPanel', () => ({
  TraceListPanel: () => <div data-testid="trace-list-panel" />,
}))

vi.mock('@/components/TraceHeatmapPanel', () => ({
  TraceHeatmapPanel: () => <div data-testid="trace-heatmap-panel" />,
}))

const basePanel: PanelType = {
  id: 'p1',
  dashboard_id: 'd1',
  title: 'Demo',
  type: 'line_chart',
  grid_pos: { x: 0, y: 0, w: 6, h: 4 },
  query: { expr: 'up', datasource_id: 'ds-1' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('Panel', () => {
  beforeEach(() => {
    clearRegistry()
    mockUsePanelData.mockReset()
    mockUsePanelData.mockReturnValue({
      loading: false,
      error: null,
      chartSeries: [
        {
          name: 'up',
          data: [
            { timestamp: 1, value: 1 },
            { timestamp: 2, value: 2 },
          ],
        },
      ],
      logs: [],
      traceSummaries: [],
      traceSpans: [],
      hasQuery: true,
      registry: null,
      refetch: vi.fn(),
    })
  })

  it('renders line chart content for metrics panels', () => {
    render(<Panel panel={basePanel} />)
    expect(screen.getByTestId('line-chart')).toBeTruthy()
  })

  it('renders stat panels', () => {
    mockUsePanelData.mockReturnValue({
      loading: false,
      error: null,
      chartSeries: [
        {
          name: 'cpu',
          data: [
            { timestamp: 1, value: 10 },
            { timestamp: 2, value: 12 },
          ],
        },
      ],
      logs: [],
      traceSummaries: [],
      traceSpans: [],
      hasQuery: true,
      registry: null,
      refetch: vi.fn(),
    })

    render(<Panel panel={{ ...basePanel, type: 'stat' }} />)
    expect(screen.getByTestId('stat-panel')).toBeTruthy()
  })

  it('renders logs and trace list panels', () => {
    mockUsePanelData.mockReturnValue({
      loading: false,
      error: null,
      chartSeries: [],
      logs: [{ timestamp: 't', line: 'hello' }],
      traceSummaries: [],
      traceSpans: [],
      hasQuery: true,
      registry: null,
      refetch: vi.fn(),
    })
    render(<Panel panel={{ ...basePanel, type: 'logs' }} />)
    expect(screen.getByTestId('log-viewer')).toBeTruthy()

    mockUsePanelData.mockReturnValue({
      loading: false,
      error: null,
      chartSeries: [],
      logs: [],
      traceSummaries: [
        {
          traceId: 'abc',
          startTimeUnixNano: 1,
          durationNano: 2,
          spanCount: 1,
          serviceCount: 1,
          errorSpanCount: 0,
        },
      ],
      traceSpans: [],
      hasQuery: true,
      registry: null,
      refetch: vi.fn(),
    })
    render(<Panel panel={{ ...basePanel, type: 'trace_list' }} />)
    expect(screen.getByTestId('trace-list-panel')).toBeTruthy()
  })

  it('renders registry unsupported empty state instead of a blank body', async () => {
    registerPanel({
      type: 'flame_graph',
      component: async () => ({ default: () => null }),
      dataAdapter: () => ({}),
      defaultQuery: {},
      category: 'observability',
      label: 'Flame Graph',
      icon: async () => ({}),
      queryMode: 'none',
      supportStatus: 'unsupported',
      emptyState: {
        title: 'Flame graph requires profiling data',
        description: 'Not wired yet.',
        actionLabel: 'Use a trace panel',
      },
    })

    mockUsePanelData.mockReturnValue({
      loading: false,
      error: null,
      chartSeries: [],
      logs: [],
      traceSummaries: [],
      traceSpans: [],
      hasQuery: true,
      registry: {
        type: 'flame_graph',
        supportStatus: 'unsupported',
        emptyState: {
          title: 'Flame graph requires profiling data',
          description: 'Not wired yet.',
          actionLabel: 'Use a trace panel',
        },
        label: 'Flame Graph',
      },
      refetch: vi.fn(),
    })

    render(<Panel panel={{ ...basePanel, type: 'flame_graph', query: {} }} />)

    await waitFor(() => {
      expect(screen.getByTestId('panel-unsupported-empty')).toBeTruthy()
    })
    expect(screen.getByText('Flame graph requires profiling data')).toBeTruthy()
  })

  it('renders text panel content from query', () => {
    mockUsePanelData.mockReturnValue({
      loading: false,
      error: null,
      chartSeries: [],
      logs: [],
      traceSummaries: [],
      traceSpans: [],
      hasQuery: true,
      registry: {
        type: 'text',
        queryMode: 'none',
        label: 'Text',
      },
      refetch: vi.fn(),
    })

    render(
      <Panel
        panel={{
          ...basePanel,
          type: 'text',
          query: { content: 'Hello from text panel' },
        }}
      />,
    )

    expect(screen.getByTestId('text-panel').textContent).toContain('Hello from text panel')
  })
})
