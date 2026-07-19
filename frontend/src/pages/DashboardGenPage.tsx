import { AlertCircle, ArrowRight, Check, Loader2, RotateCcw, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listDataSources } from '@/api/datasources'
import { DashboardSpecPreview } from '@/components/DashboardSpecPreview'
import { ShimmerLoader } from '@/components/ShimmerLoader'
import { useAIProvider } from '@/hooks/useAIProvider'
import { useDashboardGeneration } from '@/hooks/useDashboardGeneration'
import { useOrganization } from '@/hooks/useOrganization'
import { getToolsForDatasourceType } from '@/lib/copilotTools'
import type { DataSource } from '@/types/datasource'
import type { DashboardSpec } from '@/utils/dashboardSpec'

type Step = 'describe' | 'generate' | 'review' | 'create'

const SUGGESTIONS = [
  'API latency',
  'K8s cluster health',
  'Error rates',
  'Database performance',
  'Memory usage',
  'Request throughput',
]

function toolStatusLabel(name: string): string {
  switch (name) {
    case 'get_metrics':
      return 'Discovering metrics'
    case 'get_labels':
      return 'Fetching labels'
    case 'get_label_values':
      return 'Fetching label values'
    case 'list_datasources':
      return 'Listing datasources'
    case 'get_trace_services':
      return 'Discovering services'
    default:
      return name
  }
}

export function DashboardGenPage() {
  const navigate = useNavigate()
  const { currentOrg } = useOrganization()
  const { fetchProviders, fetchModels, providers, selectedProviderId } = useAIProvider()

  const [currentStep, setCurrentStep] = useState<Step>('describe')
  const [prompt, setPrompt] = useState('')
  const [generatedSpec, setGeneratedSpec] = useState<DashboardSpec | null>(null)
  const [datasources, setDatasources] = useState<DataSource[]>([])
  const [selectedDatasourceId, setSelectedDatasourceId] = useState('')
  const [loadingDatasources, setLoadingDatasources] = useState(false)

  const selectedDatasource = useMemo(
    () => datasources.find((ds) => ds.id === selectedDatasourceId),
    [datasources, selectedDatasourceId],
  )

  const {
    generate,
    toolStatuses,
    isGenerating,
    error: genError,
    progressText,
    cancel,
  } = useDashboardGeneration(
    () => selectedDatasourceId,
    () => currentOrg?.id ?? '',
    () => selectedDatasource?.type ?? '',
  )

  const canGenerate = Boolean(
    prompt.trim() && selectedDatasourceId && providers.length > 0 && !isGenerating,
  )

  useEffect(() => {
    const orgId = currentOrg?.id
    if (!orgId) return
    const organizationId = orgId

    let cancelled = false

    async function load() {
      setLoadingDatasources(true)
      try {
        const [dsList] = await Promise.all([
          listDataSources(organizationId).catch(() => [] as DataSource[]),
          fetchProviders(),
          fetchModels(selectedProviderId || undefined),
        ])
        if (cancelled) return

        setDatasources(dsList)

        if (dsList.length === 1) {
          setSelectedDatasourceId(dsList[0]!.id)
        } else if (dsList.length > 1) {
          const saved = localStorage.getItem(`ace:lastDatasource:${organizationId}`)
          if (saved && dsList.find((ds) => ds.id === saved)) {
            setSelectedDatasourceId(saved)
          } else {
            const metricsDs = dsList.find((ds) =>
              ['victoriametrics', 'prometheus'].includes(ds.type),
            )
            setSelectedDatasourceId(metricsDs?.id ?? dsList[0]!.id)
          }
        }
      } finally {
        if (!cancelled) setLoadingDatasources(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      cancel()
    }
  }, [cancel, currentOrg?.id, fetchModels, fetchProviders, selectedProviderId])

  async function startGeneration() {
    if (!canGenerate) return

    setCurrentStep('generate')
    setGeneratedSpec(null)

    const ds = selectedDatasource
    const dsType = ds?.type ?? ''
    const dsName = ds?.name ?? ''

    if (currentOrg?.id) {
      localStorage.setItem(`ace:lastDatasource:${currentOrg.id}`, selectedDatasourceId)
    }

    const messages = [
      {
        role: 'system' as const,
        content: `Generate a monitoring dashboard. Datasource: '${dsName}' (${dsType}, id: ${selectedDatasourceId}). Discover metrics first, then call generate_dashboard.`,
      },
      {
        role: 'user' as const,
        content: `Create a dashboard for: ${prompt.trim()}`,
      },
    ]

    const tools = getToolsForDatasourceType(dsType)
    const result = await generate(messages, tools, dsName)

    if (result.spec) {
      setGeneratedSpec(result.spec)
      setCurrentStep('review')
    }
  }

  function handleSpecSaved(dashboardId: string) {
    setCurrentStep('create')
    window.setTimeout(() => {
      navigate(`/app/dashboards/${dashboardId}`)
    }, 1500)
  }

  function tryAgain() {
    cancel()
    setCurrentStep('describe')
    setGeneratedSpec(null)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {currentStep === 'describe' && (
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }}
          >
            <Sparkles size={32} className="text-white" />
          </div>

          <h1
            className="mb-3 font-display text-2xl font-bold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            What do you want to monitor?
          </h1>
          <p className="mb-8 max-w-md text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            {selectedDatasource
              ? `Describe what you'd like to observe on ${selectedDatasource.name}`
              : "Describe what you'd like to observe and we'll generate a dashboard with relevant panels and queries."}
          </p>

          {loadingDatasources ? (
            <div className="mb-4 w-full">
              <ShimmerLoader height="36px" />
            </div>
          ) : datasources.length === 0 ? (
            <div className="mb-4 w-full">
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface-variant)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              >
                No datasources configured.{' '}
                <Link
                  to="/app/settings"
                  className="underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Add one in Settings
                </Link>
              </div>
            </div>
          ) : datasources.length > 1 ? (
            <select
              value={selectedDatasourceId}
              data-testid="gen-datasource-select"
              aria-label="Select datasource"
              className="mb-4 w-full rounded-lg px-4 text-sm focus:outline-none focus:ring-2"
              style={{
                height: '36px',
                backgroundColor: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              onChange={(event) => setSelectedDatasourceId(event.target.value)}
            >
              {datasources.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.type})
                </option>
              ))}
            </select>
          ) : null}

          {!loadingDatasources && providers.length === 0 && (
            <div
              className="mb-4 w-full rounded-lg px-4 py-3 text-sm"
              data-testid="gen-no-provider-warning"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline-variant)',
              }}
            >
              No AI provider configured.{' '}
              <Link
                to="/app/settings"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                Set one up in Settings
              </Link>
            </div>
          )}

          <input
            data-testid="gen-describe-input"
            type="text"
            value={prompt}
            placeholder="e.g., Monitor HTTP API performance and error rates..."
            className="mb-4 w-full rounded-lg px-4 text-sm focus:outline-none focus:ring-2"
            style={{
              height: '36px',
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void startGeneration()
              }
            }}
          />

          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                data-testid="gen-suggestion-chip"
                className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface-variant)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                onClick={() => setPrompt(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="gen-generate-btn"
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }}
            disabled={!canGenerate}
            aria-disabled={!canGenerate}
            onClick={() => void startGeneration()}
          >
            <Sparkles size={16} />
            Generate Dashboard
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {currentStep === 'generate' && (
        <div className="flex flex-col items-center py-16 text-center">
          <div
            className="mb-6 flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }}
          >
            <Sparkles size={32} className="text-white" />
          </div>

          <h2
            className="mb-4 font-display text-xl font-bold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {selectedDatasource
              ? `Analyzing ${selectedDatasource.name} and building panels...`
              : 'Generating your dashboard...'}
          </h2>
          <p className="mb-6 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            &quot;{prompt}&quot;
          </p>

          {toolStatuses.length > 0 ? (
            <div
              aria-live="polite"
              role="status"
              className="mb-4 flex w-full max-w-sm flex-col gap-2"
            >
              {toolStatuses.map((ts) => (
                <div
                  key={`${ts.name}-${ts.status}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {ts.status === 'running' ? (
                    <Loader2 size={12} className="shrink-0 animate-spin" />
                  ) : ts.status === 'complete' ? (
                    <Check
                      size={12}
                      className="shrink-0"
                      style={{ color: 'var(--color-secondary)' }}
                    />
                  ) : (
                    <Wrench
                      size={12}
                      className="shrink-0"
                      style={{ color: 'var(--color-error)' }}
                    />
                  )}
                  <span>{toolStatusLabel(ts.name)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex w-full max-w-sm flex-col gap-3">
              <ShimmerLoader height="2rem" />
              <ShimmerLoader height="2rem" width="80%" />
              <ShimmerLoader height="2rem" width="60%" />
            </div>
          )}

          {progressText && (
            <p
              className="mt-4 max-w-sm text-sm"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {progressText}
            </p>
          )}

          {genError && (
            <div className="mt-6 flex flex-col items-center">
              <AlertCircle size={32} style={{ color: 'var(--color-error)' }} />
              <p className="mb-4 mt-3 text-sm" style={{ color: 'var(--color-error)' }}>
                {genError}
              </p>
              <button
                type="button"
                data-testid="gen-try-again-btn"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
                style={{
                  color: 'var(--color-on-surface-variant)',
                  border: '1px solid var(--color-outline-variant)',
                  backgroundColor: 'transparent',
                }}
                onClick={tryAgain}
              >
                <RotateCcw size={14} />
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {currentStep === 'review' && (
        <div className="flex flex-col items-center">
          <h2
            className="mb-2 text-center font-display text-xl font-bold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Review your dashboard
          </h2>
          <p
            className="mb-6 text-center text-sm"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            We generated a dashboard based on your description. Review and save it.
          </p>

          <div className="w-full">
            {generatedSpec && (
              <DashboardSpecPreview spec={generatedSpec} onSaved={handleSpecSaved} />
            )}
          </div>

          <button
            type="button"
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
            style={{
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
              backgroundColor: 'transparent',
            }}
            onClick={tryAgain}
          >
            <RotateCcw size={14} />
            Start over
          </button>
        </div>
      )}

      {currentStep === 'create' && (
        <div className="flex flex-col items-center py-16 text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--color-secondary)' }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Success"
            >
              <title>Success</title>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2
            className="mb-2 font-display text-xl font-bold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Dashboard created!
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Redirecting you to your new dashboard...
          </p>
        </div>
      )}
    </div>
  )
}
