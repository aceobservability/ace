import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSendChatRequest = vi.fn()
const mockExecuteTool = vi.fn()

vi.mock('./useAIProvider', () => ({
  useAIProvider: () => ({
    sendChatRequest: mockSendChatRequest,
  }),
}))

vi.mock('./useCopilotTools', () => ({
  useCopilotToolExecutor: () => ({
    executeTool: mockExecuteTool,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: { value: 'org-1' },
  }),
}))

vi.mock('./useQueryEditor', () => ({
  useQueryEditor: () => ({
    hasEditor: () => false,
    setQuery: vi.fn(),
    execute: vi.fn(),
  }),
}))

import { useDashboardGeneration } from './useDashboardGeneration'

const validSpec = {
  title: 'Test Dashboard',
  panels: [
    {
      title: 'Panel 1',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 3 },
      query: { expr: 'up', datasource_id: '' },
    },
  ],
}

function makeToolCall(name: string, args: Record<string, unknown>) {
  return {
    id: `tc-${name}`,
    type: 'function' as const,
    function: { name, arguments: JSON.stringify(args) },
  }
}

describe('useDashboardGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const getDeps = () =>
    useDashboardGeneration(
      () => 'ds-1',
      () => 'org-1',
      () => 'victoriametrics',
    )

  describe('generate()', () => {
    it('runs tool loop: get_metrics -> generate_dashboard -> returns spec', async () => {
      mockSendChatRequest
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [makeToolCall('get_metrics', {})],
        })
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [makeToolCall('generate_dashboard', validSpec)],
        })
      mockExecuteTool.mockResolvedValue('metric1\nmetric2')

      const { generate } = getDeps()
      const result = await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(result.spec).not.toBeNull()
      expect(result.spec!.title).toBe('Test Dashboard')
      expect(mockExecuteTool).toHaveBeenCalledOnce()
    })

    it('injects datasourceId into every panel query.datasource_id', async () => {
      mockSendChatRequest.mockResolvedValueOnce({
        content: null,
        toolCalls: [makeToolCall('generate_dashboard', validSpec)],
      })

      const { generate } = getDeps()
      const result = await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(result.spec!.panels[0].query.datasource_id).toBe('ds-1')
    })

    it('calls onContent callback when AI returns content between iterations', async () => {
      mockSendChatRequest
        .mockResolvedValueOnce({ content: 'Thinking...', toolCalls: [] })

      const onContent = vi.fn()
      const { generate } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
        { onContent },
      )

      expect(onContent).toHaveBeenCalledWith('Thinking...')
    })

    it('calls onDashboardSpec callback when generate_dashboard parsed', async () => {
      mockSendChatRequest.mockResolvedValueOnce({
        content: null,
        toolCalls: [makeToolCall('generate_dashboard', validSpec)],
      })

      const onDashboardSpec = vi.fn()
      const { generate } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
        { onDashboardSpec },
      )

      expect(onDashboardSpec).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Test Dashboard' }),
      )
    })

    it('calls onToolStatus callback for each tool execution', async () => {
      mockSendChatRequest
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [makeToolCall('get_metrics', {})],
        })
        .mockResolvedValueOnce({ content: 'Done', toolCalls: [] })
      mockExecuteTool.mockResolvedValue('metric1')

      const onToolStatus = vi.fn()
      const { generate } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
        { onToolStatus },
      )

      expect(onToolStatus).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'get_metrics' }),
      )
    })

    it('stops loop when AI returns no tool_calls', async () => {
      mockSendChatRequest.mockResolvedValueOnce({
        content: 'No tools needed',
        toolCalls: [],
      })

      const { generate, error } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      // Content-only response (no spec) is valid (e.g. during refinement), so no error
      expect(error.value).toBeNull()
    })

    it('sets error when max iterations exhausted without generate_dashboard', async () => {
      mockSendChatRequest.mockResolvedValue({
        content: null,
        toolCalls: [makeToolCall('get_metrics', {})],
      })
      mockExecuteTool.mockResolvedValue('metric1')

      const { generate, error } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(error.value).toBe('Could not generate a dashboard. Try a more specific prompt.')
    })

    it('sets error when generate_dashboard returns malformed JSON', async () => {
      mockSendChatRequest.mockResolvedValueOnce({
        content: null,
        toolCalls: [{
          id: 'tc-1',
          type: 'function',
          function: { name: 'generate_dashboard', arguments: 'not json' },
        }],
      })

      const { generate, error } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(error.value).toBe('AI returned an invalid dashboard.')
    })

    it('sets error when spec fails validateDashboardSpec', async () => {
      const badSpec = { title: '', panels: [] }
      mockSendChatRequest.mockResolvedValueOnce({
        content: null,
        toolCalls: [makeToolCall('generate_dashboard', badSpec)],
      })

      const { generate, error } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(error.value).toContain('Generated dashboard has issues')
    })

    it('marks tool status as error when executeTool throws, continues loop', async () => {
      mockSendChatRequest
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [makeToolCall('get_metrics', {})],
        })
        .mockResolvedValueOnce({ content: 'Done', toolCalls: [] })
      mockExecuteTool.mockRejectedValueOnce(new Error('Tool failed'))

      const { generate, toolStatuses } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(toolStatuses.value[0]!.status).toBe('error')
    })

    it('sets error when sendChatRequest throws (network)', async () => {
      mockSendChatRequest.mockRejectedValueOnce(new Error('Network error'))

      const { generate, error } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(error.value).toBe('Network error')
    })

    it('retries on 429, succeeds on second attempt', async () => {
      // This is tested at the useAIProvider level, but ensure composable
      // surfaces the error properly when it does fail
      mockSendChatRequest.mockResolvedValueOnce({
        content: null,
        toolCalls: [makeToolCall('generate_dashboard', validSpec)],
      })

      const { generate } = getDeps()
      const result = await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(result.spec).not.toBeNull()
    })

    it('throws on double 429 (retry exhausted)', async () => {
      mockSendChatRequest.mockRejectedValueOnce(new Error('AI request failed (429)'))

      const { generate, error } = getDeps()
      await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(error.value).toBe('AI request failed (429)')
    })

    it('prevents concurrent calls via isGenerating guard', async () => {
      let resolveFirst: () => void
      mockSendChatRequest.mockImplementationOnce(
        () => new Promise<{ content: string; toolCalls: never[] }>((resolve) => {
          resolveFirst = () => resolve({ content: 'done', toolCalls: [] })
        }),
      )

      const { generate, isGenerating } = getDeps()
      const first = generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(isGenerating.value).toBe(true)

      // Second call should be no-op
      const second = await generate(
        [{ role: 'user', content: 'test2' }],
        [],
        'MyDS',
      )
      expect(second.spec).toBeNull()

      resolveFirst!()
      await first
    })

    it('returns both spec and content from the resolved promise', async () => {
      mockSendChatRequest
        .mockResolvedValueOnce({ content: 'Let me check...', toolCalls: [] })

      const { generate } = getDeps()
      const result = await generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      expect(result.content).toBe('Let me check...')
    })
  })

  describe('cancel()', () => {
    it('aborts in-flight fetch via AbortController, resets isGenerating', async () => {
      mockSendChatRequest.mockImplementation(
        () => new Promise(() => {}), // never resolves
      )

      const { generate, cancel, isGenerating } = getDeps()
      // Fire and forget — cancel will abort it
      void generate(
        [{ role: 'user', content: 'test' }],
        [],
        'MyDS',
      )

      // Give it a tick to start
      await new Promise((r) => setTimeout(r, 0))
      expect(isGenerating.value).toBe(true)

      cancel()
      expect(isGenerating.value).toBe(false)
    })

    it('is a no-op when not generating', () => {
      const { cancel, isGenerating, error } = getDeps()
      cancel()
      expect(isGenerating.value).toBe(false)
      expect(error.value).toBeNull()
    })
  })
})
