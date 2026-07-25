import { ChevronRight, Loader2, Send, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DashboardSpecPreview } from '@/components/DashboardSpecPreview'
import { useAIProvider } from '@/hooks/useAIProvider'
import { useCommandContext } from '@/hooks/useCommandContext'
import { useDashboardGeneration } from '@/hooks/useDashboardGeneration'
import { useOrganization } from '@/hooks/useOrganization'
import { getToolsForDatasourceType } from '@/lib/copilotTools'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'
import type { DashboardSpec } from '@/utils/dashboardSpec'
import { initMarkdown, renderMarkdown } from '@/utils/markdown'

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

export function AiSidebar() {
  const isOpen = useAiSidebarStore(state => state.isOpen)
  const close = useAiSidebarStore(state => state.close)
  const consumePendingContext = useAiSidebarStore(state => state.consumePendingContext)

  const { currentContext } = useCommandContext()
  const { currentOrg } = useOrganization()

  const {
    chatMessages,
    models,
    selectedModel,
    selectedProviderId,
    fetchModels,
    fetchProviders,
    providers,
    setSelectedModel,
    appendChatMessage,
  } = useAIProvider()

  const { generate, toolStatuses, isGenerating, error: genError, cancel } = useDashboardGeneration(
    () => currentContext?.datasourceId ?? '',
    () => currentOrg?.id ?? '',
    () => currentContext?.datasourceType ?? '',
  )

  const [input, setInput] = useState('')
  const [dashboardSpec, setDashboardSpec] = useState<DashboardSpec | null>(null)
  const [renderedHtml, setRenderedHtml] = useState<Record<number, string>>({})
  const [markdownReady, setMarkdownReady] = useState(false)
  const messagesContainer = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingHandledRef = useRef(false)

  function buildSystemMessage(): string {
    const ctx = currentContext
    if (ctx?.datasourceId) {
      return `You have tools to explore datasource data. You are currently working with datasource '${ctx.datasourceName}' (type: ${ctx.datasourceType}, id: ${ctx.datasourceId}). You can use the data discovery tools directly.`
    }
    return 'You have tools to explore datasource data. No datasource is currently selected. Call list_datasources first to discover available datasources, then pass the datasource_id to other tools.'
  }

  async function handleSend(userMessage: string) {
    appendChatMessage({ role: 'user', content: userMessage })

    const requestMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: buildSystemMessage() },
      ...chatMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const dsType = currentContext?.datasourceType ?? ''
    const dsName = currentContext?.datasourceName ?? ''
    const tools = getToolsForDatasourceType(dsType)

    if (dashboardSpec) {
      requestMessages.push({
        role: 'system',
        content: `Current dashboard spec to refine:\n${JSON.stringify(dashboardSpec, null, 2)}\nModify and call generate_dashboard with the full updated spec.`,
      })
    }

    const isRefinement = Boolean(dashboardSpec)

    const result = await generate(requestMessages, tools, dsName, {
      onContent(text) {
        appendChatMessage({ role: 'assistant', content: text })
      },
      onDashboardSpec(spec) {
        setDashboardSpec(spec)
        appendChatMessage({
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
    }
  }

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-render new assistant messages; avoid looping on renderedHtml
  useEffect(() => {
    if (!markdownReady) return
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
  }, [chatMessages, markdownReady])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when message list or generation state changes
  useEffect(() => {
    if (messagesContainer.current) {
      messagesContainer.current.scrollTop = messagesContainer.current.scrollHeight
    }
  }, [chatMessages, toolStatuses, isGenerating, dashboardSpec])

  // biome-ignore lint/correctness/useExhaustiveDependencies: open once per sidebar open; pending context consumed once
  useEffect(() => {
    if (!isOpen) {
      pendingHandledRef.current = false
      return
    }

    void (async () => {
      await fetchProviders()
      await fetchModels(selectedProviderId || undefined)
      inputRef.current?.focus()

      if (!pendingHandledRef.current) {
        const pending = consumePendingContext()
        pendingHandledRef.current = true
        if (pending) {
          void handleSend(pending.message)
        }
      }
    })()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <aside
      data-testid="ai-sidebar"
      className="fixed top-0 right-0 bottom-0 z-40 flex flex-col"
      style={{
        width: '340px',
        backgroundColor: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-stroke-subtle)',
      }}
    >
      <div
        className="flex shrink-0 items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--color-stroke-subtle)' }}
      >
        <div
          className="flex shrink-0 items-center justify-center"
          style={{
            width: '26px',
            height: '26px',
            background: 'var(--color-primary-muted)',
            borderRadius: '6px',
            color: 'var(--color-primary)',
          }}
        >
          <Sparkles size={14} aria-hidden />
        </div>
        <span
          className="flex-1 text-sm font-semibold"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-on-surface)' }}
        >
          Copilot
        </span>

        {models.length > 0 ? (
          <select
            data-testid="ai-sidebar-model"
            className="rounded border px-1.5 py-0.5"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-outline)',
              borderColor: 'var(--color-stroke-subtle)',
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

        <button
          type="button"
          data-testid="ai-sidebar-close"
          className="flex shrink-0 cursor-pointer items-center justify-center border-none bg-transparent"
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            color: 'var(--color-outline)',
          }}
          title="Close (Esc)"
          onClick={close}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      {currentContext ? (
        <div
          className="flex shrink-0 items-center gap-2 px-3 py-1.5"
          style={{ borderBottom: '1px solid var(--color-stroke-faint, rgba(255,255,255,0.04))' }}
        >
          <div
            className="flex items-center gap-1.5 rounded px-2 py-0.5"
            style={{
              fontSize: '11px',
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-outline)',
            }}
          >
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-secondary)',
                display: 'inline-block',
              }}
            />
            {currentContext.viewName}
          </div>
          {currentContext.datasourceName ? (
            <div
              className="rounded px-2 py-0.5"
              style={{
                fontSize: '11px',
                backgroundColor: 'var(--color-primary-muted)',
                color: 'var(--color-primary)',
              }}
            >
              {currentContext.datasourceName}
            </div>
          ) : null}
        </div>
      ) : null}

      {providers.length === 0 && !isGenerating ? (
        <div className="px-4 py-6 text-center">
          <Sparkles
            size={24}
            style={{
              color: 'var(--color-outline)',
              margin: '0 auto 8px',
              display: 'block',
              opacity: 0.4,
            }}
            aria-hidden
          />
          <p className="mb-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            No AI provider configured
          </p>
          <p className="text-xs" style={{ color: 'var(--color-outline)' }}>
            Set one up in Settings → AI Configuration
          </p>
        </div>
      ) : (
        <div ref={messagesContainer} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {chatMessages.length === 0 && !isGenerating ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <Sparkles size={20} style={{ color: 'var(--color-primary)', opacity: 0.5 }} aria-hidden />
              <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                Ask about your metrics, logs, or traces
              </p>
              <p className="text-xs" style={{ color: 'var(--color-outline)' }}>
                I can query datasources, analyze anomalies, and generate dashboards.
              </p>
            </div>
          ) : null}

          {chatMessages.map((msg, index) =>
            msg.role === 'user' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: chat messages have no stable id
              <div key={`user-${index}`} className="flex justify-end">
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{
                    maxWidth: '90%',
                    backgroundColor: 'var(--color-primary-muted)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid rgba(201, 150, 15, 0.2)',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: chat messages have no stable id
              <div key={`assistant-${index}`} className="flex justify-start">
                <div
                  className="prose prose-sm prose-invert rounded-lg px-3 py-2 text-sm"
                  style={{
                    maxWidth: '90%',
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface-variant)',
                    border: '1px solid var(--color-stroke-subtle)',
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

          {dashboardSpec ? <DashboardSpecPreview spec={dashboardSpec} /> : null}
        </div>
      )}

      {providers.length > 0 ? (
        <div
          className="flex shrink-0 items-end gap-2 px-3 py-2.5"
          style={{ borderTop: '1px solid var(--color-stroke-subtle)' }}
        >
          <textarea
            ref={inputRef}
            data-testid="ai-sidebar-input"
            rows={1}
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              borderColor: 'var(--color-stroke-subtle)',
              fontFamily: 'var(--font-body)',
            }}
            placeholder="Ask about your data..."
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
            data-testid="ai-sidebar-send"
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
      ) : null}
    </aside>
  )
}
