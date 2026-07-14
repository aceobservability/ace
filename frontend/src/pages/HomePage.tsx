import { Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AiInsightCard } from '@/components/AiInsightCard'
import { EmptyState } from '@/components/EmptyState'
import { OnboardingBanner } from '@/components/OnboardingBanner'
import { isSetupWizardDismissed, SetupWizard } from '@/components/SetupWizard'
import { StatusDot } from '@/components/StatusDot'
import { useDatasources } from '@/hooks/useDatasources'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import {
  dataSourceTypeLabels,
  isAlertingType,
  isLogsType,
  isMetricsType,
  isTracingType,
  type DataSource,
} from '@/types/datasource'

const sampleAiInsights = [
  {
    title: 'Sample: anomaly triage',
    description:
      'Example only: Ace can summarize CPU spikes once telemetry queries and an AI provider are connected.',
    timestamp: 'Example only',
    type: 'anomaly' as const,
  },
  {
    title: 'Sample: optimization suggestion',
    description:
      'Example only: recommendations are generated from real query results; no live insight is shown here.',
    timestamp: 'Example only',
    type: 'optimization' as const,
  },
  {
    title: 'Sample: capacity forecast',
    description:
      'Example only: forecasts require historical metrics from your configured datasources.',
    timestamp: 'Example only',
    type: 'forecast' as const,
  },
]

const quickLinks = [
  { label: 'Dashboards', route: '/app/dashboards' },
  { label: 'Explore', route: '/app/explore/metrics' },
  { label: 'Alerts', route: '/app/alerts' },
  { label: 'Settings', route: '/app/settings' },
] as const

function signalLabelForDataSource(source: DataSource): string {
  const signals: string[] = []
  if (isMetricsType(source.type)) signals.push('Metrics')
  if (isLogsType(source.type)) signals.push('Logs')
  if (isTracingType(source.type)) signals.push('Traces')
  if (isAlertingType(source.type)) signals.push('Alerts')
  return signals.length > 0 ? signals.join(' + ') : 'Configuration only'
}

export function HomePage() {
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const { data: datasources = [] } = useDatasources(currentOrgId)
  const favorites = useFavoritesStore(state => state.favorites)
  const recentDashboards = useFavoritesStore(state => state.recentDashboards)

  const [wizardDismissedByUser, setWizardDismissedByUser] = useState(false)

  const hasDataSources = datasources.length > 0
  const showWizard =
    !hasDataSources && !wizardDismissedByUser && !isSetupWizardDismissed()
  const [onboardingDismissed] = useState(
    () => localStorage.getItem('ace-onboarding-dismissed') === 'true',
  )

  const dataSourceSummaries = useMemo(
    () =>
      datasources.map(source => ({
        id: source.id,
        name: source.name || dataSourceTypeLabels[source.type],
        typeLabel: dataSourceTypeLabels[source.type],
        signalLabel: signalLabelForDataSource(source),
        roleLabel: source.is_default ? 'Default source' : 'Configured',
      })),
    [datasources],
  )

  if (showWizard) {
    return <SetupWizard onDismissed={() => setWizardDismissedByUser(true)} />
  }

  if (!hasDataSources) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          icon={Sparkles}
          title="Welcome to Ace"
          description="Connect your first data source to get started"
          actionLabel="Add Data Source"
          actionRoute="/app/settings/datasources"
        />
      </div>
    )
  }

  return (
    <div className="relative mx-auto max-w-[1600px] space-y-8 overflow-hidden px-6 py-8">
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-60px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '300px',
          background:
            'radial-gradient(ellipse 60% 50%, rgba(201,150,15,0.10), rgba(201,150,15,0.03) 50%, transparent 80%)',
          zIndex: 0,
        }}
        aria-hidden
      />

      <div
        data-testid="ai-command-input"
        className="relative overflow-hidden rounded-2xl p-8 text-center"
        style={{
          background:
            'linear-gradient(180deg, var(--color-surface-container-low) 0%, var(--color-surface) 100%)',
          border: '1px solid rgba(229,160,13,0.12)',
          zIndex: 1,
        }}
      >
        <div
          className="absolute top-0 left-1/2 h-[2px] w-[200px] -translate-x-1/2"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--color-primary), transparent)',
          }}
          aria-hidden
        />

        <h1
          className="mb-4 font-display font-bold"
          style={{
            color: 'var(--color-on-surface)',
            fontSize: '32px',
            letterSpacing: '-0.04em',
          }}
        >
          Ask Ace anything
        </h1>
        <div
          className="mx-auto flex max-w-[480px] cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition-colors"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface-variant)',
            border: '1px solid var(--color-outline-variant)',
          }}
        >
          <span className="opacity-60">Search services, query data, generate dashboards...</span>
          <kbd
            className="ml-3 shrink-0 rounded px-1.5 py-0.5 text-[9px]"
            style={{
              border: '1px solid var(--color-outline-variant)',
              color: 'var(--color-outline)',
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      <nav
        data-testid="quick-links"
        aria-label="Quick navigation"
        className="flex flex-wrap gap-3"
      >
        {quickLinks.map(link => (
          <Link
            key={link.route}
            to={link.route}
            className="rounded-lg px-4 py-2 text-sm font-medium no-underline transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-surface-container)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {!onboardingDismissed ? <OnboardingBanner /> : null}

      {favorites.length > 0 ? (
        <section data-testid="pinned-dashboards">
          <h2
            className="mb-4 font-display text-lg font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Pinned Dashboards
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {favorites.map(fav => (
              <Link
                key={fav.id}
                to={`/app/dashboards/${fav.id}`}
                className="shrink-0 min-w-[160px] rounded-lg px-4 py-3 text-sm font-medium no-underline transition-colors hover:opacity-90"
                style={{
                  backgroundColor: 'var(--color-surface-container)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              >
                {fav.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {recentDashboards.length > 0 ? (
        <section data-testid="recently-viewed">
          <h2
            className="mb-4 font-display text-lg font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Recently Viewed
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recentDashboards.map(dashboard => (
              <Link
                key={dashboard.id}
                to={`/app/dashboards/${dashboard.id}`}
                className="shrink-0 min-w-[160px] rounded-lg px-4 py-3 text-sm font-medium no-underline transition-colors hover:opacity-90"
                style={{
                  backgroundColor: 'var(--color-surface-container)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              >
                {dashboard.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section
          data-testid="datasource-summary-grid"
          className="rounded-xl p-5"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            border: '1px solid var(--color-outline-variant)',
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-[11px] font-semibold tracking-widest uppercase"
              style={{ color: 'var(--color-secondary)' }}
            >
              Configured Data Sources
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-on-surface-variant)' }}>
              {dataSourceSummaries.length} connected
            </span>
          </div>
          <p
            data-testid="datasource-summary-note"
            className="mt-0 mb-4 text-xs"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Inventory from your configured datasources. Ace is not inferring live service health here.
          </p>
          <div className="flex flex-col gap-1.5">
            {dataSourceSummaries.map(source => (
              <div
                key={source.id}
                data-testid="datasource-summary-card"
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  border: '1px solid transparent',
                }}
              >
                <StatusDot status="info" size={6} />
                <span className="flex-1 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                  {source.name}
                </span>
                <span
                  className="font-mono text-[13px]"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  {source.typeLabel}
                </span>
                <span
                  className="font-mono text-[13px]"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  {source.signalLabel} · {source.roleLabel}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          data-testid="sample-ai-insights"
          className="rounded-xl p-5"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            border: '1px solid rgba(229,160,13,0.08)',
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block shrink-0"
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '3px',
                  background:
                    'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                }}
                aria-hidden
              />
              <span
                className="text-[11px] font-semibold tracking-widest uppercase"
                style={{ color: 'var(--color-primary)' }}
              >
                Sample AI Insights
              </span>
            </div>
            <span className="text-[11px]" style={{ color: 'var(--color-outline)' }}>
              Examples only
            </span>
          </div>
          <p
            data-testid="sample-ai-insights-note"
            className="mt-0 mb-4 text-xs"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Illustrative examples only — these cards are not generated from your current telemetry.
          </p>
          <div className="flex flex-col gap-2">
            {sampleAiInsights.map(insight => (
              <AiInsightCard key={insight.title} {...insight} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}