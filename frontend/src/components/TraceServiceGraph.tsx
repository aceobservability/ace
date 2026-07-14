import { useMemo, useState } from 'react'
import type {
  TraceServiceGraph as TraceServiceGraphModel,
  TraceServiceGraphEdge,
  TraceServiceGraphNode,
} from '@/types/datasource'
import { formatDurationNano } from '@/utils/traceFormat'

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

type TraceServiceGraphProps = {
  graph: TraceServiceGraphModel
  onSelectService?: (serviceName: string) => void
  onSelectEdge?: (edge: { source: string; target: string }) => void
}

const graphWidth = 940
const graphHeight = 340
const nodePaddingX = 80
const nodePaddingY = 46

function edgePath(edge: PositionedEdge): string {
  const horizontalDistance = Math.abs(edge.targetX - edge.sourceX)
  const controlX = (edge.sourceX + edge.targetX) / 2
  const controlY = (edge.sourceY + edge.targetY) / 2 - Math.max(24, horizontalDistance * 0.08)
  return `M ${edge.sourceX} ${edge.sourceY} Q ${controlX} ${controlY} ${edge.targetX} ${edge.targetY}`
}

function edgeWidth(edge: TraceServiceGraphEdge, maxEdgeRequests: number): number {
  const ratio = edge.requestCount / Math.max(maxEdgeRequests, 1)
  return 1 + ratio * 7
}

function edgeColor(edge: TraceServiceGraphEdge): string {
  if (edge.errorRate >= 0.4) {
    return 'var(--color-error)'
  }
  if (edge.errorRate >= 0.15) {
    return 'var(--color-tertiary)'
  }
  return 'var(--color-secondary)'
}

function nodeRadius(node: TraceServiceGraphNode, maxNodeRequests: number): number {
  const ratio = node.requestCount / Math.max(maxNodeRequests, 1)
  return 14 + ratio * 17
}

function nodeColor(node: TraceServiceGraphNode): string {
  return node.errorRate >= 0.25 ? 'var(--color-error)' : 'var(--color-secondary)'
}

function nodeStroke(node: TraceServiceGraphNode, isSelected: boolean): string {
  if (isSelected) {
    return 'var(--color-primary)'
  }
  return node.errorRate >= 0.25
    ? 'color-mix(in srgb, var(--color-error) 50%, white)'
    : 'color-mix(in srgb, var(--color-secondary) 50%, white)'
}

function nodeStrokeWidth(isSelected: boolean): number {
  return isSelected ? 2.5 : 1.5
}

export function TraceServiceGraph({ graph, onSelectService, onSelectEdge }: TraceServiceGraphProps) {
  const [zoomPercent, setZoomPercent] = useState(100)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null)

  const nodeByService = useMemo(() => {
    return new Map(graph.nodes.map(node => [node.serviceName, node]))
  }, [graph.nodes])

  const maxNodeRequests = useMemo(() => {
    return graph.nodes.reduce((max, node) => Math.max(max, node.requestCount), 1)
  }, [graph.nodes])

  const maxEdgeRequests = useMemo(() => {
    return graph.edges.reduce((max, edge) => Math.max(max, edge.requestCount), 1)
  }, [graph.edges])

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    if (graph.nodes.length === 0) {
      return []
    }

    const sortedServices = graph.nodes
      .map(node => node.serviceName)
      .sort((a, b) => a.localeCompare(b))

    const levelByService = new Map<string, number>()
    for (const serviceName of sortedServices) {
      levelByService.set(serviceName, 0)
    }

    for (let i = 0; i < sortedServices.length; i += 1) {
      let changed = false
      for (const edge of graph.edges) {
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
    for (const node of graph.nodes) {
      const level = levelByService.get(node.serviceName) || 0
      const list = levels.get(level) || []
      list.push(node)
      levels.set(level, list)
    }

    const positioned: PositionedNode[] = []
    for (let level = 0; level <= maxLevel; level += 1) {
      const list = levels.get(level) || []
      list.sort(
        (a, b) => b.requestCount - a.requestCount || a.serviceName.localeCompare(b.serviceName),
      )

      const x =
        levelCount > 1
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
  }, [graph.nodes, graph.edges])

  const positionedNodeByService = useMemo(() => {
    return new Map(positionedNodes.map(node => [node.serviceName, node]))
  }, [positionedNodes])

  const positionedEdges = useMemo<PositionedEdge[]>(() => {
    const positioned: PositionedEdge[] = []

    for (const edge of graph.edges) {
      const source = positionedNodeByService.get(edge.source)
      const target = positionedNodeByService.get(edge.target)
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
  }, [graph.edges, positionedNodeByService])

  const canvasTransform = `translate(${panX} ${panY}) scale(${zoomPercent / 100})`

  function handleSelectService(serviceName: string) {
    setSelectedService(serviceName)
    setSelectedEdgeKey(null)
    onSelectService?.(serviceName)
  }

  function handleSelectEdge(edge: PositionedEdge) {
    setSelectedEdgeKey(edge.key)
    setSelectedService(null)
    onSelectEdge?.({ source: edge.source, target: edge.target })
  }

  const selectedNode = selectedService ? nodeByService.get(selectedService) : undefined

  return (
    <div
      className="flex flex-col gap-2.5 rounded bg-[var(--color-surface-container-low)] p-4"
      data-testid="trace-service-graph"
    >
      <div className="flex flex-wrap gap-2.5">
        <label className="inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1 text-xs text-[var(--color-outline)] max-sm:w-full max-sm:justify-between">
          <span>Zoom</span>
          <input
            type="range"
            min={80}
            max={180}
            step={5}
            value={zoomPercent}
            onChange={event => setZoomPercent(Number(event.target.value))}
            className="w-28 max-sm:w-30"
          />
          <strong className="min-w-[2.4rem] text-right text-xs font-semibold text-[var(--color-on-surface)]">
            {zoomPercent}%
          </strong>
        </label>

        <label className="inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1 text-xs text-[var(--color-outline)] max-sm:w-full max-sm:justify-between">
          <span>Pan X</span>
          <input
            type="range"
            min={-220}
            max={220}
            step={10}
            value={panX}
            onChange={event => setPanX(Number(event.target.value))}
            className="w-28 max-sm:w-30"
          />
          <strong className="min-w-[2.4rem] text-right text-xs font-semibold text-[var(--color-on-surface)]">
            {panX}
          </strong>
        </label>

        <label className="inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1 text-xs text-[var(--color-outline)] max-sm:w-full max-sm:justify-between">
          <span>Pan Y</span>
          <input
            type="range"
            min={-140}
            max={140}
            step={10}
            value={panY}
            onChange={event => setPanY(Number(event.target.value))}
            className="w-28 max-sm:w-30"
          />
          <strong className="min-w-[2.4rem] text-right text-xs font-semibold text-[var(--color-on-surface)]">
            {panY}
          </strong>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-sm bg-[var(--color-surface-container-high)] px-2.5 py-1 text-xs text-[var(--color-outline)]">
          {graph.nodes.length} services
        </span>
        <span className="rounded-sm bg-[var(--color-surface-container-high)] px-2.5 py-1 text-xs text-[var(--color-outline)]">
          {graph.edges.length} dependencies
        </span>
        <span className="rounded-sm bg-[var(--color-surface-container-high)] px-2.5 py-1 text-xs text-[var(--color-outline)]">
          {graph.totalRequests} spans
        </span>
        <span className="rounded-sm bg-[var(--color-surface-container-high)] px-2.5 py-1 text-xs text-[var(--color-outline)]">
          {graph.totalErrorCount} errors
        </span>
      </div>

      <div className="overflow-auto rounded-sm bg-[var(--color-surface-container-high)]">
        <svg
          width={graphWidth}
          height={graphHeight}
          viewBox="0 0 940 340"
          className="block"
          role="img"
          aria-label="Service dependency graph"
        >
          <defs>
            <marker
              id="service-graph-arrow"
              markerUnits="userSpaceOnUse"
              markerWidth={5}
              markerHeight={5}
              refX={4.5}
              refY={2.5}
              orient="auto"
            >
              <path d="M0,0 L5,2.5 L0,5 z" fill="var(--color-outline)" />
            </marker>
          </defs>

          <g transform={canvasTransform}>
            {positionedEdges.map(edge => (
              <path
                key={edge.key}
                d={edgePath(edge)}
                fill="none"
                className="cursor-pointer transition-opacity"
                style={{
                  stroke: edgeColor(edge),
                  strokeWidth: edgeWidth(edge, maxEdgeRequests),
                  strokeOpacity: selectedEdgeKey === edge.key ? 1 : 0.84,
                  filter:
                    selectedEdgeKey === edge.key
                      ? 'drop-shadow(0 0 4px color-mix(in srgb, var(--color-primary) 30%, transparent))'
                      : 'none',
                }}
                markerEnd="url(#service-graph-arrow)"
                onClick={() => handleSelectEdge(edge)}
              />
            ))}

            {positionedNodes.map(node => {
              const isSelected = selectedService === node.serviceName
              return (
                <g
                  key={node.serviceName}
                  className="cursor-pointer"
                  onClick={() => handleSelectService(node.serviceName)}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={nodeRadius(node, maxNodeRequests)}
                    style={{
                      fill: nodeColor(node),
                      stroke: nodeStroke(node, isSelected),
                      strokeWidth: nodeStrokeWidth(isSelected),
                    }}
                    className="transition-[stroke]"
                  />
                  <text
                    x={node.x}
                    y={node.y - 2}
                    className="pointer-events-none fill-[var(--color-on-surface)] text-[11px] font-bold"
                    textAnchor="middle"
                  >
                    {node.serviceName}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + 11}
                    className="pointer-events-none fill-[var(--color-outline)] text-[9px]"
                    textAnchor="middle"
                  >
                    {node.requestCount} req
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      <div className="border-t border-[var(--color-stroke-subtle)] pt-2 text-xs text-[var(--color-outline)]">
        {selectedService ? (
          <p className="m-0 flex flex-wrap gap-1.5">
            <strong className="text-[var(--color-on-surface)]">{selectedService}</strong>
            <span>
              {selectedNode?.requestCount} spans, error rate{' '}
              {Math.round((selectedNode?.errorRate || 0) * 100)}%, avg{' '}
              {formatDurationNano(selectedNode?.averageDurationNano || 0)}
            </span>
          </p>
        ) : selectedEdgeKey ? (
          <p className="m-0 flex flex-wrap gap-1.5">
            <strong className="text-[var(--color-on-surface)]">{selectedEdgeKey}</strong>
            <span>Dependency selected. Trace search filtered to the target service.</span>
          </p>
        ) : (
          <p className="m-0 flex flex-wrap gap-1.5">
            <span>
              Select a node to filter traces by service, or select an edge to filter by downstream
              service.
            </span>
          </p>
        )}
      </div>
    </div>
  )
}