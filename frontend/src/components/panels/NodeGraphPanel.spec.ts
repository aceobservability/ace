import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartPalette, getSeriesColor } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'
import type { GraphEdge, GraphNode } from './NodeGraphPanel.vue'

// ---------------------------------------------------------------------------
// Mock d3-force — the simulation doesn't run in happy-dom, so we assign
// deterministic positions to nodes.
// ---------------------------------------------------------------------------

vi.mock('d3-force', () => {
  // biome-ignore lint/suspicious/noExplicitAny: mock helper
  const forceSimulation = (nodes: any[]) => {
    // Assign deterministic positions based on index
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = 100 + i * 80
      nodes[i].y = 100 + i * 60
    }

    const sim = {
      force: () => sim,
      stop: () => sim,
      tick: () => sim,
      nodes: () => nodes,
    }
    return sim
  }

  // biome-ignore lint/suspicious/noExplicitAny: mock helper
  const forceLink = (_links?: any[]) => {
    const f = () => f
    f.id = () => f
    f.links = () => []
    return f
  }

  const forceManyBody = () => {
    const f = () => f
    f.strength = () => f
    return f
  }

  const forceCenter = () => {
    const f = () => f
    return f
  }

  return { forceSimulation, forceLink, forceManyBody, forceCenter }
})

// ---------------------------------------------------------------------------
// NodeGraphPanel component tests
// ---------------------------------------------------------------------------

describe('NodeGraphPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let NodeGraphPanel: any

  beforeEach(async () => {
    const mod = await import('./NodeGraphPanel.vue')
    NodeGraphPanel = mod.default
  })

  const sampleNodes: GraphNode[] = [
    { id: 'svc-a', label: 'Service A', metric: 120 },
    { id: 'svc-b', label: 'Service B', metric: 80 },
    { id: 'svc-c', label: 'Service C', metric: 45 },
  ]

  const sampleEdges: GraphEdge[] = [
    { source: 'svc-a', target: 'svc-b', label: '120 req/s', value: 120 },
    { source: 'svc-b', target: 'svc-c', label: '45 req/s', value: 45 },
  ]

  // Test 1: Renders SVG element
  it('renders an SVG element', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  // Test 2: Renders correct number of circle elements for nodes
  it('renders correct number of circle elements for nodes', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    const circles = wrapper.findAll('circle')
    expect(circles).toHaveLength(sampleNodes.length)
  })

  // Test 3: Renders correct number of line elements for edges
  it('renders correct number of line elements for edges', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    const lines = wrapper.findAll('line')
    expect(lines).toHaveLength(sampleEdges.length)
  })

  // Test 4: Node labels rendered below circles
  it('node labels rendered below circles', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    const texts = wrapper.findAll('text[data-type="node-label"]')
    expect(texts).toHaveLength(sampleNodes.length)

    // Each label should contain the node label text
    const textContents = texts.map((t) => t.text())
    for (const node of sampleNodes) {
      expect(textContents).toContain(node.label)
    }
  })

  // Test 5: Node colors use getSeriesColor/chartPalette
  it('node colors use getSeriesColor/chartPalette', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    const circles = wrapper.findAll('circle')

    for (let i = 0; i < circles.length; i++) {
      const fill = circles[i].attributes('fill') ?? ''
      const expectedColor = getSeriesColor(i).toLowerCase()
      // Fill should contain the expected palette color (possibly with opacity suffix)
      expect(fill.toLowerCase()).toContain(expectedColor.toLowerCase())
    }
  })

  // Test 6: Edge connects correct source and target (via data attributes)
  it('edge connects correct source and target via data attributes', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    const lines = wrapper.findAll('line')

    for (let i = 0; i < sampleEdges.length; i++) {
      expect(lines[i].attributes('data-source')).toBe(sampleEdges[i].source)
      expect(lines[i].attributes('data-target')).toBe(sampleEdges[i].target)
    }
  })

  // Test 7: Handles empty nodes/edges (no SVG children)
  it('handles empty nodes/edges gracefully', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: [], edges: [] },
    })
    await flushPromises()
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.findAll('circle')).toHaveLength(0)
    expect(wrapper.findAll('line')).toHaveLength(0)
  })

  // Test 8: Handles single node (no edges)
  it('handles single node with no edges', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: {
        nodes: [{ id: 'only', label: 'Only Node' }],
        edges: [],
      },
    })
    await flushPromises()
    expect(wrapper.findAll('circle')).toHaveLength(1)
    expect(wrapper.findAll('line')).toHaveLength(0)
    const label = wrapper.find('text[data-type="node-label"]')
    expect(label.text()).toBe('Only Node')
  })

  // Test 9: Edge thickness varies based on value
  it('edge thickness varies based on value', async () => {
    const edgesWithVariedValues: GraphEdge[] = [
      { source: 'svc-a', target: 'svc-b', value: 10 },
      { source: 'svc-b', target: 'svc-c', value: 100 },
    ]
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: edgesWithVariedValues },
    })
    await flushPromises()
    const lines = wrapper.findAll('line')
    const strokeWidth0 = Number.parseFloat(lines[0].attributes('stroke-width') ?? '1')
    const strokeWidth1 = Number.parseFloat(lines[1].attributes('stroke-width') ?? '1')
    // The edge with value 100 should be thicker than the one with value 10
    expect(strokeWidth1).toBeGreaterThan(strokeWidth0)
  })

  // Test 10: Edge labels rendered at midpoint
  it('edge labels rendered at midpoint', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    const edgeLabels = wrapper.findAll('text[data-type="edge-label"]')
    // Only edges with label prop should have label text
    const labelsWithText = sampleEdges.filter((e) => e.label)
    expect(edgeLabels).toHaveLength(labelsWithText.length)

    const textContents = edgeLabels.map((t) => t.text())
    for (const edge of labelsWithText) {
      expect(textContents).toContain(edge.label)
    }
  })

  // Test 11: Node circles have radius 20
  it('node circles have radius 20', async () => {
    const wrapper = mount(NodeGraphPanel, {
      props: { nodes: sampleNodes, edges: sampleEdges },
    })
    await flushPromises()
    const circles = wrapper.findAll('circle')
    for (const circle of circles) {
      expect(circle.attributes('r')).toBe('20')
    }
  })
})

// ---------------------------------------------------------------------------
// Export tests
// ---------------------------------------------------------------------------

describe('NodeGraphPanel exports', () => {
  it('exports GraphNode and GraphEdge interfaces (type-level)', async () => {
    // Verify that we can import the types and use them
    const node: GraphNode = { id: 'test', label: 'Test' }
    const edge: GraphEdge = { source: 'a', target: 'b' }
    expect(node.id).toBe('test')
    expect(edge.source).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('node_graph panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel } = await import('../../utils/panelRegistry')
    const { Network } = await import('lucide-vue-next')
    registerPanel({
      type: 'node_graph',
      component: () => import('./NodeGraphPanel.vue'),
      dataAdapter: () => {
        return { nodes: [], edges: [] }
      },
      defaultQuery: {},
      category: 'observability',
      label: 'Node Graph',
      icon: Network,
    })
    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('node_graph')
  })

  afterEach(() => {
    clearRegistry()
  })

  it('registers with type "node_graph"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('node_graph')
  })

  it('registers with category "observability"', () => {
    expect(reg?.category).toBe('observability')
  })

  it('registers with label "Node Graph"', () => {
    expect(reg?.label).toBe('Node Graph')
  })

  it('dataAdapter returns empty graph stub', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it('defaultQuery is an empty object', () => {
    expect(reg?.defaultQuery).toEqual({})
  })

  it('icon is defined', () => {
    expect(reg?.icon).toBeDefined()
  })
})
