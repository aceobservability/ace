import { Loader2, Send, Wrench } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ChatRequestMessage } from '@/api/aiChat'
import { DashboardSpecPreview } from '@/components/DashboardSpecPreview'
import { useAIProvider } from '@/hooks/useAIProvider'
import { useDashboardGeneration } from '@/hooks/useDashboardGeneration'
import { useOrganization } from '@/hooks/useOrganization'
import { getToolsForDatasourceType } from '@/lib/copilotTools'
import type { CommandContext } from '@/stores/commandContextStore'
import type { DashboardSpec } from '@/utils/dashboardSpec'
import { escapeHtml, initMarkdown, renderMarkdown } from '@/utils/markdown'

export type CopilotChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  dashboardSpec?: DashboardSpec
}

export type CopilotChatSessionProps = {
  /** Page/datasource context for system prompt + tools. */
  context: Pick<
    CommandContext,
    'datasourceId' | 'datasourceType' | 'datasourceName'
  > | null
  /** Fire this prompt once when the session mounts (Cmd+K entry). */
  initialPrompt?: string
  /** When true, keep refining an existing dashboardSpec in the system prompt. */
  allowSpecRefinement?: boolean
  /** Visual density / chrome variants. */
  variant?: 'sidebar' | 'modal'
  inputTestId?: string
  sendTestId?: string
  modelSelectTestId?: string
  placeholder?: string
  emptyTitle?: string
  emptySubtitle?: string
  className?: string
  style?: React.CSSProperties
  /** Optional slot above the message list (e.g. context chips). */
  headerSlot?: React.ReactNode
  /** Hide model picker (when parent owns that chrome). */
  showModelPicker?: boolean
  /** Called after models/providers are loaded on mount. */
  onReady?: () => void
}

function toolStatusIcon(status: 'running' | 'complete' | 'error'): string {
  switch (status) {
    case 'running':
      return '...'
    case 'complete':
      return 'done'
    case 'error':
      return 'failed'
  }
}

function buildSystemPrompt(
  context: CopilotChatSessionProps['context'],
  dashboardSpec: DashboardSpec | null,
  allowSpecRefinement: boolean,
): ChatRequestMessage[] {
  const messages: ChatRequestMessage[] = []

  if (context?.datasourceId) {
    messages.push({
      role: 'system',
      content: `You have tools to explore datasource data. You are currently working with datasource '${context.datasourceName}' (type: ${context.datasourceType}, id: ${context.datasourceId}). You can use the data discovery tools directly.`,
    })
  } else {
    messages.push({
      role: 'system',
      content:
        'You have tools to explore datasource data. No datasource is currently selected. Call list_datasources first to discover available datasources, then pass the datasource_id to other tools.',
    })
  }

  if (allowSpecRefinement && dashboardSpec) {
    messages.push({
      role: 'system',
      content: `Current dashboard spec to refine:\n${JSON.stringify(dashboardSpec, null, 2)}\nModify and call generate_dashboard with the full updated spec.`,
    })
  }

  return messages
}

export function CopilotChatSession({
  context,
  initialPrompt,
  allowSpecRefinement = false,
  variant = 'modal',
  inputTestId = 'copilot-input',
  sendTestId = 'copilot-send',
  modelSelectTestId = 'copilot-model',
  placeholder = 'Ask a follow-up...',
  emptyTitle = 'Ask about your metrics, logs, or traces',
  emptySubtitle = 'I can query datasources, analyze anomalies, and generate dashboards.',
  className,
  style,
  headerSlot,
  showModelPicker = true,
  onReady,
}: CopilotChatSessionProps) {
  const idPrefix = useId()
  const messageIdRef = useRef(0)
  const nextMessageId = useCallback(() => {
    messageIdRef.current += 1
    return `${idPrefix}-msg-${messageIdRef.current}`
  }, [idPrefix])

  const {
    models,
    selectedModel,
    selectedProviderId,
    fetchModels,
    fetchProviders,
    providers,
    setSelectedModel,
  } = useAIProvider()

  const { currentOrg } = useOrganization()

  const { generate, toolStatuses, isGenerating, error: genError, cancel } = useDashboardGeneration(
    () => context?.datasourceId ?? '',
    () => currentOrg?.id ?? '',
    () => context?.datasourceType ?? '',
  )

  const [messages, setMessages] = useState<CopilotChatMessage[]>([])
  const [input, setInput] = useState('')
  const [dashboardSpec, setDashboardSpec] = useState<DashboardSpec | null>(null)
  const [renderedHtml, setRenderedHtml] = useState<Record<string, string>>({})
  const [markdownReady, setMarkdownReady] = useState(false)
  const messagesContainer = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const startedRef = useRef(false)
  const messagesRef = useRef<CopilotChatMessage[]>([])
  const dashboardSpecRef = useRef<DashboardSpec | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    dashboardSpecRef.current = dashboardSpec
  }, [dashboardSpec])

  const appendMessage = useCallback(
    (message: Omit<CopilotChatMessage, 'id'> & { id?: string }) => {
      const full: CopilotChatMessage = {
        id: message.id ?? nextMessageId(),
        role: message.role,
        content: message.content,
        ...(message.dashboardSpec ? { dashboardSpec: message.dashboardSpec } : {}),
      }
      setMessages(prev => {
        const next = [...prev, full]
        messagesRef.current = next
        return next
      })
      return full
    },
    [nextMessageId],
  )

  const handleSend = useCallback(
    async (userMessage: string) => {
      const prior = messagesRef.current
      const currentSpec = dashboardSpecRef.current
      appendMessage({ role: 'user', content: userMessage })

      const requestMessages: ChatRequestMessage[] = [
        ...buildSystemPrompt(context, currentSpec, allowSpecRefinement),
        ...prior.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: userMessage },
      ]

      const dsType = context?.datasourceType ?? ''
      const dsName = context?.datasourceName ?? ''
      const tools = getToolsForDatasourceType(dsType)
      const isRefinement = allowSpecRefinement && Boolean(currentSpec)

      if (!allowSpecRefinement) {
        setDashboardSpec(null)
        dashboardSpecRef.current = null
      }

      const result = await generate(requestMessages, tools, dsName, {
        onContent(text) {
          appendMessage({ role: 'assistant', content: text })
        },
        onDashboardSpec(spec) {
          setDashboardSpec(spec)
          dashboardSpecRef.current = spec
          appendMessage({
            role: 'assistant',
            content: isRefinement
              ? 'Dashboard updated. See the revised preview below.'
              : 'Dashboard generated. See the preview below.',
            dashboardSpec: spec,
          })
        },
      })

      if (result.spec) {
        setDashboardSpec(result.spec)
        dashboardSpecRef.current = result.spec
      }
    },
    [allowSpecRefinement, appendMessage, context, generate],
  )

  function handleSubmit() {
    const msg = input.trim()
    if (!msg || isGenerating) return
    setInput('')
    void handleSend(msg)
  }

  useEffect(() => {
    return () => {
      cancel()
    }
  }, [cancel])

  useEffect(() => {
    void initMarkdown().then(() => setMarkdownReady(true))
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-render new assistant messages
  useEffect(() => {
    if (!markdownReady) return
    let cancelled = false
    async function renderMessages() {
      const next: Record<string, string> = { ...renderedHtml }
      let changed = false
      for (const msg of messages) {
        if (msg.role === 'assistant' && !(msg.id in next)) {
          next[msg.id] = await renderMarkdown(msg.content)
          changed = true
        }
      }
      if (!cancelled && changed) setRenderedHtml(next)
    }
    void renderMessages()
    return () => {
      cancelled = true
    }
  }, [messages, markdownReady])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when transcript or generation changes
  useEffect(() => {
    if (messagesContainer.current) {
      messagesContainer.current.scrollTop = messagesContainer.current.scrollHeight
    }
  }, [messages, toolStatuses, isGenerating, dashboardSpec])

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only bootstrap
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void (async () => {
      await fetchProviders()
      await fetchModels(selectedProviderId || undefined)
      inputRef.current?.focus()
      onReady?.()
      if (initialPrompt?.trim()) {
        await handleSend(initialPrompt.trim())
      }
    })()
  }, [])

  const isSidebar = variant === 'sidebar'
  const bubbleMax = isSidebar ? '90%' : '80%'
  const userBubbleBg = isSidebar
    ? 'var(--color-primary-muted)'
    : 'var(--color-primary-container)'
  const userBubbleColor = isSidebar
    ? 'var(--color-on-surface)'
    : 'var(--color-on-primary-container)'
  const assistantBg = isSidebar
    ? 'var(--color-surface-container-high)'
    : 'var(--color-surface-container-low)'
  const assistantColor = isSidebar
    ? 'var(--color-on-surface-variant)'
    : 'var(--color-on-surface)'
  const borderColor = isSidebar
    ? 'var(--color-stroke-subtle)'
    : 'var(--color-outline-variant)'

  if (providers.length === 0 && !isGenerating) {
    return (
      <div className={className} style={style}>
        {headerSlot}
        <div className="px-4 py-6 text-center">
          <p className="mb-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            No AI provider configured
          </p>
          <p className="text-xs" style={{ color: 'var(--color-outline)' }}>
            Set one up in Settings → AI Configuration
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className ?? ''}`} style={style}>
      {showModelPicker && models.length > 0 ? (
        <div
          className="flex shrink-0 items-center justify-end gap-2 px-3 py-2"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          <select
            data-testid={modelSelectTestId}
            className="rounded border px-1.5 py-0.5"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-outline)',
              borderColor,
            }}
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
          >
            {providers.length > 1
              ? providers.map(p => (
                  <optgroup key={p.id} label={p.display_name}>
                    {models
                      .filter(mod => mod.provider_id === p.id)
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </optgroup>
                ))
              : models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
          </select>
        </div>
      ) : null}

      {headerSlot}

      <div ref={messagesContainer} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isGenerating ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              {emptyTitle}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-outline)' }}>
              {emptySubtitle}
            </p>
          </div>
        ) : null}

        {messages.map(msg =>
          msg.role === 'user' ? (
            <div key={msg.id} className="flex justify-end">
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  maxWidth: bubbleMax,
                  backgroundColor: userBubbleBg,
                  color: userBubbleColor,
                  border: isSidebar ? '1px solid rgba(201, 150, 15, 0.2)' : undefined,
                }}
              >
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex justify-start">
              <div
                className="prose prose-sm prose-invert rounded-lg px-3 py-2 text-sm"
                style={{
                  maxWidth: bubbleMax,
                  backgroundColor: assistantBg,
                  color: assistantColor,
                  border: isSidebar ? `1px solid ${borderColor}` : undefined,
                }}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized markdown, or escaped plain text while pending
                dangerouslySetInnerHTML={{
                  __html: renderedHtml[msg.id] ?? escapeHtml(msg.content),
                }}
              />
            </div>
          ),
        )}

        {toolStatuses.map((ts, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: tool status entries can repeat names
            key={`tool-${i}-${ts.name}`}
            className="flex items-center gap-2"
            style={{ fontSize: '11px', color: 'var(--color-outline)' }}
          >
            <Wrench size={11} aria-hidden />
            <span>{ts.name}</span>
            {ts.status === 'running' ? (
              <Loader2 size={11} className="animate-spin" aria-hidden />
            ) : (
              <span
                style={{
                  color:
                    ts.status === 'complete' ? 'var(--color-secondary)' : 'var(--color-error)',
                }}
              >
                {toolStatusIcon(ts.status)}
              </span>
            )}
          </div>
        ))}

        {isGenerating && toolStatuses.length === 0 ? (
          <div
            className="flex items-center gap-2"
            style={{ fontSize: '11px', color: 'var(--color-outline)' }}
          >
            <Loader2 size={12} className="animate-spin" aria-hidden />
            <span>Thinking...</span>
          </div>
        ) : null}

        {genError ? (
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor: 'var(--color-error-container)',
              color: 'var(--color-on-error-container)',
            }}
          >
            {genError}
          </div>
        ) : null}

        {dashboardSpec ? (
          <div data-testid="dashboard-spec-preview">
            <DashboardSpecPreview spec={dashboardSpec} />
          </div>
        ) : null}
      </div>

      <div
        className="flex shrink-0 items-end gap-2 px-3 py-2.5"
        style={{ borderTop: `1px solid ${borderColor}` }}
      >
        <textarea
          ref={inputRef}
          data-testid={inputTestId}
          rows={1}
          className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            borderColor,
            fontFamily: 'var(--font-body)',
          }}
          placeholder={placeholder}
          disabled={isGenerating}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          type="button"
          data-testid={sendTestId}
          className="shrink-0 cursor-pointer rounded-lg border-none px-2.5 py-2"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#0B0D0F',
          }}
          disabled={isGenerating || !input.trim()}
          onClick={handleSubmit}
        >
          <Send size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}
