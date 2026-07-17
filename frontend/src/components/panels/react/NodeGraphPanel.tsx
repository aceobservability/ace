import { forceCenter, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force'
import { useMemo } from 'react'
import { getSeriesColor } from '@/utils/chartTheme'

export type GraphNode = {
  id: string
  label: string
  metric?: number
}

export type GraphEdge = {
  source: string
  target: string
  label?: string
  value?: number
}

type NodeGraphPanelProps = {
  nodes?: GraphNode[]
  edges?: GraphEdge[]
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
}

type SimNode = SimulationNodeDatum & {
  id: string
  label: string
  metric?: number
}

type SimEdge = {
  source: string
  target: string
  label?: string
  value?: number
}

const NODE_RADIUS = 20
const SVG_WIDTH = 600
const SVG_HEIGHT = 400
const MAX_ITERATIONS = 300
const EDGE_MIN_WIDTH = 1
const EDGE_MAX_WIDTH = 4

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  if (nodes.length === 0) {
    return { simNodes: [] as SimNode[], simEdges: [] as SimEdge[] }
  }

  const simNodes: SimNode[] = nodes.map(n => ({
    id: n.id,
    label: n.label,
    metric: n.metric,
  }))

  const simEdges: SimEdge[] = edges.map(e => ({
    source: e.source,
    target: e.target,
    label: e.label,
    value: e.value,
  }))

  // biome-ignore lint/suspicious/noExplicitAny: d3-force link id accessor needs relaxed typing
  const linkForce = forceLink<SimNode, any>(simEdges as any).id((d: any) => d.id)
  const simulation = forceSimulation<SimNode>(simNodes)
    .force('link', linkForce)
    .force('charge', forceManyBody().strength(-200))
    .force('center', forceCenter(SVG_WIDTH / 2, SVG_HEIGHT / 2))
    .stop()

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    simulation.tick()
  }

  for (const node of simNodes) {
    node.x = clamp(node.x ?? SVG_WIDTH / 2, NODE_RADIUS, SVG_WIDTH - NODE_RADIUS)
    node.y = clamp(node.y ?? SVG_HEIGHT / 2, NODE_RADIUS, SVG_HEIGHT - NODE_RADIUS)
  }

  return { simNodes, simEdges }
}

export function NodeGraphPanel({
  nodes = [],
  edges = [],
  emptyTitle = 'No service graph data',
  emptyDescription,
  emptyActionLabel,
}: NodeGraphPanelProps) {
  const { simNodes, simEdges } = useMemo(() => layoutGraph(nodes, edges), [nodes, edges])

  const edgeValues = edges.filter(e => e.value != null).map(e => e.value as number)
  const edgeMaxValue = edgeValues.length > 0 ? Math.max(...edgeValues) : 1
  const edgeMinValue = edgeValues.length > 0 ? Math.min(...edgeValues) : 0

  function edgeStrokeWidth(value?: number): number {
    if (value == null) return EDGE_MIN_WIDTH
    const range = edgeMaxValue - edgeMinValue
    if (range === 0) return (EDGE_MIN_WIDTH + EDGE_MAX_WIDTH) / 2
    const t = (value - edgeMinValue) / range
    return EDGE_MIN_WIDTH + t * (EDGE_MAX_WIDTH - EDGE_MIN_WIDTH)
  }

  function findNode(id: string): SimNode | undefined {
    return simNodes.find(n => n.id === id)
  }

  function edgeEndpointId(endpoint: string | SimNode): string {
    return typeof endpoint === 'string' ? endpoint : endpoint.id
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-testid="node-graph-container"
      style={{ backgroundColor: 'transparent' }}
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        style={{ display: 'block', fontFamily: "'DM Sans', sans-serif" }}
      >
        {simEdges.map((edge, i) => {
          const sourceId = edgeEndpointId(edge.source as string | SimNode)
          const targetId = edgeEndpointId(edge.target as string | SimNode)
          const source = findNode(sourceId)
          const target = findNode(targetId)
          return (
            <line
              key={`edge-${sourceId}-${targetId}-${i}`}
              x1={source?.x ?? 0}
              y1={source?.y ?? 0}
              x2={target?.x ?? 0}
              y2={target?.y ?? 0}
              stroke="var(--color-outline-variant)"
              strokeWidth={edgeStrokeWidth(edge.value)}
              data-source={sourceId}
              data-target={targetId}
            />
          )
        })}

        {simEdges.map((edge, i) => {
          if (!edge.label) return null
          const sourceId = edgeEndpointId(edge.source as string | SimNode)
          const targetId = edgeEndpointId(edge.target as string | SimNode)
          const source = findNode(sourceId)
          const target = findNode(targetId)
          return (
            <text
              key={`edge-label-${sourceId}-${targetId}-${i}`}
              data-type="edge-label"
              x={((source?.x ?? 0) + (target?.x ?? 0)) / 2}
              y={((source?.y ?? 0) + (target?.y ?? 0)) / 2}
              textAnchor="middle"
              style={{
                fontSize: '10px',
                fill: 'var(--color-on-surface-variant)',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {edge.label}
            </text>
          )
        })}

        {simNodes.map((node, i) => (
          <circle
            key={`node-${node.id}`}
            cx={node.x}
            cy={node.y}
            r={NODE_RADIUS}
            fill={`${getSeriesColor(i)}e6`}
            stroke={getSeriesColor(i)}
            strokeWidth={1.5}
            data-node-id={node.id}
          />
        ))}

        {simNodes.map(node => (
          <text
            key={`label-${node.id}`}
            data-type="node-label"
            x={node.x}
            y={(node.y ?? 0) + NODE_RADIUS + 14}
            textAnchor="middle"
            style={{
              fontSize: '11px',
              fill: 'var(--color-on-surface-variant)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {node.label}
          </text>
        ))}
      </svg>

      {nodes.length === 0 ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-sm"
          data-testid="node-graph-empty"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          <div className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {emptyTitle}
          </div>
          {emptyDescription ? (
            <div className="max-w-sm text-xs leading-5">{emptyDescription}</div>
          ) : null}
          {emptyActionLabel ? (
            <div
              className="mt-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--color-primary)' }}
            >
              {emptyActionLabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
