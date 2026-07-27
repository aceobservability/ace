import { ChevronRight, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CopilotChatSession } from '@/components/copilot/CopilotChatSession'
import { useCommandContextStore } from '@/stores/commandContextStore'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'

export function AiSidebar() {
  const isOpen = useAiSidebarStore(state => state.isOpen)
  const close = useAiSidebarStore(state => state.close)
  const consumePendingContext = useAiSidebarStore(state => state.consumePendingContext)
  const currentContext = useCommandContextStore(state => state.currentContext)

  const [sessionKey, setSessionKey] = useState(0)
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>()
  const pendingHandledRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      pendingHandledRef.current = false
      setInitialPrompt(undefined)
      return
    }

    if (!pendingHandledRef.current) {
      const pending = consumePendingContext()
      pendingHandledRef.current = true
      setInitialPrompt(pending?.message)
      setSessionKey(key => key + 1)
    }
  }, [isOpen, consumePendingContext])

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

      <CopilotChatSession
        key={sessionKey}
        variant="sidebar"
        context={currentContext}
        initialPrompt={initialPrompt}
        allowSpecRefinement
        inputTestId="ai-sidebar-input"
        sendTestId="ai-sidebar-send"
        modelSelectTestId="ai-sidebar-model"
        placeholder="Ask about your data..."
        className="min-h-0 flex-1"
      />
    </aside>
  )
}
