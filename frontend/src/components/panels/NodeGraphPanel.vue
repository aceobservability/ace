<script setup lang="ts">
import type { SimulationNodeDatum } from 'd3-force'
import { forceCenter, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { computed, onMounted, ref, watch } from 'vue'
import { getSeriesColor } from '../../utils/chartTheme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string
  label: string
  metric?: number
}

export interface GraphEdge {
  source: string
  target: string
  label?: string
  value?: number
}

// ---------------------------------------------------------------------------
// Internal simulation types
// ---------------------------------------------------------------------------

interface SimNode extends SimulationNodeDatum {
  id: string
  label: string
  metric?: number
}

interface SimEdge {
  source: string
  target: string
  label?: string
  value?: number
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  nodes: GraphNode[]
  edges: GraphEdge[]
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
}>()

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_RADIUS = 20
const SVG_WIDTH = 600
const SVG_HEIGHT = 400
const MAX_ITERATIONS = 300
const EDGE_MIN_WIDTH = 1
const EDGE_MAX_WIDTH = 4

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const simulatedNodes = ref<SimNode[]>([])
const simulatedEdges = ref<SimEdge[]>([])

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

/** Normalize edge value to a stroke width between EDGE_MIN_WIDTH and EDGE_MAX_WIDTH. */
const edgeMaxValue = computed(() => {
  const values = props.edges.filter((e) => e.value != null).map((e) => e.value!)
  return values.length > 0 ? Math.max(...values) : 1
})

const edgeMinValue = computed(() => {
  const values = props.edges.filter((e) => e.value != null).map((e) => e.value!)
  return values.length > 0 ? Math.min(...values) : 0
})

function edgeStrokeWidth(value?: number): number {
  if (value == null) return EDGE_MIN_WIDTH
  const range = edgeMaxValue.value - edgeMinValue.value
  if (range === 0) return (EDGE_MIN_WIDTH + EDGE_MAX_WIDTH) / 2
  const t = (value - edgeMinValue.value) / range
  return EDGE_MIN_WIDTH + t * (EDGE_MAX_WIDTH - EDGE_MIN_WIDTH)
}

/** Look up a simulated node by id. */
function findNode(id: string): SimNode | undefined {
  return simulatedNodes.value.find((n) => n.id === id)
}

/** Clamp a value within [min, max]. */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function runSimulation() {
  if (props.nodes.length === 0) {
    simulatedNodes.value = []
    simulatedEdges.value = []
    return
  }

  // Create mutable copies for d3
  const simNodes: SimNode[] = props.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    metric: n.metric,
  }))

  const simEdges: SimEdge[] = props.edges.map((e) => ({
    source: e.source,
    target: e.target,
    label: e.label,
    value: e.value,
  }))

  // Build force simulation
  // biome-ignore lint/suspicious/noExplicitAny: d3-force generic constraints require relaxed typing for link id accessor
  const linkForce = forceLink<SimNode, SimEdge>(simEdges as any).id((d: any) => d.id)
  const simulation = forceSimulation<SimNode>(simNodes)
    .force('link', linkForce)
    .force('charge', forceManyBody().strength(-200))
    .force('center', forceCenter(SVG_WIDTH / 2, SVG_HEIGHT / 2))
    .stop()

  // Run simulation synchronously for MAX_ITERATIONS
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    simulation.tick()
  }

  // Clamp positions to viewport
  for (const node of simNodes) {
    node.x = clamp(node.x ?? SVG_WIDTH / 2, NODE_RADIUS, SVG_WIDTH - NODE_RADIUS)
    node.y = clamp(node.y ?? SVG_HEIGHT / 2, NODE_RADIUS, SVG_HEIGHT - NODE_RADIUS)
  }

  simulatedNodes.value = simNodes
  simulatedEdges.value = simEdges
}

// Run on mount and re-run when props change
onMounted(runSimulation)
watch([() => props.nodes, () => props.edges], runSimulation, { deep: true })

// ---------------------------------------------------------------------------
// Edge color — use outline-variant at higher opacity for visibility
// ---------------------------------------------------------------------------

const edgeColor = 'var(--color-outline-variant)'

const emptyStyle = {
  position: 'absolute' as const,
  inset: '0',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.35rem',
  color: 'var(--color-on-surface-variant)',
  fontSize: '0.875rem',
  textAlign: 'center' as const,
  padding: '1rem',
}

const emptyTitleStyle = {
  color: 'var(--color-on-surface)',
  fontWeight: '600',
}

const emptyDescriptionStyle = {
  maxWidth: '22rem',
  fontSize: '0.75rem',
  lineHeight: '1.35',
}

const emptyActionStyle = {
  marginTop: '0.25rem',
  fontSize: '0.6875rem',
  fontWeight: '600',
  color: 'var(--color-primary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}
</script>

<template>
  <div
    data-testid="node-graph-container"
    :style="{
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: 'transparent',
    }"
  >
    <svg
      :width="SVG_WIDTH"
      :height="SVG_HEIGHT"
      :style="{ display: 'block', fontFamily: '\'DM Sans\', sans-serif' }"
    >
      <!-- Edges (lines) -->
      <line
        v-for="(edge, i) in simulatedEdges"
        :key="'edge-' + i"
        :x1="findNode(edge.source)?.x ?? 0"
        :y1="findNode(edge.source)?.y ?? 0"
        :x2="findNode(edge.target)?.x ?? 0"
        :y2="findNode(edge.target)?.y ?? 0"
        :stroke="edgeColor"
        :stroke-width="edgeStrokeWidth(edge.value)"
        :data-source="edge.source"
        :data-target="edge.target"
      />

      <!-- Edge labels -->
      <text
        v-for="(edge, i) in simulatedEdges"
        v-show="edge.label"
        :key="'edge-label-' + i"
        data-type="edge-label"
        :x="((findNode(edge.source)?.x ?? 0) + (findNode(edge.target)?.x ?? 0)) / 2"
        :y="((findNode(edge.source)?.y ?? 0) + (findNode(edge.target)?.y ?? 0)) / 2"
        text-anchor="middle"
        :style="{
          fontSize: '10px',
          fontFamily: '\'DM Sans\', sans-serif',
          fill: 'var(--color-on-surface-variant)',
          pointerEvents: 'none',
          userSelect: 'none',
        }"
      >
        {{ edge.label }}
      </text>

      <!-- Nodes (circles) -->
      <circle
        v-for="(node, i) in simulatedNodes"
        :key="'node-' + node.id"
        :cx="node.x"
        :cy="node.y"
        :r="NODE_RADIUS"
        :fill="getSeriesColor(i) + 'e6'"
        :stroke="getSeriesColor(i)"
        stroke-width="1.5"
        :data-node-id="node.id"
      />

      <!-- Node labels -->
      <text
        v-for="node in simulatedNodes"
        :key="'label-' + node.id"
        data-type="node-label"
        :x="node.x"
        :y="(node.y ?? 0) + NODE_RADIUS + 14"
        text-anchor="middle"
        :style="{
          fontSize: '11px',
          fontFamily: '\'DM Sans\', sans-serif',
          fill: 'var(--color-on-surface-variant)',
          pointerEvents: 'none',
          userSelect: 'none',
        }"
      >
        {{ node.label }}
      </text>
    </svg>

    <div
      v-if="props.nodes.length === 0"
      data-testid="node-graph-empty"
      :style="emptyStyle"
    >
      <div :style="emptyTitleStyle">{{ props.emptyTitle || 'No service graph data' }}</div>
      <div v-if="props.emptyDescription" :style="emptyDescriptionStyle">
        {{ props.emptyDescription }}
      </div>
      <div v-if="props.emptyActionLabel" :style="emptyActionStyle">
        {{ props.emptyActionLabel }}
      </div>
    </div>
  </div>
</template>
