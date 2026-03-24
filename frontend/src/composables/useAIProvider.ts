import { ref, watch } from 'vue'
import type { DashboardSpec } from '../utils/dashboardSpec'
import { useOrganization } from './useOrganization'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

interface AIProviderInfo {
  id: string
  provider_type: string
  display_name: string
  base_url?: string
  enabled: boolean
}

interface AIModel {
  id: string
  name: string
  vendor: string
  category: string
  provider_id: string
  provider_name: string
}

interface AIMessage {
  role: 'user' | 'assistant'
  content: string
  dashboardSpec?: DashboardSpec
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

interface ToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

type ChatRequestMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | ToolMessage

// Module-level shared state — all callers see the same values
const providers = ref<AIProviderInfo[]>([])
const selectedProviderId = ref<string>('')
const models = ref<AIModel[]>([])
const selectedModel = ref<string>('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const chatMessages = ref<AIMessage[]>([])
let fetchingModels = false

// Reset state when org changes
const { currentOrgId } = useOrganization()

watch(currentOrgId, () => {
  providers.value = []
  selectedProviderId.value = ''
  models.value = []
  selectedModel.value = ''
  chatMessages.value = []
  error.value = null
})

async function fetchProviders() {
  error.value = null

  try {
    const orgId = currentOrgId.value
    if (!orgId) return

    const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/providers`, {
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      error.value = errData.error || `Failed to fetch providers (${response.status})`
      return
    }

    const data = await response.json()
    providers.value = Array.isArray(data) ? data : data.providers || []

    // Auto-select first provider if none selected or current selection no longer available
    if (
      providers.value.length > 0 &&
      !providers.value.find((p) => p.id === selectedProviderId.value)
    ) {
      selectedProviderId.value = providers.value[0]!.id
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch providers'
  }
}

async function fetchModels(providerId?: string) {
  if (fetchingModels) return
  fetchingModels = true

  try {
    const orgId = currentOrgId.value
    if (!orgId) return

    let url = `${API_BASE}/api/orgs/${orgId}/ai/models`
    if (providerId) {
      url += `?provider_id=${providerId}`
    }

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    })

    if (!response.ok) return

    const data = await response.json()
    models.value = data.models || []

    // Auto-select model: prefer claude-sonnet-4.6, fallback to first
    if (models.value.length > 0 && !models.value.find((m) => m.id === selectedModel.value)) {
      const defaultModel = models.value.find((m) => m.id === 'claude-sonnet-4.6')
      selectedModel.value = defaultModel?.id || models.value[0]!.id
    }
  } catch {
    // ignore fetch errors
  } finally {
    fetchingModels = false
  }
}

async function* sendMessage(
  datasourceType: string,
  datasourceName: string,
  messages: AIMessage[],
): AsyncGenerator<string> {
  isLoading.value = true
  error.value = null

  try {
    const orgId = currentOrgId.value
    if (!orgId) {
      error.value = 'No organization selected'
      return
    }

    const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        provider_id: selectedProviderId.value || undefined,
        model: selectedModel.value || undefined,
        datasource_type: datasourceType,
        datasource_name: datasourceName,
        messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      error.value = errData.error || `AI request failed (${response.status})`
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      error.value = 'No response stream'
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            const content = json.choices?.[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch {
            // skip malformed JSON chunks
          }
        }
      }
    }

    // Handle remaining buffer
    if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim().startsWith('data: ')) {
      try {
        const json = JSON.parse(buffer.trim().slice(6))
        const content = json.choices?.[0]?.delta?.content
        if (content) {
          yield content
        }
      } catch {
        // skip
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send message'
  } finally {
    isLoading.value = false
  }
}

async function sendChatRequest(
  datasourceType: string,
  datasourceName: string,
  messages: ChatRequestMessage[],
  tools?: ToolDefinition[],
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const orgId = currentOrgId.value
  if (!orgId) throw new Error('No organization selected')

  const body: Record<string, unknown> = {
    provider_id: selectedProviderId.value || undefined,
    model: selectedModel.value || undefined,
    datasource_type: datasourceType,
    datasource_name: datasourceName,
    messages,
  }
  if (tools && tools.length > 0) {
    body.tools = tools
    body.stream = false
  }

  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/chat`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.error || `AI request failed (${response.status})`)
  }

  const contentType = response.headers.get('content-type') || ''

  // If SSE streaming response (no tools), collect all chunks
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

  // JSON response (with tools)
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
  return {
    providers,
    selectedProviderId,
    models,
    selectedModel,
    isLoading,
    error,
    chatMessages,
    fetchProviders,
    fetchModels,
    sendMessage,
    sendChatRequest,
  }
}
