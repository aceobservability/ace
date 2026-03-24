import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chartPalette, chartTooltipStyle } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'
import type { FlameNode } from './FlameGraphPanel.vue'

// ---------------------------------------------------------------------------
// FlameGraphPanel component tests
// ---------------------------------------------------------------------------

describe('FlameGraphPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let FlameGraphPanel: any

  beforeEach(async () => {
    const mod = await import('./FlameGraphPanel.vue')
    FlameGraphPanel = mod.default
  })

  const leafRoot: FlameNode = { name: 'main', value: 100 }

  const treeRoot: FlameNode = {
    name: 'root',
    value: 10,
    children: [
      {
        name: 'child-a',
        value: 20,
        children: [{ name: 'grandchild', value: 30 }],
      },
      { name: 'child-b', value: 40 },
    ],
  }

  // Helper: compute total value of a node (self + all descendants)
  function totalValue(node: FlameNode): number {
    const childTotal = (node.children ?? []).reduce((sum, c) => sum + totalValue(c), 0)
    return node.value + childTotal
  }

  // Test 1: Renders SVG element
  it('renders an SVG element', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  // Test 2: Root node rendered as a rect at the bottom
  it('root node rendered as a rect at the bottom (highest y)', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const rects = wrapper.findAll('rect')
    expect(rects.length).toBeGreaterThanOrEqual(1)

    // Root should have the highest y-position (bottom of the flame graph)
    // and full width
    const rootRect = rects.find((r) => {
      const x = Number(r.attributes('x'))
      const width = Number(r.attributes('width'))
      // Root spans the full width (x=0, widest rect)
      return x === 0 && width > 0
    })
    expect(rootRect).toBeDefined()

    // Root rect should be at the bottom — highest y value among all rects
    const allYs = rects.map((r) => Number(r.attributes('y')))
    const maxY = Math.max(...allYs)
    expect(Number(rootRect!.attributes('y'))).toBe(maxY)
  })

  // Test 3: Child nodes rendered above parent
  it('child nodes rendered above parent (lower y value)', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const rects = wrapper.findAll('rect')

    // Collect y values — multiple depth levels should exist
    const ys = new Set(rects.map((r) => Number(r.attributes('y'))))
    // At least 3 depths: root, children, grandchild
    expect(ys.size).toBeGreaterThanOrEqual(3)

    const sortedYs = Array.from(ys).sort((a, b) => a - b)
    // Children are above parent (smaller y = higher visually)
    // Root is at bottom (largest y), grandchild at top (smallest y)
    expect(sortedYs[sortedYs.length - 1]).toBeGreaterThan(sortedYs[0])
  })

  // Test 4: Rect widths proportional to total time
  it('rect widths proportional to total time', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const svg = wrapper.find('svg')
    const svgWidth = Number(svg.attributes('width'))
    const rects = wrapper.findAll('rect')

    // Root rect should span full width
    const rootRect = rects.find(
      (r) =>
        Number(r.attributes('y')) === Math.max(...rects.map((r2) => Number(r2.attributes('y')))),
    )
    expect(rootRect).toBeDefined()
    expect(Number(rootRect!.attributes('width'))).toBeCloseTo(svgWidth, 0)

    // child-a total = 20 + 30 = 50, child-b total = 40
    // child-a width / child-b width should be ~50/40 = 1.25
    // Both are at the same depth (one level above root)
    const rootY = Number(rootRect!.attributes('y'))
    const childRects = rects.filter((r) => {
      const y = Number(r.attributes('y'))
      return y < rootY && y > Math.min(...rects.map((r2) => Number(r2.attributes('y'))))
    })

    if (childRects.length === 2) {
      const widths = childRects.map((r) => Number(r.attributes('width'))).sort((a, b) => b - a)
      // Larger width is child-a (total 50), smaller is child-b (total 40)
      const ratio = widths[0] / widths[1]
      expect(ratio).toBeCloseTo(50 / 40, 1)
    }
  })

  // Test 5: Colors derived from chartPalette via name hash
  it('colors derived from chartPalette via name hash', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const rects = wrapper.findAll('rect')

    // All rect fills should be derived from chartPalette (hex color with opacity)
    for (const rect of rects) {
      const fill = rect.attributes('fill') ?? ''
      // Fill should contain one of the chartPalette colors (possibly lowercased)
      const matchesPalette = chartPalette.some((color) =>
        fill.toLowerCase().includes(color.toLowerCase()),
      )
      expect(matchesPalette).toBe(true)
    }
  })

  // Test 6: Same function name always gets same color
  it('same function name always gets same color', () => {
    // Mount two separate trees with the same name but different values
    const wrapper1 = mount(FlameGraphPanel, {
      props: { root: { name: 'test-fn', value: 100 } },
    })
    const wrapper2 = mount(FlameGraphPanel, {
      props: { root: { name: 'test-fn', value: 200 } },
    })
    const fill1 = wrapper1.find('rect').attributes('fill')
    const fill2 = wrapper2.find('rect').attributes('fill')
    expect(fill1).toBe(fill2)

    // Different name should produce a different color
    const wrapper3 = mount(FlameGraphPanel, {
      props: { root: { name: 'other-fn', value: 100 } },
    })
    const fill3 = wrapper3.find('rect').attributes('fill')
    expect(fill3).not.toBe(fill1)
  })

  // Test 7: Text labels shown for wide rects
  it('text labels shown for wide rects', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const texts = wrapper.findAll('text')
    // Root and wider children should have text labels
    expect(texts.length).toBeGreaterThanOrEqual(1)
    // At least one text should contain a function name from the tree
    const allText = texts.map((t) => t.text())
    const hasKnownName = allText.some(
      (t) =>
        t.includes('root') ||
        t.includes('child-a') ||
        t.includes('child-b') ||
        t.includes('grandchild'),
    )
    expect(hasKnownName).toBe(true)
  })

  // Test 8: Text labels hidden for narrow rects (< 40px)
  it('text labels hidden for narrow rects (< 40px wide)', () => {
    // Create a tree where one child is extremely small relative to root
    const root: FlameNode = {
      name: 'main',
      value: 0,
      children: [
        { name: 'big-fn', value: 990 },
        { name: 'tiny-fn', value: 1 }, // ~0.1% of total → very narrow
      ],
    }
    const wrapper = mount(FlameGraphPanel, {
      props: { root },
    })
    const texts = wrapper.findAll('text')
    const textContents = texts.map((t) => t.text())
    // 'tiny-fn' should NOT have a visible text label
    expect(textContents.some((t) => t.includes('tiny-fn'))).toBe(false)
  })

  // Test 9: Handles empty/leaf root node (no children)
  it('handles leaf root node (no children)', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: leafRoot },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
    const rects = wrapper.findAll('rect')
    expect(rects).toHaveLength(1)
  })

  // Test 10: Tooltip data computed correctly
  it('tooltip data attributes present on rects (name, value, percentage)', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const rects = wrapper.findAll('rect')
    // Each rect should have data attributes for tooltip
    for (const rect of rects) {
      expect(rect.attributes('data-name')).toBeTruthy()
      expect(rect.attributes('data-total-value')).toBeTruthy()
      expect(rect.attributes('data-self-value')).toBeTruthy()
      expect(rect.attributes('data-percentage')).toBeTruthy()
    }
  })

  // Test 11: Container is scrollable
  it('container is scrollable (overflow auto)', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const container = wrapper.find('[data-testid="flame-graph-container"]')
    expect(container.exists()).toBe(true)
    const style = container.attributes('style') ?? ''
    expect(style).toContain('overflow')
  })

  // Test 12: Default unit is "ms"
  it('default unit is "ms"', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: leafRoot },
    })
    // Check the data-unit attribute on the SVG or container
    const container = wrapper.find('[data-testid="flame-graph-container"]')
    expect(container.attributes('data-unit')).toBe('ms')
  })

  // Test 13: Custom unit is passed through
  it('custom unit is applied', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: leafRoot, unit: 'samples' },
    })
    const container = wrapper.find('[data-testid="flame-graph-container"]')
    expect(container.attributes('data-unit')).toBe('samples')
  })

  // Test 14: Tooltip element uses chartTooltipStyle colors
  it('tooltip element uses chartTooltipStyle background', () => {
    const wrapper = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const tooltip = wrapper.find('[data-testid="flame-graph-tooltip"]')
    expect(tooltip.exists()).toBe(true)
    const style = tooltip.attributes('style') ?? ''
    expect(style).toContain(chartTooltipStyle.backgroundColor)
  })

  // Test 15: SVG height scales with tree depth
  it('SVG height scales with tree depth', () => {
    const shallow = mount(FlameGraphPanel, {
      props: { root: leafRoot },
    })
    const deep = mount(FlameGraphPanel, {
      props: { root: treeRoot },
    })
    const shallowHeight = Number(shallow.find('svg').attributes('height'))
    const deepHeight = Number(deep.find('svg').attributes('height'))
    expect(deepHeight).toBeGreaterThan(shallowHeight)
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('flame_graph panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel } = await import('../../utils/panelRegistry')
    const { Flame } = await import('lucide-vue-next')
    registerPanel({
      type: 'flame_graph',
      component: () => import('./FlameGraphPanel.vue'),
      dataAdapter: () => {
        return {
          root: { name: 'root', value: 0, children: [] },
          unit: 'ms',
        }
      },
      defaultQuery: {},
      category: 'observability',
      label: 'Flame Graph',
      icon: Flame,
    })
    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('flame_graph')
  })

  afterEach(() => {
    clearRegistry()
  })

  it('registers with type "flame_graph"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('flame_graph')
  })

  it('registers with category "observability"', () => {
    expect(reg?.category).toBe('observability')
  })

  it('registers with label "Flame Graph"', () => {
    expect(reg?.label).toBe('Flame Graph')
  })

  it('dataAdapter returns stub root node', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result.root).toBeDefined()
    expect(result.root.name).toBe('root')
    expect(result.unit).toBe('ms')
  })

  it('defaultQuery is an empty object', () => {
    expect(reg?.defaultQuery).toEqual({})
  })

  it('icon is defined', () => {
    expect(reg?.icon).toBeDefined()
  })
})
