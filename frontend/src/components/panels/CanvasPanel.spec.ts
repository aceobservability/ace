import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRegistry } from '../../utils/panelRegistry'

// ---------------------------------------------------------------------------
// Mock React, ReactDOM, and Excalidraw — these won't run in happy-dom
// vi.hoisted ensures these are available when vi.mock factories are hoisted
// ---------------------------------------------------------------------------

const { mockRender, mockUnmount, mockCreateRoot } = vi.hoisted(() => {
  const mockRender = vi.fn()
  const mockUnmount = vi.fn()
  const mockCreateRoot = vi.fn(() => ({
    render: mockRender,
    unmount: mockUnmount,
  }))
  return { mockRender, mockUnmount, mockCreateRoot }
})

vi.mock('react', () => ({
  default: { createElement: vi.fn(() => null) },
  createElement: vi.fn(() => null),
}))

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}))

vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: {},
}))

/** Flush enough microtask ticks for the 3 chained dynamic imports to resolve */
async function flushMount() {
  for (let i = 0; i < 5; i++) {
    await flushPromises()
  }
}

// ---------------------------------------------------------------------------
// CanvasPanel component tests
// ---------------------------------------------------------------------------

describe('CanvasPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let CanvasPanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./CanvasPanel.vue')
    CanvasPanel = mod.default
  })

  afterEach(async () => {
    // Ensure any in-flight async mounts settle before the next test
    await flushMount()
  })

  it('renders container div with data-testid', async () => {
    const wrapper = mount(CanvasPanel)
    await flushMount()
    expect(wrapper.find('[data-testid="canvas-container"]').exists()).toBe(true)
  })

  it('container has correct styles (width 100%, height 100%, minHeight 300px)', async () => {
    const wrapper = mount(CanvasPanel)
    await flushMount()
    const container = wrapper.find('[data-testid="canvas-container"]')
    const style = container.attributes('style') ?? ''
    expect(style).toContain('width: 100%')
    expect(style).toContain('height: 100%')
    expect(style).toContain('min-height: 300px')
  })

  it('attempts to mount Excalidraw on mounted (createRoot called)', async () => {
    mount(CanvasPanel)
    await flushMount()
    expect(mockCreateRoot).toHaveBeenCalledTimes(1)
  })

  it('cleans up React root on unmount', async () => {
    const wrapper = mount(CanvasPanel)
    await flushMount()
    wrapper.unmount()
    expect(mockUnmount).toHaveBeenCalledTimes(1)
  })

  it('readOnly prop defaults to false', async () => {
    const wrapper = mount(CanvasPanel)
    await flushMount()
    expect(wrapper.props('readOnly')).toBe(false)
  })

  it('accepts readOnly prop as true', async () => {
    const wrapper = mount(CanvasPanel, {
      props: { readOnly: true },
    })
    await flushMount()
    expect(wrapper.props('readOnly')).toBe(true)
  })

  it('empty data defaults to empty elements array', async () => {
    const wrapper = mount(CanvasPanel)
    await flushMount()
    const data = wrapper.props('data')
    expect(data).toEqual({ elements: [] })
  })

  it('accepts custom data with elements', async () => {
    const customData = {
      elements: [{ type: 'rectangle', id: '1' }],
      appState: { viewBackgroundColor: '#000' },
    }
    const wrapper = mount(CanvasPanel, {
      props: { data: customData },
    })
    await flushMount()
    expect(wrapper.props('data')).toEqual(customData)
  })

  it('renders React root into the container element', async () => {
    mount(CanvasPanel)
    await flushMount()
    expect(mockCreateRoot).toHaveBeenCalledTimes(1)
    const arg = mockCreateRoot.mock.calls[0][0]
    expect(arg).toBeInstanceOf(HTMLDivElement)
  })

  it('calls render on the React root after creation', async () => {
    mount(CanvasPanel)
    await flushMount()
    expect(mockRender).toHaveBeenCalledTimes(1)
  })

  it('re-mounts Excalidraw when readOnly changes', async () => {
    const wrapper = mount(CanvasPanel, {
      props: { readOnly: false },
    })
    await flushMount()
    expect(mockCreateRoot).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ readOnly: true })
    await flushMount()

    // Should unmount old root and create new one
    expect(mockUnmount).toHaveBeenCalledTimes(1)
    expect(mockCreateRoot).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// Mount failure / fallback tests
// ---------------------------------------------------------------------------

describe('CanvasPanel mount failure', () => {
  it('shows fallback message when Excalidraw fails to load', async () => {
    vi.resetModules()

    vi.doMock('react', () => {
      throw new Error('React not available')
    })
    vi.doMock('react-dom/client', () => {
      throw new Error('ReactDOM not available')
    })
    vi.doMock('@excalidraw/excalidraw', () => {
      throw new Error('Excalidraw not available')
    })

    const { flushPromises: flush, mount: mountFresh } = await import('@vue/test-utils')
    const mod = await import('./CanvasPanel.vue')

    const wrapper = mountFresh(mod.default)

    // Wait for the async mountExcalidraw to settle (catches error)
    for (let i = 0; i < 5; i++) {
      await flush()
    }

    const container = wrapper.find('[data-testid="canvas-container"]')
    expect(container.exists()).toBe(true)
    expect(container.text()).toContain('Canvas editor failed to load')
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('canvas panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    vi.resetModules()
    clearRegistry()

    const { registerPanel } = await import('../../utils/panelRegistry')
    const { PenTool } = await import('lucide-vue-next')

    registerPanel({
      type: 'canvas',
      component: () => import('./CanvasPanel.vue'),
      dataAdapter: (_raw: { series: unknown[] }, query?: Record<string, unknown>) => {
        const canvasData = query?.canvasData as
          | { elements?: unknown[]; appState?: unknown }
          | undefined
        return {
          data: {
            elements: canvasData?.elements ?? [],
            appState: canvasData?.appState ?? {},
          },
        }
      },
      defaultQuery: { canvasData: { elements: [], appState: {} } },
      category: 'widgets',
      label: 'Canvas',
      icon: PenTool,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('canvas')
  })

  afterEach(() => {
    clearRegistry()
  })

  it('registers with type "canvas"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('canvas')
  })

  it('registers with category "widgets"', () => {
    expect(reg?.category).toBe('widgets')
  })

  it('registers with label "Canvas"', () => {
    expect(reg?.label).toBe('Canvas')
  })

  it('dataAdapter reads canvasData from query', () => {
    const query = {
      canvasData: {
        elements: [{ id: '1', type: 'rect' }],
        appState: { theme: 'dark' },
      },
    }
    const result = reg!.dataAdapter({ series: [] }, query)
    expect(result.data.elements).toEqual([{ id: '1', type: 'rect' }])
    expect(result.data.appState).toEqual({ theme: 'dark' })
  })

  it('dataAdapter handles missing canvasData', () => {
    const result = reg!.dataAdapter({ series: [] }, {})
    expect(result.data.elements).toEqual([])
    expect(result.data.appState).toEqual({})
  })

  it('dataAdapter handles undefined query', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result.data.elements).toEqual([])
    expect(result.data.appState).toEqual({})
  })

  it('defaultQuery contains canvasData with empty elements and appState', () => {
    expect(reg?.defaultQuery).toEqual({
      canvasData: { elements: [], appState: {} },
    })
  })
})
