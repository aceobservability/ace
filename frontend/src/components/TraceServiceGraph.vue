<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TraceServiceGraph, TraceServiceGraphEdge, TraceServiceGraphNode } from '../types/datasource'

interface PositionedNode extends TraceServiceGraphNode {
  x: number
  y: number
}

interface PositionedEdge extends TraceServiceGraphEdge {
  key: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

const props = defineProps<{
  graph: TraceServiceGraph
}>()

const emit = defineEmits<{
  (e: 'select-service', serviceName: string): void
  (e: 'select-edge', edge: { source: string, target: string }): void
}>()

const graphWidth = 940
const graphHeight = 340
const nodePaddingX = 80
const nodePaddingY = 46

const zoomPercent = ref(100)
const panX = ref(0)
const panY = ref(0)

const selectedService = ref<string | null>(null)
const selectedEdgeKey = ref<string | null>(null)

const nodeByService = computed(() => {
  return new Map(props.graph.nodes.map((node) => [node.serviceName, node]))
})

const maxNodeRequests = computed(() => {
  return props.graph.nodes.reduce((max, node) => Math.max(max, node.requestCount), 1)
})

const maxEdgeRequests = computed(() => {
  return props.graph.edges.reduce((max, edge) => Math.max(max, edge.requestCount), 1)
})

const positionedNodes = computed<PositionedNode[]>(() => {
  if (props.graph.nodes.length === 0) {
    return []
  }

  const sortedServices = props.graph.nodes
    .map((node) => node.serviceName)
    .sort((a, b) => a.localeCompare(b))

  const levelByService = new Map<string, number>()
  for (const serviceName of sortedServices) {
    levelByService.set(serviceName, 0)
  }

  for (let i = 0; i < sortedServices.length; i += 1) {
    let changed = false
    for (const edge of props.graph.edges) {
      if (edge.source === edge.target) {
        continue
      }

      if (!levelByService.has(edge.source) || !levelByService.has(edge.target)) {
        continue
      }

      const sourceLevel = levelByService.get(edge.source) || 0
      const targetLevel = levelByService.get(edge.target) || 0
      if (targetLevel <= sourceLevel) {
        levelByService.set(edge.target, sourceLevel + 1)
        changed = true
      }
    }

    if (!changed) {
      break
    }
  }

  const maxLevel = Math.max(...levelByService.values(), 0)
  const levelCount = maxLevel + 1

  const levels = new Map<number, TraceServiceGraphNode[]>()
  for (const node of props.graph.nodes) {
    const level = levelByService.get(node.serviceName) || 0
    const list = levels.get(level) || []
    list.push(node)
    levels.set(level, list)
  }

  const positioned: PositionedNode[] = []
  for (let level = 0; level <= maxLevel; level += 1) {
    const list = levels.get(level) || []
    list.sort((a, b) => b.requestCount - a.requestCount || a.serviceName.localeCompare(b.serviceName))

    const x = levelCount > 1
      ? nodePaddingX + (level * (graphWidth - nodePaddingX * 2)) / (levelCount - 1)
      : graphWidth / 2

    if (list.length <= 1) {
      const node = list[0]
      if (node) {
        positioned.push({ ...node, x, y: graphHeight / 2 })
      }
      continue
    }

    const ySpacing = (graphHeight - nodePaddingY * 2) / (list.length - 1)
    list.forEach((node, index) => {
      positioned.push({
        ...node,
        x,
        y: nodePaddingY + ySpacing * index,
      })
    })
  }

  return positioned
})

const positionedNodeByService = computed(() => {
  return new Map(positionedNodes.value.map((node) => [node.serviceName, node]))
})

const positionedEdges = computed<PositionedEdge[]>(() => {
  const positioned: PositionedEdge[] = []

  for (const edge of props.graph.edges) {
    const source = positionedNodeByService.value.get(edge.source)
    const target = positionedNodeByService.value.get(edge.target)
    if (!source || !target) {
      continue
    }

    positioned.push({
      ...edge,
      key: `${edge.source}->${edge.target}`,
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
    })
  }

  return positioned
})

const canvasTransform = computed(() => {
  const scale = zoomPercent.value / 100
  return `translate(${panX.value} ${panY.value}) scale(${scale})`
})

function edgePath(edge: PositionedEdge): string {
  const horizontalDistance = Math.abs(edge.targetX - edge.sourceX)
  const controlX = (edge.sourceX + edge.targetX) / 2
  const controlY = ((edge.sourceY + edge.targetY) / 2) - Math.max(24, horizontalDistance * 0.08)
  return `M ${edge.sourceX} ${edge.sourceY} Q ${controlX} ${controlY} ${edge.targetX} ${edge.targetY}`
}

function edgeWidth(edge: TraceServiceGraphEdge): number {
  const ratio = edge.requestCount / Math.max(maxEdgeRequests.value, 1)
  return 1 + ratio * 7
}

function edgeColor(edge: TraceServiceGraphEdge): string {
  if (edge.errorRate >= 0.4) {
    return '#fb7185'
  }
  if (edge.errorRate >= 0.15) {
    return '#f59e0b'
  }
  return '#34d399'
}

function nodeRadius(node: TraceServiceGraphNode): number {
  const ratio = node.requestCount / Math.max(maxNodeRequests.value, 1)
  return 14 + ratio * 17
}

function formatDurationNano(durationNano: number): string {
  if (durationNano >= 1_000_000_000) {
    return `${(durationNano / 1_000_000_000).toFixed(durationNano >= 10_000_000_000 ? 1 : 2)}s`
  }
  if (durationNano >= 1_000_000) {
    return `${(durationNano / 1_000_000).toFixed(durationNano >= 100_000_000 ? 0 : 1)}ms`
  }
  if (durationNano >= 1_000) {
    return `${(durationNano / 1_000).toFixed(durationNano >= 100_000 ? 0 : 1)}us`
  }
  return `${durationNano}ns`
}

function handleSelectService(serviceName: string) {
  selectedService.value = serviceName
  selectedEdgeKey.value = null
  emit('select-service', serviceName)
}

function handleSelectEdge(edge: PositionedEdge) {
  selectedEdgeKey.value = edge.key
  selectedService.value = null
  emit('select-edge', { source: edge.source, target: edge.target })
}
</script>

<template>
  <div class="service-graph">
    <div class="graph-controls">
      <label class="control-item">
        <span>Zoom</span>
        <input v-model.number="zoomPercent" type="range" min="80" max="180" step="5" />
        <strong>{{ zoomPercent }}%</strong>
      </label>

      <label class="control-item">
        <span>Pan X</span>
        <input v-model.number="panX" type="range" min="-220" max="220" step="10" />
        <strong>{{ panX }}</strong>
      </label>

      <label class="control-item">
        <span>Pan Y</span>
        <input v-model.number="panY" type="range" min="-140" max="140" step="10" />
        <strong>{{ panY }}</strong>
      </label>
    </div>

    <div class="graph-summary">
      <span>{{ graph.nodes.length }} services</span>
      <span>{{ graph.edges.length }} dependencies</span>
      <span>{{ graph.totalRequests }} spans</span>
      <span>{{ graph.totalErrorCount }} errors</span>
    </div>

    <div class="graph-shell">
      <svg
        :width="graphWidth"
        :height="graphHeight"
        viewBox="0 0 940 340"
        class="graph-svg"
        role="img"
        aria-label="Service dependency graph"
      >
        <defs>
          <marker
            id="service-graph-arrow"
            markerUnits="userSpaceOnUse"
            markerWidth="5"
            markerHeight="5"
            refX="4.5"
            refY="2.5"
            orient="auto"
          >
            <path d="M0,0 L5,2.5 L0,5 z" fill="#64748b" />
          </marker>
        </defs>

        <g :transform="canvasTransform">
          <path
            v-for="edge in positionedEdges"
            :key="edge.key"
            :d="edgePath(edge)"
            class="edge-path"
            :class="{ selected: selectedEdgeKey === edge.key }"
            :style="{
              stroke: edgeColor(edge),
              strokeWidth: edgeWidth(edge),
            }"
            marker-end="url(#service-graph-arrow)"
            @click="handleSelectEdge(edge)"
          />

          <g v-for="node in positionedNodes" :key="node.serviceName" class="node-group" @click="handleSelectService(node.serviceName)">
            <circle
              :cx="node.x"
              :cy="node.y"
              :r="nodeRadius(node)"
              class="node-circle"
              :class="{ selected: selectedService === node.serviceName }"
              :style="{ fill: node.errorRate >= 0.25 ? '#9f1239' : '#0f172a' }"
            />
            <text :x="node.x" :y="node.y - 2" class="node-label" text-anchor="middle">{{ node.serviceName }}</text>
            <text :x="node.x" :y="node.y + 11" class="node-sub" text-anchor="middle">{{ node.requestCount }} req</text>
          </g>
        </g>
      </svg>
    </div>

    <div class="graph-inspector">
      <p v-if="selectedService">
        <strong>{{ selectedService }}</strong>
        <span>
          {{ nodeByService.get(selectedService)?.requestCount }} spans, error rate
          {{ Math.round((nodeByService.get(selectedService)?.errorRate || 0) * 100) }}%, avg
          {{ formatDurationNano(nodeByService.get(selectedService)?.averageDurationNano || 0) }}
        </span>
      </p>
      <p v-else-if="selectedEdgeKey">
        <strong>{{ selectedEdgeKey }}</strong>
        <span>Dependency selected. Trace search filtered to the target service.</span>
      </p>
      <p v-else>
        <span>Select a node to filter traces by service, or select an edge to filter by downstream service.</span>
      </p>
    </div>
  </div>
</template>

<style>
.service-graph {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: rgba(8, 14, 24, 0.88);
  padding: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.graph-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.control-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: var(--color-text-1);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.8);
  padding: 0.25rem 0.5rem;
}

.control-item input {
  width: 110px;
}

.control-item strong {
  font-size: 0.7rem;
  color: var(--color-text-0);
  min-width: 2.4rem;
  text-align: right;
}

.graph-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.graph-summary span {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.22rem 0.48rem;
  background: rgba(15, 24, 39, 0.78);
  color: var(--color-text-1);
  font-size: 0.72rem;
}

.graph-shell {
  overflow: auto;
  border: 1px solid rgba(71, 85, 105, 0.45);
  border-radius: 10px;
  background: radial-gradient(circle at top, rgba(15, 23, 42, 0.55), rgba(2, 6, 23, 0.9));
}

.graph-svg {
  display: block;
}

.edge-path {
  fill: none;
  stroke-opacity: 0.84;
  cursor: pointer;
  transition: stroke-opacity 0.15s ease;
}

.edge-path:hover {
  stroke-opacity: 1;
}

.edge-path.selected {
  stroke-opacity: 1;
  filter: drop-shadow(0 0 4px rgba(226, 232, 240, 0.45));
}

.node-group {
  cursor: pointer;
}

.node-circle {
  stroke: rgba(148, 163, 184, 0.7);
  stroke-width: 1.5;
  transition: transform 0.15s ease, stroke 0.15s ease;
}

.node-circle.selected {
  stroke: #F59E0B;
  stroke-width: 2.4;
}

.node-group:hover .node-circle {
  stroke: rgba(226, 232, 240, 0.9);
}

.node-label {
  pointer-events: none;
  fill: #dbeafe;
  font-size: 11px;
  font-weight: 700;
}

.node-sub {
  pointer-events: none;
  fill: #94a3b8;
  font-size: 9px;
}

.graph-inspector {
  border-top: 1px solid rgba(71, 85, 105, 0.55);
  padding-top: 0.45rem;
  color: var(--color-text-1);
  font-size: 0.75rem;
}

.graph-inspector p {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.graph-inspector strong {
  color: var(--color-text-0);
}

@media (max-width: 900px) {
  .control-item {
    width: 100%;
    justify-content: space-between;
  }

  .control-item input {
    width: 120px;
  }
}
</style>
