import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useRoute: vi.fn(() => ({ params: {}, query: {} })),
}))

describe('useCopilot', () => {
  beforeEach(async () => {
    // Reset module between tests to start fresh
    vi.resetModules()
  })

  it('shares isConnected across multiple calls', async () => {
    const { useCopilot } = await import('./useCopilot')
    const a = useCopilot()
    const b = useCopilot()

    a.isConnected.value = true

    expect(b.isConnected.value).toBe(true)
  })

  it('shares githubUsername across multiple calls', async () => {
    const { useCopilot } = await import('./useCopilot')
    const a = useCopilot()
    const b = useCopilot()

    a.githubUsername.value = 'octocat'

    expect(b.githubUsername.value).toBe('octocat')
  })

  it('shares hasCopilot across multiple calls', async () => {
    const { useCopilot } = await import('./useCopilot')
    const a = useCopilot()
    const b = useCopilot()

    a.hasCopilot.value = true

    expect(b.hasCopilot.value).toBe(true)
  })

  it('shares chatMessages across multiple calls (persistent chat)', async () => {
    const { useCopilot } = await import('./useCopilot')
    const a = useCopilot()
    const b = useCopilot()

    a.chatMessages.value.push({ role: 'user', content: 'Hello' })

    expect(b.chatMessages.value).toHaveLength(1)
    expect(b.chatMessages.value[0].content).toBe('Hello')
  })

  it('does NOT share deviceFlowActive across calls', async () => {
    const { useCopilot } = await import('./useCopilot')
    const a = useCopilot()
    const b = useCopilot()

    a.deviceFlowActive.value = true

    expect(b.deviceFlowActive.value).toBe(false)
  })

  it('shares models across multiple calls', async () => {
    const { useCopilot } = await import('./useCopilot')
    const a = useCopilot()
    const b = useCopilot()

    a.models.value = [
      { id: 'gpt-4', name: 'GPT-4', vendor: 'openai', category: 'chat', preview: false, premium_multiplier: 1 },
    ]

    expect(b.models.value).toHaveLength(1)
    expect(b.models.value[0].id).toBe('gpt-4')
  })
})
