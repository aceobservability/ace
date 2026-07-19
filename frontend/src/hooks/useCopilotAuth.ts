import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '@/api/base'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// Module-level shared connection state so multiple consumers stay in sync.
let sharedConnected = false
let sharedUsername = ''
let sharedHasCopilot = false
let sharedError = ''
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) listener()
}

export function useCopilotAuth() {
  const [isConnected, setIsConnected] = useState(sharedConnected)
  const [githubUsername, setGithubUsername] = useState(sharedUsername)
  const [hasCopilot, setHasCopilot] = useState(sharedHasCopilot)
  const [error, setError] = useState(sharedError)
  const [deviceFlowActive, setDeviceFlowActive] = useState(false)
  const [userCode, setUserCode] = useState('')
  const [verificationUri, setVerificationUri] = useState('')
  const [pollCancel, setPollCancel] = useState<(() => void) | null>(null)

  useEffect(() => {
    const syncFromShared = () => {
      setIsConnected(sharedConnected)
      setGithubUsername(sharedUsername)
      setHasCopilot(sharedHasCopilot)
      setError(sharedError)
    }
    listeners.add(syncFromShared)
    return () => {
      listeners.delete(syncFromShared)
    }
  }, [])

  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/github/connection`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        sharedConnected = false
        sharedUsername = ''
        sharedHasCopilot = false
        notifyListeners()
        return
      }
      const data = (await response.json()) as {
        connected: boolean
        username?: string
        has_copilot: boolean
      }
      sharedConnected = data.connected
      sharedUsername = data.username || ''
      sharedHasCopilot = data.has_copilot
      sharedError = ''
      notifyListeners()
    } catch {
      sharedConnected = false
      sharedUsername = ''
      sharedHasCopilot = false
      notifyListeners()
    }
  }, [])

  const connect = useCallback(async (_orgId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/github/device`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!response.ok) return

      const data = (await response.json()) as {
        user_code: string
        verification_uri: string
        interval?: number
        expires_in?: number
        device_code: string
      }

      setUserCode(data.user_code)
      setVerificationUri(data.verification_uri)
      setDeviceFlowActive(true)

      const interval = (data.interval || 5) * 1000
      const expiresAt = Date.now() + (data.expires_in || 900) * 1000
      const deviceCode = data.device_code
      let active = true

      setPollCancel(() => () => {
        active = false
      })

      const poll = async () => {
        while (Date.now() < expiresAt && active) {
          await new Promise(resolve => setTimeout(resolve, interval))
          if (!active) return

          try {
            const pollResp = await fetch(`${API_BASE}/api/auth/github/device/poll`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ device_code: deviceCode }),
            })

            if (!pollResp.ok) {
              setDeviceFlowActive(false)
              return
            }

            const result = (await pollResp.json()) as {
              status: string
              username?: string
              has_copilot?: boolean
            }
            if (result.status === 'connected') {
              sharedConnected = true
              sharedUsername = result.username || ''
              sharedHasCopilot = Boolean(result.has_copilot)
              sharedError = ''
              notifyListeners()
              setDeviceFlowActive(false)
              return
            }
          } catch {
            // Network error — keep polling.
          }
        }

        if (active) {
          setDeviceFlowActive(false)
        }
      }

      void poll()
    } catch {
      // Failed to start GitHub connection.
    }
  }, [])

  const cancelDeviceFlow = useCallback(() => {
    pollCancel?.()
    setPollCancel(null)
    setDeviceFlowActive(false)
    setUserCode('')
    setVerificationUri('')
  }, [pollCancel])

  const disconnect = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/github/connection`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      sharedConnected = false
      sharedUsername = ''
      sharedHasCopilot = false
      sharedError = ''
      notifyListeners()
    } catch {
      // ignore
    }
  }, [])

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
