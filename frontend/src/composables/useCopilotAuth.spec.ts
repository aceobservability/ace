import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useRoute: vi.fn(() => ({ params: {}, query: {} })),
}))

describe('useCopilotAuth', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it('shares isConnected across calls', async () => {
    const { useCopilotAuth } = await import('./useCopilotAuth')
    const a = useCopilotAuth()
    const b = useCopilotAuth()
    a.isConnected.value = true
    expect(b.isConnected.value).toBe(true)
  })

  it('shares githubUsername across calls', async () => {
    const { useCopilotAuth } = await import('./useCopilotAuth')
    const a = useCopilotAuth()
    const b = useCopilotAuth()
    a.githubUsername.value = 'octocat'
    expect(b.githubUsername.value).toBe('octocat')
  })

  it('shares hasCopilot across calls', async () => {
    const { useCopilotAuth } = await import('./useCopilotAuth')
    const a = useCopilotAuth()
    const b = useCopilotAuth()
    a.hasCopilot.value = true
    expect(b.hasCopilot.value).toBe(true)
  })

  it('does NOT share deviceFlowActive across calls', async () => {
    const { useCopilotAuth } = await import('./useCopilotAuth')
    const a = useCopilotAuth()
    const b = useCopilotAuth()
    a.deviceFlowActive.value = true
    expect(b.deviceFlowActive.value).toBe(false)
  })
})
