import { ref } from 'vue'
import type { DashboardSpec } from '../utils/dashboardSpec'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  dashboardSpec?: DashboardSpec
}

interface CopilotModel {
  id: string
  name: string
  vendor: string
  category: string
  preview: boolean
  premium_multiplier: number
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
const isConnected = ref(false)
const githubUsername = ref('')
const hasCopilot = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const models = ref<CopilotModel[]>([])
const selectedModel = ref<string>('')
const chatMessages = ref<CopilotMessage[]>([])
let fetchingModels = false

export function useCopilot() {
  // Device flow state — per-call, only one component uses it at a time
  const deviceFlowActive = ref(false)
  const userCode = ref('')
  const verificationUri = ref('')

  async function checkConnection() {
    try {
      const response = await fetch(`${API_BASE}/api/auth/github/connection`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        isConnected.value = false
        githubUsername.value = ''
        hasCopilot.value = false
        return
      }
      const data = await response.json()
      isConnected.value = data.connected
      githubUsername.value = data.username || ''
      hasCopilot.value = data.has_copilot
    } catch {
      isConnected.value = false
      githubUsername.value = ''
      hasCopilot.value = false
    }
  }

  async function fetchModels() {
    if (fetchingModels) return
    fetchingModels = true
    try {
      const response = await fetch(`${API_BASE}/api/copilot/models`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) return
      const data = await response.json()
      models.value = data.models || []
      // Auto-select first model if none selected or current selection no longer available
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

  async function connect(_orgId: string) {
    error.value = null

    try {
      // Start device flow
      const response = await fetch(`${API_BASE}/api/auth/github/device`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        error.value = data.error || 'Failed to start device flow'
        return
      }

      const data = await response.json()
      userCode.value = data.user_code
      verificationUri.value = data.verification_uri
      deviceFlowActive.value = true

      // Poll for completion
      const interval = (data.interval || 5) * 1000
      const expiresAt = Date.now() + (data.expires_in || 900) * 1000
      const deviceCode = data.device_code

      const poll = async () => {
        while (Date.now() < expiresAt && deviceFlowActive.value) {
          await new Promise((resolve) => setTimeout(resolve, interval))
          if (!deviceFlowActive.value) return

          try {
            const pollResp = await fetch(`${API_BASE}/api/auth/github/device/poll`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ device_code: deviceCode }),
            })

            if (!pollResp.ok) {
              const errData = await pollResp.json().catch(() => ({}))
              error.value = errData.error || 'Authorization failed'
              deviceFlowActive.value = false
              return
            }

            const result = await pollResp.json()
            if (result.status === 'connected') {
              isConnected.value = true
              githubUsername.value = result.username || ''
              hasCopilot.value = result.has_copilot
              deviceFlowActive.value = false
              return
            }
            // status === 'pending' — keep polling
          } catch {
            // Network error, keep polling
          }
        }

        if (deviceFlowActive.value) {
          error.value = 'Device flow expired. Please try again.'
          deviceFlowActive.value = false
        }
      }

      poll()
    } catch {
      error.value = 'Failed to start GitHub connection'
    }
  }

  function cancelDeviceFlow() {
    deviceFlowActive.value = false
    userCode.value = ''
    verificationUri.value = ''
  }

  async function disconnect() {
    try {
      await fetch(`${API_BASE}/api/auth/github/connection`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      isConnected.value = false
      githubUsername.value = ''
      hasCopilot.value = false
    } catch {
      // ignore
    }
  }

  async function* sendMessage(
    datasourceType: string,
    datasourceName: string,
    messages: CopilotMessage[],
  ): AsyncGenerator<string> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          datasource_type: datasourceType,
          datasource_name: datasourceName,
          model: selectedModel.value || undefined,
          messages,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        error.value = errData.error || `Copilot request failed (${response.status})`
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
    const body: Record<string, unknown> = {
      datasource_type: datasourceType,
      datasource_name: datasourceName,
      model: selectedModel.value || undefined,
      messages,
    }
    if (tools && tools.length > 0) {
      body.tools = tools
      body.stream = false
    }

    const response = await fetch(`${API_BASE}/api/copilot/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error || `Copilot request failed (${response.status})`)
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
    // GitHub Copilot API may split content and tool_calls across multiple choices,
    // so we merge all choices to extract both.
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

  return {
    isConnected,
    githubUsername,
    hasCopilot,
    isLoading,
    error,
    models,
    selectedModel,
    chatMessages,
    deviceFlowActive,
    userCode,
    verificationUri,
    checkConnection,
    fetchModels,
    connect,
    cancelDeviceFlow,
    disconnect,
    sendMessage,
    sendChatRequest,
  }
}
