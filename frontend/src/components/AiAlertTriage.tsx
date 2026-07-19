import { Sparkles } from 'lucide-react'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'

type AiAlertTriageProps = {
  alertCount: number
  alertNames?: string[]
  className?: string
}

export function AiAlertTriage({ alertCount, alertNames, className }: AiAlertTriageProps) {
  const open = useAiSidebarStore(state => state.open)

  function handleInvestigate() {
    const names = alertNames?.join(', ') || `${alertCount} alerts`
    open({
      message: `Investigate the currently firing alerts: ${names}. Analyze root causes, correlate with recent deployments or changes, assess severity, and suggest remediation steps.`,
    })
  }

  return (
    <div
      data-testid="ai-alert-triage"
      className={`overflow-hidden rounded-lg ${className ?? ''}`}
      style={{
        borderLeft: '2px solid var(--color-primary)',
        backgroundColor: 'var(--color-primary-muted)',
      }}
    >
      <div className="px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Sparkles size={12} style={{ color: 'var(--color-primary)' }} aria-hidden />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-primary)',
            }}
          >
            AI Triage
          </span>
        </div>

        <p className="mb-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          {alertCount} alert{alertCount !== 1 ? 's' : ''} firing. Open Copilot for root cause
          analysis, impact assessment, and suggested remediation.
        </p>

        <button
          type="button"
          className="cursor-pointer rounded border-none px-2.5 py-1 text-xs font-medium"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#0B0D0F',
          }}
          onClick={handleInvestigate}
        >
          Investigate with Copilot
        </button>
      </div>
    </div>
  )
}
