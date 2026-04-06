import { ref, type Ref } from 'vue'
import type { DashboardSpec } from '../utils/dashboardSpec'
import { validateDashboardSpec } from '../utils/dashboardSpec'
import type { ToolCall, ToolDefinition } from './useAIProvider'
import { useAIProvider } from './useAIProvider'
import { useCopilotToolExecutor } from './useCopilotTools'

export interface ToolStatus {
  name: string
  status: 'running' | 'complete' | 'error'
}

type ChatRequestMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface DashboardGenCallbacks {
  onContent?: (text: string) => void
  onDashboardSpec?: (spec: DashboardSpec) => void
  onToolStatus?: (status: ToolStatus) => void
}

const MAX_TOOL_ITERATIONS = 10

export function useDashboardGeneration(
  datasourceId: () => string,
  orgId: () => string,
  datasourceType: () => string,
) {
  const { sendChatRequest } = useAIProvider()
  const { executeTool } = useCopilotToolExecutor(datasourceId, orgId, datasourceType)

  const toolStatuses: Ref<ToolStatus[]> = ref([])
  const isGenerating = ref(false)
  const error: Ref<string | null> = ref(null)
  const progressText: Ref<string> = ref('')

  let abortController: AbortController | null = null

  async function generate(
    messages: ChatRequestMessage[],
    tools: ToolDefinition[],
    datasourceName: string,
    callbacks?: DashboardGenCallbacks,
  ): Promise<{ spec: DashboardSpec | null; content: string | null }> {
    if (isGenerating.value) return { spec: null, content: null }

    isGenerating.value = true
    error.value = null
    toolStatuses.value = []
    progressText.value = ''

    abortController = new AbortController()
    const signal = abortController.signal

    const requestMessages: ChatRequestMessage[] = [...messages]
    let lastContent: string | null = null
    let resultSpec: DashboardSpec | null = null

    try {
      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        if (signal.aborted) break

        const { content, toolCalls } = await sendChatRequest(
          datasourceType(),
          datasourceName,
          requestMessages,
          tools,
          signal,
        )

        if (content) {
          lastContent = content
          progressText.value = content
          callbacks?.onContent?.(content)
          requestMessages.push({ role: 'assistant', content })
        }

        if (!toolCalls.length) break

        for (const tc of toolCalls) {
          if (signal.aborted) break

          if (tc.function.name === 'generate_dashboard') {
            let spec: DashboardSpec
            try {
              spec = JSON.parse(tc.function.arguments) as DashboardSpec
            } catch {
              error.value = 'AI returned an invalid dashboard.'
              return { spec: null, content: lastContent }
            }

            spec.panels?.forEach((p) => {
              if (p.query) p.query.datasource_id = datasourceId()
            })

            const validation = validateDashboardSpec(spec, [datasourceId()])
            if (!validation.valid) {
              error.value = `Generated dashboard has issues: ${validation.errors.join('; ')}`
              return { spec: null, content: lastContent }
            }

            resultSpec = spec
            callbacks?.onDashboardSpec?.(spec)
            return { spec: resultSpec, content: lastContent }
          }

          const statusEntry: ToolStatus = { name: tc.function.name, status: 'running' }
          toolStatuses.value.push(statusEntry)
          callbacks?.onToolStatus?.(statusEntry)
          const statusIndex = toolStatuses.value.length - 1

          const result = await executeTool(tc, signal).catch((err: unknown) => {
            toolStatuses.value[statusIndex]!.status = 'error'
            return `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}`
          })

          if (toolStatuses.value[statusIndex]!.status === 'running') {
            toolStatuses.value[statusIndex]!.status = 'complete'
          }

          requestMessages.push(
            { role: 'assistant', content: null, tool_calls: [tc] },
            { role: 'tool', tool_call_id: tc.id, content: result },
          )
        }
      }

      if (!resultSpec && !signal.aborted) {
        error.value = 'Could not generate a dashboard. Try a more specific prompt.'
      }
    } catch (e) {
      if (signal.aborted) {
        // Cancelled — don't set error
      } else if (e instanceof Error && e.message.includes('429')) {
        error.value = `AI request failed (429)`
      } else {
        error.value = e instanceof Error ? e.message : 'Could not reach AI provider. Check your provider settings.'
      }
    } finally {
      isGenerating.value = false
      abortController = null
    }

    return { spec: resultSpec, content: lastContent }
  }

  function cancel() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isGenerating.value = false
    error.value = null
  }

  return { toolStatuses, isGenerating, error, progressText, generate, cancel }
}
