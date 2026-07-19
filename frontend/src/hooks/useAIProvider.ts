import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { listAIModels, listAIProviders, type AIProviderInfo } from '@/api/aiProviders'
import { API_BASE } from '@/api/base'
import { useOrganization } from '@/hooks/useOrganization'
import type { DashboardSpec } from '@/utils/dashboardSpec'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface AIModel {
  id: string
  name: string
  vendor: string
  category: string
  provider_id?: string
  provider_name?: string
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type ChatRequestMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

type AIMessage = {
  role: 'user' | 'assistant'
  content: string
  dashboardSpec?: DashboardSpec
}

type AIProviderState = {
  providers: AIProviderInfo[]
  selectedProviderId: string
  models: AIModel[]
  selectedModel: string
  isLoading: boolean
  error: string | null
  chatMessages: AIMessage[]
  orgId: string | null
}

const listeners = new Set<() => void>()

let state: AIProviderState = {
  providers: [],
  selectedProviderId: '',
  models: [],
  selectedModel: '',
  isLoading: false,
  error: null,
  chatMessages: [],
  orgId: null,
}

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

function setState(partial: Partial<AIProviderState>) {
  state = { ...state, ...partial }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return state
}

function resetForOrg(orgId: string | null) {
  if (state.orgId === orgId) return
  setState({
    providers: [],
    selectedProviderId: '',
    models: [],
    selectedModel: '',
    chatMessages: [],
    error: null,
    orgId,
  })
}

async function fetchProviders(orgId: string | null) {
  setState({ error: null })
  if (!orgId) return

  try {
    const providers = await listAIProviders(orgId)
    const selectedProviderId =
      providers.length > 0 && !providers.find(provider => provider.id === state.selectedProviderId)
        ? providers[0]!.id
        : state.selectedProviderId || providers[0]?.id || ''

    setState({
      providers,
      selectedProviderId,
    })
  } catch (cause) {
    setState({
      error: cause instanceof Error ? cause.message : 'Failed to fetch providers',
    })
  }
}

async function fetchModels(orgId: string | null, providerId?: string) {
  if (!orgId) return

  try {
    const models = await listAIModels(orgId, providerId)
    const selectedModel =
      models.length > 0 && !models.find(model => model.id === state.selectedModel)
        ? models.find(model => model.id === 'claude-sonnet-4.6')?.id || models[0]!.id
        : state.selectedModel || models[0]?.id || ''

    setState({
      models,
      selectedModel,
    })
  } catch {
    // ignore model fetch errors for generation UX
  }
}

async function sendChatRequest(
  orgId: string | null,
  datasourceType: string,
  datasourceName: string,
  messages: ChatRequestMessage[],
  tools?: ToolDefinition[],
  signal?: AbortSignal,
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  if (!orgId) throw new Error('No organization selected')

  const body: Record<string, unknown> = {
    provider_id: state.selectedProviderId || undefined,
    model: state.selectedModel || undefined,
    datasource_type: datasourceType,
    datasource_name: datasourceName,
    messages,
  }
  if (tools && tools.length > 0) {
    body.tools = tools
    body.stream = false
  }

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  }

  let response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/chat`, fetchOptions)

  if (response.status === 429) {
    await Promise.race([
      new Promise(resolve => setTimeout(resolve, 2000)),
      ...(signal
        ? [
            new Promise<never>((_, reject) =>
              signal.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              ),
            ),
          ]
        : []),
    ])
    response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/chat`, fetchOptions)
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.error || `AI request failed (${response.status})`)
  }

  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('text/event-stream')) {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response stream')

    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            const content = json.choices?.[0]?.delta?.content
            if (content) fullContent += content
          } catch {
            // skip malformed
          }
        }
      }
    }

    return { content: fullContent, toolCalls: [] }
  }

  const data = await response.json()
  const choices = data.choices
  if (!choices || choices.length === 0) throw new Error('No response from model')

  let content: string | null = null
  let toolCalls: ToolCall[] = []
  for (const choice of choices) {
    if (choice.message?.content && !content) {
      content = choice.message.content
    }
    if (choice.message?.tool_calls?.length) {
      toolCalls = choice.message.tool_calls
    }
  }

  return { content, toolCalls }
}

export function useAIProvider() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const { currentOrgId } = useOrganization()

  useEffect(() => {
    resetForOrg(currentOrgId)
  }, [currentOrgId])

  const fetchProvidersBound = useCallback(async () => {
    await fetchProviders(currentOrgId)
  }, [currentOrgId])

  const fetchModelsBound = useCallback(
    async (providerId?: string) => {
      await fetchModels(currentOrgId, providerId)
    },
    [currentOrgId],
  )

  const sendChatRequestBound = useCallback(
    async (
      datasourceType: string,
      datasourceName: string,
      messages: ChatRequestMessage[],
      tools?: ToolDefinition[],
      signal?: AbortSignal,
    ) =>
      sendChatRequest(currentOrgId, datasourceType, datasourceName, messages, tools, signal),
    [currentOrgId],
  )

  return {
    providers: snapshot.providers,
    selectedProviderId: snapshot.selectedProviderId,
    models: snapshot.models,
    selectedModel: snapshot.selectedModel,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    chatMessages: snapshot.chatMessages,
    fetchProviders: fetchProvidersBound,
    fetchModels: fetchModelsBound,
    sendChatRequest: sendChatRequestBound,
  }
}
