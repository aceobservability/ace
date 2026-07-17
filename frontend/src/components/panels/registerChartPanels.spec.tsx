import { describe, expect, it } from 'vitest'
import '@/components/panels/registerChartPanels'
import {
  getAllPanels,
  getPanelsByCategory,
  isRegisteredPanel,
  lookupPanel,
} from '@/utils/panelRegistry'

describe('registerChartPanels', () => {
  const chartTypes = ['heatmap', 'scatter', 'histogram', 'candlestick'] as const

  it.each(chartTypes)('registers chart panel type %s', type => {
    expect(isRegisteredPanel(type)).toBe(true)
    const registration = lookupPanel(type)
    expect(registration).not.toBeNull()
    expect(registration?.category).toBe('charts')
    expect(registration?.label.length).toBeGreaterThan(0)
    expect(registration?.icon).toBeTypeOf('function')
    expect(registration?.component).toBeTypeOf('function')
    expect(registration?.dataAdapter).toBeTypeOf('function')
  })

  it('registers bar_gauge and status_history panels from the ticket scope', () => {
    expect(isRegisteredPanel('bar_gauge')).toBe(true)
    expect(isRegisteredPanel('status_history')).toBe(true)
    expect(lookupPanel('bar_gauge')?.label).toBe('Bar Gauge')
    expect(lookupPanel('status_history')?.label).toBe('Status History')
  })

  it('exposes chart-category panels in the panel picker registry', () => {
    const chartPanels = getPanelsByCategory('charts')
    expect(chartPanels.map(panel => panel.type).sort()).toEqual(
      ['candlestick', 'heatmap', 'histogram', 'scatter'].sort(),
    )
  })

  it('data adapters transform mocked query results', () => {
    const heatmap = lookupPanel('heatmap')
    const scatter = lookupPanel('scatter')
    const candlestick = lookupPanel('candlestick')

    expect(
      heatmap?.dataAdapter({
        series: [
          {
            name: 'cpu',
            data: [{ timestamp: 100, value: 1 }],
          },
        ],
      }),
    ).toEqual({
      data: [{ x: 100, y: 0, value: 1 }],
      yLabels: ['cpu'],
    })

    expect(
      scatter?.dataAdapter({
        series: [
          { name: 'x', data: [{ timestamp: 1, value: 2 }] },
          { name: 'y', data: [{ timestamp: 1, value: 3 }] },
        ],
      }),
    ).toEqual({
      series: [{ name: 'x vs y', data: [[2, 3]] }],
    })

    expect(
      candlestick?.dataAdapter({
        series: [
          { name: 'open', data: [{ timestamp: 10, value: 1 }] },
          { name: 'close', data: [{ timestamp: 10, value: 2 }] },
          { name: 'low', data: [{ timestamp: 10, value: 0.5 }] },
          { name: 'high', data: [{ timestamp: 10, value: 2.5 }] },
        ],
      }),
    ).toEqual({
      data: [{ timestamp: 10, open: 1, close: 2, low: 0.5, high: 2.5 }],
    })
  })

  it('registers the scoped chart panel types', () => {
    const registered = new Set(getAllPanels().map(panel => panel.type))
    for (const type of ['bar_gauge', 'candlestick', 'heatmap', 'histogram', 'scatter', 'status_history']) {
      expect(registered.has(type)).toBe(true)
    }
  })
})