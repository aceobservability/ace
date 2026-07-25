import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CmdKChatView } from '@/components/CmdKChatView'
import { CmdKSearchResults } from '@/components/CmdKSearchResults'
import { useAIProvider } from '@/hooks/useAIProvider'
import { useCommandContext } from '@/hooks/useCommandContext'

type CmdKModalProps = {
  isOpen: boolean
  onClose: () => void
}

export function CmdKModal({ isOpen, onClose }: CmdKModalProps) {
  const { currentContext } = useCommandContext()
  const { providers, fetchProviders, clearChatMessages } = useAIProvider()
  const navigate = useNavigate()

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'search' | 'chat'>('search')
  const [chatQuery, setChatQuery] = useState('')
  const [showNotConnected, setShowNotConnected] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setMode('search')
      setShowNotConnected(false)
      setQuery('')
      setChatQuery('')
      return
    }

    void fetchProviders()
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [fetchProviders, isOpen])

  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleEnterChat(q: string) {
    if (providers.length === 0) {
      setShowNotConnected(true)
      return
    }
    setChatQuery(q)
    clearChatMessages()
    setMode('chat')
    setShowNotConnected(false)
  }

  function handleExitChat() {
    setMode('search')
    setShowNotConnected(false)
  }

  function handleNavigate(path: string) {
    onClose()
    void navigate(path)
  }

  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss */}
      <div
        data-testid="cmdk-scrim"
        className="fixed inset-0 z-50"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Command"
        className="fixed top-1/4 left-1/2 z-50 w-full -translate-x-1/2 overflow-hidden rounded-xl shadow-2xl"
        style={{
          maxWidth: '640px',
          backgroundColor:
            'color-mix(in srgb, var(--color-surface-container-highest) 80%, transparent)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--color-outline-variant)',
          borderTop: '2px solid var(--color-primary)',
        }}
      >
        <div className="flex items-center gap-3 p-4">
          {currentContext ? (
            <div
              data-testid="context-pill"
              className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {currentContext.viewName}
            </div>
          ) : null}

          <input
            ref={inputRef}
            type="text"
            className="flex-1 border-none bg-transparent outline-none"
            style={{
              fontSize: '16px',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
            }}
            placeholder="Ask AI or search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter' && query.trim()) {
                handleEnterChat(query.trim())
              }
            }}
          />
        </div>

        {showNotConnected ? (
          <div data-testid="not-connected-message" className="px-4 pb-3">
            <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Configure an AI provider in{' '}
              <Link
                to="/app/settings/ai"
                style={{ color: 'var(--color-primary)' }}
                onClick={onClose}
              >
                Settings
              </Link>
              , or connect GitHub Copilot.
            </p>
          </div>
        ) : null}

        {mode === 'search' && !showNotConnected ? (
          <CmdKSearchResults
            query={query}
            onNavigate={handleNavigate}
            onEnterChat={handleEnterChat}
          />
        ) : null}

        {mode === 'chat' ? (
          <CmdKChatView
            initialQuery={chatQuery}
            datasourceType={currentContext?.datasourceType ?? ''}
            datasourceName={currentContext?.datasourceName ?? ''}
            datasourceId={currentContext?.datasourceId ?? ''}
            onExitChat={handleExitChat}
          />
        ) : null}
      </div>
    </div>
  )
}
