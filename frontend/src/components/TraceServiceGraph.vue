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

function nodeColor(node: TraceServiceGraphNode): string {
  return node.errorRate >= 0.25 ? '#e11d48' : '#10b981'
}

function nodeStroke(node: TraceServiceGraphNode, isSelected: boolean): string {
  if (isSelected) {
    return '#059669'
  }
  return node.errorRate >= 0.25 ? '#fda4af' : '#a7f3d0'
}

function nodeStrokeWidth(isSelected: boolean): number {
  return isSelected ? 2.5 : 1.5
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
  <div class="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-4">
    <div class="flex flex-wrap gap-2.5">
      <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 max-sm:w-full max-sm:justify-between">
        <span>Zoom</span>
        <input v-model.number="zoomPercent" type="range" min="80" max="180" step="5" class="w-28 max-sm:w-30" />
        <strong class="min-w-[2.4rem] text-right text-xs font-semibold text-slate-900">{{ zoomPercent }}%</strong>
      </label>

      <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 max-sm:w-full max-sm:justify-between">
        <span>Pan X</span>
        <input v-model.number="panX" type="range" min="-220" max="220" step="10" class="w-28 max-sm:w-30" />
        <strong class="min-w-[2.4rem] text-right text-xs font-semibold text-slate-900">{{ panX }}</strong>
      </label>

      <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 max-sm:w-full max-sm:justify-between">
        <span>Pan Y</span>
        <input v-model.number="panY" type="range" min="-140" max="140" step="10" class="w-28 max-sm:w-30" />
        <strong class="min-w-[2.4rem] text-right text-xs font-semibold text-slate-900">{{ panY }}</strong>
      </label>
    </div>

    <div class="flex flex-wrap gap-2">
      <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">{{ graph.nodes.length }} services</span>
      <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">{{ graph.edges.length }} dependencies</span>
      <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">{{ graph.totalRequests }} spans</span>
      <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">{{ graph.totalErrorCount }} errors</span>
    </div>

    <div class="overflow-auto rounded-lg border border-slate-200 bg-slate-50">
      <svg
        :width="graphWidth"
        :height="graphHeight"
        viewBox="0 0 940 340"
        class="block"
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
            fill="none"
            class="cursor-pointer transition-opacity"
            :style="{
              stroke: edgeColor(edge),
              strokeWidth: edgeWidth(edge),
              strokeOpacity: selectedEdgeKey === edge.key ? 1 : 0.84,
              filter: selectedEdgeKey === edge.key ? 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))' : 'none',
            }"
            marker-end="url(#service-graph-arrow)"
            @click="handleSelectEdge(edge)"
          />

          <g v-for="node in positionedNodes" :key="node.serviceName" class="cursor-pointer" @click="handleSelectService(node.serviceName)">
            <circle
              :cx="node.x"
              :cy="node.y"
              :r="nodeRadius(node)"
              :style="{
                fill: nodeColor(node),
                stroke: nodeStroke(node, selectedService === node.serviceName),
                strokeWidth: nodeStrokeWidth(selectedService === node.serviceName),
              }"
              class="transition-[stroke]"
            />
            <text :x="node.x" :y="node.y - 2" class="pointer-events-none fill-slate-900 text-[11px] font-bold" text-anchor="middle">{{ node.serviceName }}</text>
            <text :x="node.x" :y="node.y + 11" class="pointer-events-none fill-slate-500 text-[9px]" text-anchor="middle">{{ node.requestCount }} req</text>
          </g>
        </g>
      </svg>
    </div>

    <div class="border-t border-slate-200 pt-2 text-xs text-slate-500">
      <p v-if="selectedService" class="m-0 flex flex-wrap gap-1.5">
        <strong class="text-slate-900">{{ selectedService }}</strong>
        <span>
          {{ nodeByService.get(selectedService)?.requestCount }} spans, error rate
          {{ Math.round((nodeByService.get(selectedService)?.errorRate || 0) * 100) }}%, avg
          {{ formatDurationNano(nodeByService.get(selectedService)?.averageDurationNano || 0) }}
        </span>
      </p>
      <p v-else-if="selectedEdgeKey" class="m-0 flex flex-wrap gap-1.5">
        <strong class="text-slate-900">{{ selectedEdgeKey }}</strong>
        <span>Dependency selected. Trace search filtered to the target service.</span>
      </p>
      <p v-else class="m-0 flex flex-wrap gap-1.5">
        <span>Select a node to filter traces by service, or select an edge to filter by downstream service.</span>
      </p>
    </div>
  </div>
</template>
