<script setup lang="ts">
import { computed, ref } from 'vue'
import { chartPalette, chartTooltipStyle } from '../../utils/chartTheme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlameNode {
  name: string
  value: number
  children?: FlameNode[]
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = withDefaults(
  defineProps<{
    root: FlameNode
    unit?: string
  }>(),
  { unit: 'ms' },
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 20
const SVG_WIDTH = 960

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple string hash to deterministically map a name to a palette index. */
function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Returns total value of a node (self + all descendants). */
function computeTotal(node: FlameNode): number {
  const childTotal = (node.children ?? []).reduce((sum, c) => sum + computeTotal(c), 0)
  return node.value + childTotal
}

/** Returns the max depth of the tree (0-indexed). */
function computeMaxDepth(node: FlameNode, depth = 0): number {
  if (!node.children || node.children.length === 0) return depth
  return Math.max(...node.children.map((c) => computeMaxDepth(c, depth + 1)))
}

// ---------------------------------------------------------------------------
// Flattened rect representation
// ---------------------------------------------------------------------------

interface FlatRect {
  name: string
  x: number
  y: number
  width: number
  depth: number
  selfValue: number
  totalValue: number
}

function flattenTree(
  node: FlameNode,
  rootTotal: number,
  maxDepth: number,
  xOffset: number,
  depth: number,
): FlatRect[] {
  const nodeTotalValue = computeTotal(node)
  const width = (nodeTotalValue / rootTotal) * SVG_WIDTH
  // Bottom-up: root at maxDepth, children at maxDepth - 1, etc.
  const y = (maxDepth - depth) * ROW_HEIGHT

  const rect: FlatRect = {
    name: node.name,
    x: xOffset,
    y,
    width,
    depth,
    selfValue: node.value,
    totalValue: nodeTotalValue,
  }

  const result: FlatRect[] = [rect]

  let childX = xOffset
  for (const child of node.children ?? []) {
    const childRects = flattenTree(child, rootTotal, maxDepth, childX, depth + 1)
    result.push(...childRects)
    childX += (computeTotal(child) / rootTotal) * SVG_WIDTH
  }

  return result
}

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const rootTotal = computed(() => computeTotal(props.root))
const maxDepth = computed(() => computeMaxDepth(props.root))
const svgHeight = computed(() => (maxDepth.value + 1) * ROW_HEIGHT)

const rects = computed(() => {
  const total = rootTotal.value
  if (total === 0) return []
  return flattenTree(props.root, total, maxDepth.value, 0, 0)
})

function rectFill(name: string): string {
  const idx = hashName(name) % chartPalette.length
  return `${chartPalette[idx]}d9` // hex opacity ~0.85
}

function rectStroke(name: string): string {
  const idx = hashName(name) % chartPalette.length
  return chartPalette[idx]
}

function rectPercentage(rect: FlatRect): string {
  const pct = rootTotal.value > 0 ? ((rect.totalValue / rootTotal.value) * 100).toFixed(1) : '0.0'
  return pct
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const tooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipRect = ref<FlatRect | null>(null)

function onRectEnter(event: MouseEvent, rect: FlatRect) {
  tooltipRect.value = rect
  tooltipX.value = event.offsetX + 12
  tooltipY.value = event.offsetY - 10
  tooltipVisible.value = true
}

function onRectMove(event: MouseEvent) {
  tooltipX.value = event.offsetX + 12
  tooltipY.value = event.offsetY - 10
}

function onRectLeave() {
  tooltipVisible.value = false
  tooltipRect.value = null
}
</script>

<template>
  <div
    data-testid="flame-graph-container"
    :data-unit="props.unit"
    :style="{
      overflow: 'auto',
      height: '100%',
      width: '100%',
      position: 'relative',
      backgroundColor: 'transparent',
    }"
  >
    <svg
      :width="SVG_WIDTH"
      :height="svgHeight"
      :style="{ display: 'block', fontFamily: '\'DM Sans\', sans-serif' }"
    >
      <rect
        v-for="(rect, i) in rects"
        :key="i"
        :x="rect.x"
        :y="rect.y"
        :width="rect.width"
        :height="ROW_HEIGHT"
        :fill="rectFill(rect.name)"
        :stroke="rectStroke(rect.name)"
        stroke-width="0.5"
        :data-name="rect.name"
        :data-total-value="String(rect.totalValue)"
        :data-self-value="String(rect.selfValue)"
        :data-percentage="rectPercentage(rect)"
        style="cursor: pointer"
        @mouseenter="onRectEnter($event, rect)"
        @mousemove="onRectMove"
        @mouseleave="onRectLeave"
      />
      <text
        v-for="(rect, i) in rects"
        :key="'t' + i"
        v-show="rect.width >= 40"
        :x="rect.x + 4"
        :y="rect.y + 14"
        :style="{
          fontSize: '11px',
          fontFamily: '\'DM Sans\', sans-serif',
          fill: 'var(--color-on-surface)',
          pointerEvents: 'none',
          userSelect: 'none',
        }"
      >
        <template v-if="rect.width >= 40">{{ rect.name.length > rect.width / 7 ? rect.name.slice(0, Math.floor(rect.width / 7) - 1) + '…' : rect.name }}</template>
      </text>
    </svg>

    <!-- Tooltip -->
    <div
      data-testid="flame-graph-tooltip"
      :style="{
        position: 'absolute',
        left: tooltipX + 'px',
        top: tooltipY + 'px',
        pointerEvents: 'none',
        display: tooltipVisible ? 'block' : 'none',
        backgroundColor: chartTooltipStyle.backgroundColor,
        borderColor: chartTooltipStyle.borderColor,
        border: '1px solid ' + chartTooltipStyle.borderColor,
        color: chartTooltipStyle.textStyle.color,
        fontFamily: chartTooltipStyle.textStyle.fontFamily,
        fontSize: chartTooltipStyle.textStyle.fontSize + 'px',
        padding: '6px 10px',
        borderRadius: '4px',
        zIndex: '100',
        whiteSpace: 'nowrap',
      }"
    >
      <template v-if="tooltipRect">
        <div :style="{ fontWeight: '600', marginBottom: '2px' }">{{ tooltipRect.name }}</div>
        <div>Self: {{ tooltipRect.selfValue }} {{ props.unit }}</div>
        <div>Total: {{ tooltipRect.totalValue }} {{ props.unit }}</div>
        <div>{{ rectPercentage(tooltipRect) }}% of root</div>
      </template>
    </div>
  </div>
</template>
