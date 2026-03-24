import { ref } from 'vue'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// Module-level shared state — all callers see the same values
const isConnected = ref(false)
const githubUsername = ref('')
const hasCopilot = ref(false)
const error = ref('')

export function useCopilotAuth() {
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

  async function connect(_orgId: string) {
    try {
      // Start device flow
      const response = await fetch(`${API_BASE}/api/auth/github/device`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
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
          deviceFlowActive.value = false
        }
      }

      poll()
    } catch {
      // Failed to start GitHub connection
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

  return {
    isConnected,
    githubUsername,
    hasCopilot,
    error,
    deviceFlowActive,
    userCode,
    verificationUri,
    checkConnection,
    connect,
    cancelDeviceFlow,
    disconnect,
  }
}
