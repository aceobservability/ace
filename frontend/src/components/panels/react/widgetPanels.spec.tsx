import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertListPanel } from './AlertListPanel'
import { AnnotationListPanel } from './AnnotationListPanel'
import { CanvasPanel } from './CanvasPanel'
import { DashboardListPanel } from './DashboardListPanel'
import { IframePanel } from './IframePanel'
import { NodeGraphPanel } from './NodeGraphPanel'
import { TextPanel } from './TextPanel'

vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: () => <div data-testid="excalidraw-mock">excalidraw</div>,
}))

describe('registered widget panels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders TextPanel markdown content', () => {
    render(<TextPanel content="**bold text**" />)
    const panel = screen.getByTestId('text-panel')
    expect(panel).toBeTruthy()
    expect(panel.querySelector('strong')?.textContent).toBe('bold text')
  })

  it('sanitizes script tags in TextPanel', () => {
    render(<TextPanel content={'Safe <script>alert("xss")</script> text'} />)
    const html = screen.getByTestId('text-panel').innerHTML
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert("xss")')
  })

  it('renders IframePanel with a URL', () => {
    render(<IframePanel url="https://example.com/embed" title="Example" />)
    expect(screen.getByTestId('iframe-panel')).toBeTruthy()
    const frame = screen.getByTestId('iframe-panel-frame') as HTMLIFrameElement
    expect(frame.src).toContain('https://example.com/embed')
  })

  it('shows empty state for IframePanel without URL', () => {
    render(<IframePanel url="" />)
    expect(screen.getByTestId('iframe-panel-empty')).toBeTruthy()
  })

  it('mounts CanvasPanel with native Excalidraw (no Vue bridge)', async () => {
    render(<CanvasPanel data={{ elements: [] }} />)
    await waitFor(() => {
      expect(screen.getByTestId('canvas-panel')).toBeTruthy()
    })
    expect(screen.getByTestId('excalidraw-mock')).toBeTruthy()
    expect(screen.getByTestId('canvas-edit-toggle')).toBeTruthy()
  })

  it('renders AlertListPanel with mocked alerts', () => {
    render(
      <AlertListPanel
        alerts={[
          {
            id: '1',
            name: 'Disk full',
            severity: 'critical',
            state: 'firing',
            timestamp: new Date().toISOString(),
            message: 'root partition > 90%',
          },
        ]}
      />,
    )
    expect(screen.getByTestId('alert-list-container')).toBeTruthy()
    expect(screen.getByTestId('alert-name').textContent).toBe('Disk full')
    expect(screen.getByTestId('state-badge').textContent).toBe('firing')
    expect(screen.getByTestId('alert-message').textContent).toContain('root partition')
  })

  it('renders NodeGraphPanel with mocked topology data', () => {
    render(
      <NodeGraphPanel
        nodes={[
          { id: 'api', label: 'api' },
          { id: 'db', label: 'db' },
        ]}
        edges={[{ source: 'api', target: 'db', label: 'sql', value: 3 }]}
      />,
    )
    expect(screen.getByTestId('node-graph-container')).toBeTruthy()
    expect(screen.queryByTestId('node-graph-empty')).toBeNull()
    expect(document.querySelector('[data-node-id="api"]')).toBeTruthy()
    expect(document.querySelector('[data-node-id="db"]')).toBeTruthy()
  })

  it('renders AnnotationListPanel and DashboardListPanel with mocked rows', () => {
    render(
      <AnnotationListPanel
        annotations={[
          {
            id: 'n1',
            title: 'Deploy v2',
            timestamp: new Date().toISOString(),
            type: 'deploy',
            tags: ['prod'],
          },
        ]}
      />,
    )
    expect(screen.getByTestId('annotation-list-container')).toBeTruthy()
    expect(screen.getByTestId('annotation-title').textContent).toBe('Deploy v2')

    render(
      <DashboardListPanel
        dashboards={[
          {
            id: 'd1',
            title: 'SRE Overview',
            url: '/app/dashboards/d1',
            starred: true,
            tags: ['sre'],
          },
        ]}
      />,
    )
    expect(screen.getByTestId('dashboard-list-container')).toBeTruthy()
    expect(screen.getByTestId('dashboard-link').textContent).toBe('SRE Overview')
  })
})
