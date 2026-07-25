import { ArrowLeft, Loader2, Send, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DashboardSpecPreview } from '@/components/DashboardSpecPreview'
import { useAIProvider } from '@/hooks/useAIProvider'
import { useDashboardGeneration } from '@/hooks/useDashboardGeneration'
import { useOrganization } from '@/hooks/useOrganization'
import { getToolsForDatasourceType } from '@/lib/copilotTools'
import type { DashboardSpec } from '@/utils/dashboardSpec'
import { initMarkdown, renderMarkdown } from '@/utils/markdown'

type CmdKChatViewProps = {
  initialQuery: string
  datasourceType: string
  datasourceName: string
  datasourceId: string
  onExitChat: () => void
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

export function CmdKChatView({
  initialQuery,
  datasourceType,
  datasourceName,
  datasourceId,
  onExitChat,
}: CmdKChatViewProps) {
  const {
    chatMessages,
    models,
    selectedModel,
    selectedProviderId,
    fetchModels,
    providers,
    setSelectedModel,
    appendChatMessage,
  } = useAIProvider()

  const { currentOrg } = useOrganization()
  const lastUsedDatasourceType = useRef('')

  const { generate, toolStatuses, isGenerating, error: genError, cancel } = useDashboardGeneration(
    () => datasourceId,
    () => currentOrg?.id ?? '',
    () => datasourceType || lastUsedDatasourceType.current,
  )

  const [followUp, setFollowUp] = useState('')
  const [dashboardSpec, setDashboardSpec] = useState<DashboardSpec | null>(null)
  const [renderedHtml, setRenderedHtml] = useState<Record<number, string>>({})
  const messagesContainer = useRef<HTMLDivElement | null>(null)
  const startedRef = useRef(false)

  function buildChatRequestMessages() {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []

    if (datasourceId) {
      messages.push({
        role: 'system',
        content: `You have tools to explore datasource data. You are currently working with datasource '${datasourceName}' (type: ${datasourceType}, id: ${datasourceId}). You can use the data discovery tools directly.`,
      })
    } else {
      messages.push({
        role: 'system',
        content:
          'You have tools to explore datasource data. No datasource is currently selected. Call list_datasources first to discover available datasources, then pass the datasource_id to other tools.',
      })
    }

    for (const m of chatMessages) {
      messages.push({ role: m.role, content: m.content })
    }
    return messages
  }

  async function handleSend(userMessage: string) {
    appendChatMessage({ role: 'user', content: userMessage })
    // Build request from previous messages + the new user message
    const prior = chatMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    const requestMessages = [
      ...buildChatRequestMessages().filter(m => m.role === 'system'),
      ...prior,
      { role: 'user' as const, content: userMessage },
    ]
    const tools = getToolsForDatasourceType(datasourceType)
    setDashboardSpec(null)

    const result = await generate(requestMessages, tools, datasourceName, {
      onContent(text) {
        appendChatMessage({ role: 'assistant', content: text })
      },
      onDashboardSpec(spec) {
        setDashboardSpec(spec)
        appendChatMessage({
          role: 'assistant',
          content: 'Dashboard generated. See the preview below.',
          dashboardSpec: spec,
        })
      },
    })

    if (result.spec && !dashboardSpec) {
      setDashboardSpec(result.spec)
    }
  }

  function handleFollowUp() {
    const msg = followUp.trim()
    if (!msg || isGenerating) return
    setFollowUp('')
    void handleSend(msg)
  }

  useEffect(() => {
    return () => {
      cancel()
    }
  }, [cancel])

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-render new assistant messages; avoid looping on renderedHtml
  useEffect(() => {
    let cancelled = false
    async function renderMessages() {
      const next: Record<number, string> = { ...renderedHtml }
      let changed = false
      for (let i = 0; i < chatMessages.length; i += 1) {
        const msg = chatMessages[i]!
        if (msg.role === 'assistant' && !(i in next)) {
          next[i] = await renderMarkdown(msg.content)
          changed = true
        }
      }
      if (!cancelled && changed) setRenderedHtml(next)
    }
    void renderMessages()
    return () => {
      cancelled = true
    }
  }, [chatMessages])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when message list or generation state changes
  useEffect(() => {
    if (messagesContainer.current) {
      messagesContainer.current.scrollTop = messagesContainer.current.scrollHeight
    }
  }, [chatMessages, toolStatuses, isGenerating])

  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on mount with initial query
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void (async () => {
      await initMarkdown()
      await fetchModels(selectedProviderId || undefined)
      await handleSend(initialQuery)
    })()
  }, [])

  return (
    <div className="flex flex-col" style={{ height: '460px' }}>
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <button
          type="button"
          data-testid="chat-back-btn"
          className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-sm"
          style={{ color: 'var(--color-on-surface-variant)' }}
          onClick={onExitChat}
        >
          <ArrowLeft size={16} aria-hidden />
          Back to search
        </button>

        {models.length > 0 ? (
          <select
            data-testid="model-selector"
            className="rounded border px-2 py-1 text-xs"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              borderColor: 'var(--color-outline-variant)',
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
        ) : null}
      </div>

      <div ref={messagesContainer} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {chatMessages.map((msg, index) =>
          msg.role === 'user' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: chat messages have no stable id
            <div key={`user-${index}`} className="flex justify-end">
              <div
                className="max-w-[80%] rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--color-primary-container)',
                  color: 'var(--color-on-primary-container)',
                }}
              >
                {msg.content}
              </div>
            </div>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: chat messages have no stable id
            <div key={`assistant-${index}`} className="flex justify-start">
              <div
                className="prose prose-sm prose-invert max-w-[80%] rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                }}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown is sanitized via DOMPurify
                dangerouslySetInnerHTML={{ __html: renderedHtml[index] || msg.content }}
              />
            </div>
          ),
        )}

        {toolStatuses.map((ts, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: tool status entries can repeat names
            key={`tool-${i}-${ts.name}`}
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <Wrench size={12} aria-hidden />
            <span>{ts.name}</span>
            {ts.status === 'running' ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
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
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
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
        className="flex items-end gap-2 border-t px-4 py-3"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <textarea
          data-testid="chat-input"
          rows={1}
          className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            borderColor: 'var(--color-outline-variant)',
          }}
          placeholder="Ask a follow-up..."
          disabled={isGenerating}
          value={followUp}
          onChange={e => setFollowUp(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleFollowUp()
            }
          }}
        />
        <button
          type="button"
          data-testid="chat-send-btn"
          className="cursor-pointer rounded-lg border-none px-3 py-2"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-on-primary, #0B0D0F)',
          }}
          disabled={isGenerating || !followUp.trim()}
          onClick={handleFollowUp}
        >
          <Send size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}
