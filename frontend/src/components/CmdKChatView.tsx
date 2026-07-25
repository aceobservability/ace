import { ArrowLeft } from 'lucide-react'
import { CopilotChatSession } from '@/components/copilot/CopilotChatSession'
import { useAIProvider } from '@/hooks/useAIProvider'

type CmdKChatViewProps = {
  initialQuery: string
  datasourceType: string
  datasourceName: string
  datasourceId: string
  onExitChat: () => void
}

export function CmdKChatView({
  initialQuery,
  datasourceType,
  datasourceName,
  datasourceId,
  onExitChat,
}: CmdKChatViewProps) {
  const { models, selectedModel, providers, setSelectedModel } = useAIProvider()

  const context =
    datasourceId || datasourceType || datasourceName
      ? {
          datasourceId: datasourceId || undefined,
          datasourceType: datasourceType || undefined,
          datasourceName: datasourceName || undefined,
        }
      : null

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

      <CopilotChatSession
        key={initialQuery}
        variant="modal"
        context={context}
        initialPrompt={initialQuery}
        showModelPicker={false}
        inputTestId="chat-input"
        sendTestId="chat-send-btn"
        className="min-h-0 flex-1"
      />
    </div>
  )
}
