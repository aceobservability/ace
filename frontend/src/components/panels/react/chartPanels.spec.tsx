import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrosshairSyncProvider } from '@/contexts/CrosshairSyncContext'
import { BarGaugePanel } from './BarGaugePanel'
import { CandlestickPanel } from './CandlestickPanel'
import { HeatmapPanel } from './HeatmapPanel'
import { HistogramPanel } from './HistogramPanel'
import { ScatterPanel } from './ScatterPanel'
import { StatusHistoryPanel } from './StatusHistoryPanel'

const setOption = vi.fn()
const resize = vi.fn()
const dispose = vi.fn()

vi.mock('echarts/core', async importOriginal => {
  const actual = await importOriginal<typeof import('echarts/core')>()
  return {
    ...actual,
    init: vi.fn(() => ({
      setOption,
      resize,
      dispose,
      group: '',
    })),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
})

describe('registered chart panels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders HeatmapPanel with mocked data', () => {
    render(
      <HeatmapPanel
        data={[
          { x: 0, y: 0, value: 10 },
          { x: 1, y: 0, value: 20 },
        ]}
        yLabels={['series-a']}
      />,
    )
    expect(screen.getByTestId('heatmap-panel')).toBeTruthy()
    expect(setOption).toHaveBeenCalled()
  })

  it('renders BarGaugePanel with mocked data', () => {
    render(<BarGaugePanel items={[{ label: 'cpu', value: 42, max: 100 }]} />)
    expect(screen.getByTestId('bar-gauge-panel')).toBeTruthy()
    expect(setOption).toHaveBeenCalled()
  })

  it('renders ScatterPanel with mocked data', () => {
    render(
      <ScatterPanel
        series={[
          {
            name: 'latency vs throughput',
            data: [
              [1, 2],
              [3, 4],
            ],
          },
        ]}
      />,
    )
    expect(screen.getByTestId('scatter-panel')).toBeTruthy()
    expect(setOption).toHaveBeenCalled()
  })

  it('renders HistogramPanel with mocked data', () => {
    render(
      <HistogramPanel
        buckets={[
          { label: '0', count: 3 },
          { label: '1', count: 7 },
        ]}
      />,
    )
    expect(screen.getByTestId('histogram-panel')).toBeTruthy()
    expect(setOption).toHaveBeenCalled()
  })

  it('renders CandlestickPanel with mocked data', () => {
    render(
      <CrosshairSyncProvider dashboardId="dash-1">
        <CandlestickPanel
          data={[
            {
              timestamp: 1_700_000_000,
              open: 10,
              close: 12,
              low: 9,
              high: 13,
            },
          ]}
        />
      </CrosshairSyncProvider>,
    )
    expect(screen.getByTestId('candlestick-panel')).toBeTruthy()
    expect(setOption).toHaveBeenCalled()
  })

  it('renders StatusHistoryPanel with mocked data', () => {
    render(
      <StatusHistoryPanel
        cells={[
          { entity: 'api-1', bucket: '10:00', state: 'up' },
          { entity: 'api-1', bucket: '10:05', state: 'down' },
        ]}
      />,
    )
    expect(screen.getByTestId('status-history-panel')).toBeTruthy()
    expect(setOption).toHaveBeenCalled()
  })
})