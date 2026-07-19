import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  ExternalLink,
  Github,
  Loader2,
  Unplug,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCopilotAuth } from '@/hooks/useCopilotAuth'

type CopilotConnectionPanelProps = {
  orgId: string
}

export function CopilotConnectionPanel({ orgId }: CopilotConnectionPanelProps) {
  const {
    isConnected,
    githubUsername,
    hasCopilot,
    error,
    deviceFlowActive,
    userCode,
    verificationUri,
    checkConnection,
    connect,
    cancelDeviceFlow,
    disconnect,
  } = useCopilotAuth()

  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    void checkConnection()
  }, [checkConnection])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(userCode)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      // fallback ignored
    }
  }

  function openGitHub() {
    window.open(verificationUri, '_blank')
  }

  return (
    <section
      className="rounded p-6"
      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      data-testid="copilot-connection-panel"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="m-0 flex items-center gap-2 text-base font-semibold"
          style={{ color: 'var(--color-on-surface)' }}
        >
          <Github size={20} />
          GitHub Copilot
        </h2>
      </div>

      {error ? (
        <div
          className="mb-4 flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--color-error)',
          }}
        >
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      ) : null}

      {deviceFlowActive ? (
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
              Your device code
            </h3>
            <p className="m-0 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              Copy the code below, then open GitHub to authorize.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              data-testid="copilot-user-code"
              className="rounded px-4 py-2 font-mono text-2xl font-bold tracking-widest"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                color: 'var(--color-on-surface)',
              }}
            >
              {userCode}
            </div>
            <button
              type="button"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-sm transition"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                color: 'var(--color-on-surface-variant)',
              }}
              title="Copy code"
              onClick={() => void copyCode()}
            >
              {codeCopied ? (
                <Check size={14} style={{ color: 'var(--color-secondary)' }} />
              ) : (
                <ClipboardCopy size={14} />
              )}
            </button>
          </div>

          <button
            type="button"
            data-testid="copilot-open-github-btn"
            className="inline-flex cursor-pointer items-center gap-2 rounded-sm border-none px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: 'var(--color-primary)' }}
            onClick={openGitHub}
          >
            <ExternalLink size={14} />
            Open GitHub
          </button>

          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <Loader2 size={12} className="animate-spin" />
            Waiting for authorization...
          </div>

          <button
            type="button"
            data-testid="copilot-cancel-btn"
            className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-xs transition"
            style={{ color: 'var(--color-outline)' }}
            onClick={cancelDeviceFlow}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {!deviceFlowActive && !isConnected ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p
            className="m-0 max-w-md text-sm"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Connect your GitHub account to use AI-assisted query writing powered by your Copilot
            subscription.
          </p>
          <button
            type="button"
            data-testid="copilot-connect-btn"
            className="inline-flex cursor-pointer items-center gap-2 rounded-sm border-none px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: 'var(--color-primary)' }}
            onClick={() => void connect(orgId)}
          >
            <Github size={14} />
            Connect GitHub Copilot
          </button>
        </div>
      ) : null}

      {!deviceFlowActive && isConnected && hasCopilot ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Github size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                {githubUsername}
              </span>
              <span
                data-testid="copilot-active-badge"
                className="inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: 'rgba(229, 160, 13, 0.1)',
                  border: '1px solid rgba(229, 160, 13, 0.2)',
                  color: 'var(--color-primary)',
                }}
              >
                Copilot Active
              </span>
            </div>
            <button
              type="button"
              data-testid="copilot-disconnect-btn"
              className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-xs transition"
              style={{ color: 'var(--color-outline)' }}
              onClick={() => void disconnect()}
            >
              <Unplug size={12} />
              Disconnect
            </button>
          </div>
        </div>
      ) : null}

      {!deviceFlowActive && isConnected && !hasCopilot ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Github size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                {githubUsername}
              </span>
            </div>
            <button
              type="button"
              data-testid="copilot-disconnect-btn"
              className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-xs transition"
              style={{ color: 'var(--color-outline)' }}
              onClick={() => void disconnect()}
            >
              <Unplug size={12} />
              Disconnect
            </button>
          </div>
          <div
            className="flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm"
            style={{
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              border: '1px solid rgba(249, 115, 22, 0.2)',
              color: 'var(--color-tertiary)',
            }}
          >
            <AlertTriangle size={14} />
            <span>No active Copilot subscription detected.</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
