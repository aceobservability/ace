import { useCallback, useRef, useState } from 'react'
import {
  sendAiChat,
  type ChatRequestMessage,
  type ToolCall,
  type ToolDefinition,
} from '@/api/aiChat'
import { useAIProviderStore } from '@/stores/aiProviderStore'
import { executeCopilotTool } from '@/lib/copilotTools'
import type { DashboardSpec } from '@/utils/dashboardSpec'
import { validateDashboardSpec } from '@/utils/dashboardSpec'

export interface ToolStatus {
  name: string
  status: 'running' | 'complete' | 'error'
}

export interface DashboardGenCallbacks {
  onContent?: (text: string) => void
  onDashboardSpec?: (spec: DashboardSpec) => void
  onToolStatus?: (status: ToolStatus) => void
}

const MAX_TOOL_ITERATIONS = 10

type GenerateDashboardArgs = {
  title: string
  description?: string
  panels: Array<{
    title: string
    type: DashboardSpec['panels'][number]['type']
    grid_pos?: DashboardSpec['panels'][number]['position']
    position?: DashboardSpec['panels'][number]['position']
    query: {
      expr: string
      legend_format?: string
      legend?: string
      signal?: 'metrics' | 'logs' | 'traces'
    }
  }>
}

function defaultSignalForDatasourceType(
  datasourceType: string,
): 'metrics' | 'logs' | 'traces' | undefined {
  if (['loki', 'victorialogs', 'elasticsearch', 'clickhouse'].includes(datasourceType)) {
    return 'logs'
  }
  if (['tempo', 'victoriatraces'].includes(datasourceType)) {
    return 'traces'
  }
  if (['victoriametrics', 'prometheus'].includes(datasourceType)) {
    return 'metrics'
  }
  return undefined
}

function normalizeGeneratedSpec(
  raw: GenerateDashboardArgs,
  datasourceId: string,
  datasourceType: string,
): DashboardSpec {
  const fallbackSignal = defaultSignalForDatasourceType(datasourceType)
  return {
    title: raw.title,
    description: raw.description,
    panels: (raw.panels ?? []).map(panel => {
      const signal = panel.query.signal ?? fallbackSignal
      return {
        title: panel.title,
        type: panel.type,
        position: panel.position ?? panel.grid_pos ?? { x: 0, y: 0, w: 6, h: 3 },
        datasource_id: datasourceId,
        query: {
          expr: panel.query.expr,
          ...(signal ? { signal } : {}),
          ...(panel.query.legend
            ? { legend: panel.query.legend }
            : panel.query.legend_format
              ? { legend: panel.query.legend_format }
              : {}),
        },
      }
    }),
  }
}

function markToolStatus(
  current: ToolStatus[],
  name: string,
  status: ToolStatus['status'],
  onlyRunning = false,
): ToolStatus[] {
  const next = [...current]
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const entry = next[i]!
    if (entry.name !== name) continue
    if (onlyRunning && entry.status !== 'running') continue
    next[i] = { ...entry, status }
    break
  }
  return next
}

export function useDashboardGeneration(
  datasourceId: () => string,
  orgId: () => string,
  datasourceType: () => string,
) {
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressText, setProgressText] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const generatingRef = useRef(false)

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    generatingRef.current = false
    setIsGenerating(false)
    setError(null)
  }, [])

  const generate = useCallback(
    async (
      messages: ChatRequestMessage[],
      tools: ToolDefinition[],
      datasourceName: string,
      callbacks?: DashboardGenCallbacks,
    ): Promise<{ spec: DashboardSpec | null; content: string | null }> => {
      if (generatingRef.current) return { spec: null, content: null }

      const organizationId = orgId()
      if (!organizationId) {
        setError('No organization selected')
        return { spec: null, content: null }
      }

      generatingRef.current = true
      setIsGenerating(true)
      setError(null)
      setToolStatuses([])
      setProgressText('')

      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      const requestMessages: ChatRequestMessage[] = [...messages]
      let lastContent: string | null = null
      let resultSpec: DashboardSpec | null = null

      const { selectedProviderId, selectedModel } = useAIProviderStore.getState()

      try {
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
          if (signal.aborted) break

          const { content, toolCalls } = await sendAiChat({
            orgId: organizationId,
            providerId: selectedProviderId || undefined,
            model: selectedModel || undefined,
            datasourceType: datasourceType(),
            datasourceName,
            messages: requestMessages,
            tools,
            signal,
          })

          if (content) {
            lastContent = content
            setProgressText(content)
            callbacks?.onContent?.(content)
            requestMessages.push({ role: 'assistant', content })
          }

          if (!toolCalls.length) break

          for (const tc of toolCalls) {
            if (signal.aborted) break

            if (tc.function.name === 'generate_dashboard') {
              let rawSpec: GenerateDashboardArgs
              try {
                rawSpec = JSON.parse(tc.function.arguments) as GenerateDashboardArgs
              } catch {
                setError('AI returned an invalid dashboard.')
                return { spec: null, content: lastContent }
              }

              const spec = normalizeGeneratedSpec(rawSpec, datasourceId(), datasourceType())
              const validation = validateDashboardSpec(spec, [datasourceId()])
              if (!validation.valid) {
                setError(`Generated dashboard has issues: ${validation.errors.join('; ')}`)
                return { spec: null, content: lastContent }
              }

              resultSpec = spec
              callbacks?.onDashboardSpec?.(spec)
              requestMessages.push(
                { role: 'assistant', content: null, tool_calls: [tc] },
                { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(spec) },
              )
              break
            }

            const statusEntry: ToolStatus = { name: tc.function.name, status: 'running' }
            setToolStatuses(current => [...current, statusEntry])
            callbacks?.onToolStatus?.(statusEntry)

            const result = await executeCopilotTool(tc as ToolCall, {
              datasourceId: datasourceId(),
              orgId: organizationId,
              signal,
            }).catch((err: unknown) => {
              setToolStatuses(current => markToolStatus(current, tc.function.name, 'error'))
              return `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}`
            })

            setToolStatuses(current =>
              markToolStatus(current, tc.function.name, 'complete', true),
            )

            requestMessages.push(
              { role: 'assistant', content: null, tool_calls: [tc] },
              { role: 'tool', tool_call_id: tc.id, content: result },
            )
          }

          if (resultSpec) break
        }

        if (!resultSpec && !lastContent) {
          setError('Could not generate a dashboard. Try a more specific prompt.')
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          // cancelled
        } else if (cause instanceof Error && cause.message.includes('429')) {
          setError('AI request failed (429)')
        } else {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not reach AI provider. Check your provider settings.',
          )
        }
      } finally {
        generatingRef.current = false
        setIsGenerating(false)
        abortControllerRef.current = null
      }

      return { spec: resultSpec, content: lastContent }
    },
    [datasourceId, datasourceType, orgId],
  )

  return { toolStatuses, isGenerating, error, progressText, generate, cancel }
}
