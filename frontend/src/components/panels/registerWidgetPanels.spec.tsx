import { describe, expect, it } from 'vitest'
import '@/components/panels/registerWidgetPanels'
import {
  getPanelsByCategory,
  isRegisteredPanel,
  lookupPanel,
} from '@/utils/panelRegistry'

describe('registerWidgetPanels', () => {
  const widgetTypes = [
    'text',
    'iframe',
    'canvas',
    'alert_list',
    'annotation_list',
    'dashboard_list',
  ] as const

  it.each(widgetTypes)('registers widget panel type %s', type => {
    expect(isRegisteredPanel(type)).toBe(true)
    const registration = lookupPanel(type)
    expect(registration).not.toBeNull()
    expect(registration?.category).toBe('widgets')
    expect(registration?.label.length).toBeGreaterThan(0)
    expect(registration?.icon).toBeTypeOf('function')
    expect(registration?.component).toBeTypeOf('function')
    expect(registration?.dataAdapter).toBeTypeOf('function')
  })

  it('registers node_graph as an observability integration panel', () => {
    expect(isRegisteredPanel('node_graph')).toBe(true)
    expect(lookupPanel('node_graph')?.category).toBe('observability')
    expect(lookupPanel('node_graph')?.queryMode).toBe('traces')
  })

  it('exposes widget-category panels in the panel picker registry', () => {
    const widgetPanels = getPanelsByCategory('widgets')
    expect(widgetPanels.map(panel => panel.type).sort()).toEqual(
      ['alert_list', 'annotation_list', 'canvas', 'dashboard_list', 'iframe', 'text'].sort(),
    )
  })

  it('data adapters transform mocked widget payloads', () => {
    const text = lookupPanel('text')
    const iframe = lookupPanel('iframe')
    const canvas = lookupPanel('canvas')
    const alertList = lookupPanel('alert_list')
    const nodeGraph = lookupPanel('node_graph')

    expect(
      text?.dataAdapter({ series: [] }, { content: '# Hello', mode: 'markdown' }),
    ).toEqual({ content: '# Hello', mode: 'markdown' })

    expect(iframe?.dataAdapter({ series: [] }, { url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
      title: 'Embedded content',
    })

    expect(
      canvas?.dataAdapter(
        { series: [] },
        { canvasData: { elements: [{ id: '1' }], appState: { gridSize: 20 } } },
      ),
    ).toEqual({
      data: {
        elements: [{ id: '1' }],
        appState: { gridSize: 20 },
      },
    })

    expect(
      alertList?.dataAdapter(
        { series: [] },
        {
          alerts: [
            {
              id: 'a1',
              name: 'High CPU',
              severity: 'critical',
              state: 'firing',
              timestamp: '2026-07-17T00:00:00Z',
            },
          ],
        },
      ),
    ).toEqual({
      alerts: [
        {
          id: 'a1',
          name: 'High CPU',
          severity: 'critical',
          state: 'firing',
          timestamp: '2026-07-17T00:00:00Z',
        },
      ],
    })

    expect(
      nodeGraph?.dataAdapter(
        { series: [] },
        {
          nodes: [{ id: 'api', label: 'api' }],
          edges: [{ source: 'api', target: 'db' }],
        },
      ),
    ).toEqual({
      nodes: [{ id: 'api', label: 'api' }],
      edges: [{ source: 'api', target: 'db' }],
    })
  })
})
