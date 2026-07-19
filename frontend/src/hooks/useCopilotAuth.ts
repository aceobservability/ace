import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Generation token so only the latest poller may update local UI / shared state.
  const pollGenerationRef = useRef(0)
  const pollActiveRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const syncFromShared = () => {
      setIsConnected(sharedConnected)
      setGithubUsername(sharedUsername)
      setHasCopilot(sharedHasCopilot)
      setError(sharedError)
    }
    listeners.add(syncFromShared)
    return () => {
      mountedRef.current = false
      listeners.delete(syncFromShared)
      // Stop any in-flight device poll when the consumer unmounts.
      pollActiveRef.current = false
      pollGenerationRef.current += 1
    }
  }, [])

  const stopPolling = useCallback(() => {
    pollActiveRef.current = false
    pollGenerationRef.current += 1
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
    // Cancel any previous poll before starting a new device flow.
    stopPolling()

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

      if (!mountedRef.current) return

      setUserCode(data.user_code)
      setVerificationUri(data.verification_uri)
      setDeviceFlowActive(true)

      const interval = (data.interval || 5) * 1000
      const expiresAt = Date.now() + (data.expires_in || 900) * 1000
      const deviceCode = data.device_code
      const generation = pollGenerationRef.current + 1
      pollGenerationRef.current = generation
      pollActiveRef.current = true

      const isCurrent = () =>
        pollActiveRef.current &&
        pollGenerationRef.current === generation &&
        mountedRef.current

      const poll = async () => {
        while (Date.now() < expiresAt && isCurrent()) {
          await new Promise(resolve => setTimeout(resolve, interval))
          if (!isCurrent()) return

          try {
            const pollResp = await fetch(`${API_BASE}/api/auth/github/device/poll`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ device_code: deviceCode }),
            })

            if (!isCurrent()) return

            if (!pollResp.ok) {
              setDeviceFlowActive(false)
              pollActiveRef.current = false
              return
            }

            const result = (await pollResp.json()) as {
              status: string
              username?: string
              has_copilot?: boolean
            }
            if (result.status === 'connected') {
              if (!isCurrent()) return
              sharedConnected = true
              sharedUsername = result.username || ''
              sharedHasCopilot = Boolean(result.has_copilot)
              sharedError = ''
              notifyListeners()
              setDeviceFlowActive(false)
              setUserCode('')
              setVerificationUri('')
              pollActiveRef.current = false
              return
            }
          } catch {
            // Network error — keep polling while this generation is current.
          }
        }

        if (isCurrent()) {
          setDeviceFlowActive(false)
          pollActiveRef.current = false
        }
      }

      void poll()
    } catch {
      // Failed to start GitHub connection.
    }
  }, [stopPolling])

  const cancelDeviceFlow = useCallback(() => {
    stopPolling()
    setDeviceFlowActive(false)
    setUserCode('')
    setVerificationUri('')
  }, [stopPolling])

  const disconnect = useCallback(async () => {
    stopPolling()
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
  }, [stopPolling])

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
