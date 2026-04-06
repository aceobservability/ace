import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// Mock useOrganization — returns a reactive ref we can mutate in tests
const mockOrgId = ref<string | null>('org-1')
vi.mock('./useOrganization', () => ({
  useOrganization: () => ({ currentOrgId: mockOrgId }),
}))

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useRoute: vi.fn(() => ({ params: {}, query: {} })),
}))

describe('useAIProvider', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.restoreAllMocks()
    mockOrgId.value = 'org-1'
  })

  describe('fetchProviders', () => {
    it('populates providers list and auto-selects first', async () => {
      const mockProviders = [
        { id: 'p1', provider_type: 'openai', display_name: 'OpenAI', enabled: true },
        { id: 'p2', provider_type: 'copilot', display_name: 'Copilot', enabled: true },
      ]
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ providers: mockProviders }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchProviders, providers, selectedProviderId } = useAIProvider()

      await fetchProviders()

      expect(providers.value).toHaveLength(2)
      expect(providers.value[0].id).toBe('p1')
      expect(selectedProviderId.value).toBe('p1')
    })

    it('sets error when fetch fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal Server Error' }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchProviders, error, providers } = useAIProvider()

      await fetchProviders()

      expect(providers.value).toHaveLength(0)
      expect(error.value).toBe('Internal Server Error')
    })

    it('sets generic error when fetch rejects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchProviders, error } = useAIProvider()

      await fetchProviders()

      expect(error.value).toBe('Network error')
    })

    it('includes org id in the request URL', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: [] }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchProviders } = useAIProvider()

      await fetchProviders()

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/providers'),
        expect.any(Object),
      )
    })
  })

  describe('fetchModels', () => {
    it('populates models for selected provider', async () => {
      const mockModels = [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          vendor: 'openai',
          category: 'chat',
          provider_id: 'p1',
          provider_name: 'OpenAI',
        },
        {
          id: 'claude-sonnet-4.6',
          name: 'Claude Sonnet',
          vendor: 'anthropic',
          category: 'chat',
          provider_id: 'p1',
          provider_name: 'OpenAI',
        },
      ]
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ models: mockModels }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchModels, models, selectedModel } = useAIProvider()

      await fetchModels('p1')

      expect(models.value).toHaveLength(2)
      // Should prefer claude-sonnet-4.6
      expect(selectedModel.value).toBe('claude-sonnet-4.6')
    })

    it('auto-selects first model when claude-sonnet-4.6 is not available', async () => {
      const mockModels = [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          vendor: 'openai',
          category: 'chat',
          provider_id: 'p1',
          provider_name: 'OpenAI',
        },
      ]
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ models: mockModels }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchModels, models, selectedModel } = useAIProvider()

      await fetchModels('p1')

      expect(models.value).toHaveLength(1)
      expect(selectedModel.value).toBe('gpt-4')
    })

    it('includes provider_id as query parameter', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchModels } = useAIProvider()

      await fetchModels('p1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/orgs/org-1/ai/models?provider_id=p1'),
        expect.any(Object),
      )
    })

    it('fetches all models when no provider_id given', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const { useAIProvider } = await import('./useAIProvider')
      const { fetchModels } = useAIProvider()

      await fetchModels()

      const url = fetchSpy.mock.calls[0][0] as string
      expect(url).toContain('/api/orgs/org-1/ai/models')
      expect(url).not.toContain('provider_id')
    })
  })

  describe('shared state', () => {
    it('shares state across multiple composable instances', async () => {
      const { useAIProvider } = await import('./useAIProvider')
      const a = useAIProvider()
      const b = useAIProvider()

      a.providers.value = [
        { id: 'p1', provider_type: 'openai', display_name: 'OpenAI', enabled: true },
      ]
      a.selectedProviderId.value = 'p1'
      a.selectedModel.value = 'gpt-4'
      a.chatMessages.value.push({ role: 'user', content: 'Hello' })

      expect(b.providers.value).toHaveLength(1)
      expect(b.selectedProviderId.value).toBe('p1')
      expect(b.selectedModel.value).toBe('gpt-4')
      expect(b.chatMessages.value).toHaveLength(1)
      expect(b.chatMessages.value[0].content).toBe('Hello')
    })
  })

  describe('sendChatRequest', () => {
    it('includes provider_id in request body', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          choices: [{ message: { content: 'Hello!', tool_calls: [] } }],
        }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const { useAIProvider } = await import('./useAIProvider')
      const { sendChatRequest, selectedProviderId, selectedModel } = useAIProvider()

      selectedProviderId.value = 'p1'
      selectedModel.value = 'gpt-4'

      await sendChatRequest('prometheus', 'my-prom', [{ role: 'user', content: 'Hello' }])

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(body.provider_id).toBe('p1')
      expect(body.model).toBe('gpt-4')
      expect(body.datasource_type).toBe('prometheus')
      expect(body.datasource_name).toBe('my-prom')
    })

    it('returns content and tool calls from JSON response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'Here is the result',
                  tool_calls: [
                    {
                      id: 'tc1',
                      type: 'function',
                      function: { name: 'run_query', arguments: '{"query":"up"}' },
                    },
                  ],
                },
              },
            ],
          }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { sendChatRequest, selectedProviderId } = useAIProvider()
      selectedProviderId.value = 'p1'

      const result = await sendChatRequest('prometheus', 'my-prom', [
        { role: 'user', content: 'Hello' },
      ])

      expect(result.content).toBe('Here is the result')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].function.name).toBe('run_query')
    })

    it('throws error when fetch fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { sendChatRequest, selectedProviderId } = useAIProvider()
      selectedProviderId.value = 'p1'

      await expect(
        sendChatRequest('prometheus', 'my-prom', [{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('Server error')
    })

    it('retries once on 429, returns result on success', async () => {
      let callCount = 0
      const fetchSpy = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return { ok: false, status: 429, json: async () => ({ error: 'Rate limited' }) }
        }
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            choices: [{ message: { content: 'Success after retry', tool_calls: [] } }],
          }),
        }
      })
      vi.stubGlobal('fetch', fetchSpy)

      const { useAIProvider } = await import('./useAIProvider')
      const { sendChatRequest, selectedProviderId } = useAIProvider()
      selectedProviderId.value = 'p1'

      const result = await sendChatRequest('prometheus', 'my-prom', [
        { role: 'user', content: 'Hello' },
      ])

      expect(result.content).toBe('Success after retry')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('throws after 429 on retry', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({ error: 'Rate limited' }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { sendChatRequest, selectedProviderId } = useAIProvider()
      selectedProviderId.value = 'p1'

      await expect(
        sendChatRequest('prometheus', 'my-prom', [{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('Rate limited')
    })

    it('aborts fetch when AbortSignal fires', async () => {
      const controller = new AbortController()
      const fetchSpy = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        if (opts.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            choices: [{ message: { content: 'done', tool_calls: [] } }],
          }),
        }
      })
      vi.stubGlobal('fetch', fetchSpy)

      const { useAIProvider } = await import('./useAIProvider')
      const { sendChatRequest, selectedProviderId } = useAIProvider()
      selectedProviderId.value = 'p1'

      controller.abort()

      await expect(
        sendChatRequest(
          'prometheus',
          'my-prom',
          [{ role: 'user', content: 'Hello' }],
          undefined,
          controller.signal,
        ),
      ).rejects.toThrow()
    })
  })

  describe('org switch', () => {
    it('resets state when org changes', async () => {
      // We need to re-mock useOrganization inside the dynamically imported module
      // The module-level watch triggers on mockOrgId changes since we mock useOrganization
      const { useAIProvider } = await import('./useAIProvider')
      const { providers, selectedProviderId, models, selectedModel, chatMessages, error } =
        useAIProvider()

      // Set some state
      providers.value = [
        { id: 'p1', provider_type: 'openai', display_name: 'OpenAI', enabled: true },
      ]
      selectedProviderId.value = 'p1'
      models.value = [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          vendor: 'openai',
          category: 'chat',
          provider_id: 'p1',
          provider_name: 'OpenAI',
        },
      ]
      selectedModel.value = 'gpt-4'
      chatMessages.value = [{ role: 'user', content: 'Hello' }]
      error.value = 'some error'

      // Change org
      mockOrgId.value = 'org-2'

      // Vue watchers are async, need to flush
      await new Promise((r) => setTimeout(r, 0))

      expect(providers.value).toHaveLength(0)
      expect(selectedProviderId.value).toBe('')
      expect(models.value).toHaveLength(0)
      expect(selectedModel.value).toBe('')
      expect(chatMessages.value).toHaveLength(0)
      expect(error.value).toBeNull()
    })
  })

  describe('sendMessage', () => {
    it('includes provider_id in request body and streams SSE content', async () => {
      // Create a mock ReadableStream that yields SSE data
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ]
      const encoder = new TextEncoder()
      let readerCallCount = 0
      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (readerCallCount < sseData.length) {
            const chunk = sseData[readerCallCount]
            readerCallCount++
            return { done: false, value: encoder.encode(chunk) }
          }
          return { done: true, value: undefined }
        }),
      }

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      })
      vi.stubGlobal('fetch', fetchSpy)

      const { useAIProvider } = await import('./useAIProvider')
      const { sendMessage, selectedProviderId, selectedModel } = useAIProvider()

      selectedProviderId.value = 'p1'
      selectedModel.value = 'gpt-4'

      const chunks: string[] = []
      for await (const chunk of sendMessage('prometheus', 'my-prom', [
        { role: 'user', content: 'Hi' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Hello', ' world'])

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(body.provider_id).toBe('p1')
      expect(body.model).toBe('gpt-4')
    })

    it('sets error when response is not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { sendMessage, error, selectedProviderId } = useAIProvider()
      selectedProviderId.value = 'p1'

      const chunks: string[] = []
      for await (const chunk of sendMessage('prometheus', 'my-prom', [
        { role: 'user', content: 'Hi' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(0)
      expect(error.value).toBe('Unauthorized')
    })

    it('sets isLoading during message send', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: { getReader: () => mockReader },
        }),
      )

      const { useAIProvider } = await import('./useAIProvider')
      const { sendMessage, isLoading, selectedProviderId } = useAIProvider()
      selectedProviderId.value = 'p1'

      expect(isLoading.value).toBe(false)

      const gen = sendMessage('prometheus', 'my-prom', [{ role: 'user', content: 'Hi' }])
      // Exhaust the generator
      for await (const _ of gen) {
        // no-op
      }

      expect(isLoading.value).toBe(false)
    })
  })
})
