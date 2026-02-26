import { ref } from 'vue'

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
}

export function useCopilot() {
  const isConnected = ref(false)
  const githubUsername = ref('')
  const hasCopilot = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

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

  function connect(orgId: string) {
    window.location.href = `${API_BASE}/api/auth/github/login?org=${orgId}`
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

  return {
    isConnected,
    githubUsername,
    hasCopilot,
    isLoading,
    error,
    checkConnection,
    connect,
    disconnect,
    sendMessage,
  }
}
