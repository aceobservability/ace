import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MetricsExplorePanel } from '@/components/MetricsExplorePanel'

type ExploreType = 'metrics' | 'logs' | 'traces'

const tabs: { key: ExploreType; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'logs', label: 'Logs' },
  { key: 'traces', label: 'Traces' },
]

function normalizeExploreType(type: string | undefined): ExploreType {
  if (type === 'logs' || type === 'traces') return type
  return 'metrics'
}

export function ExplorePage() {
  const navigate = useNavigate()
  const { type } = useParams<{ type: string }>()
  const activeType = useMemo(() => normalizeExploreType(type), [type])

  function navigateToTab(nextType: ExploreType) {
    if (nextType === activeType) return
    navigate(`/app/explore/${nextType}`)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col px-8 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className="m-0 font-display text-2xl font-bold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Explore
          </h1>
        </div>
      </header>

      <nav
        className="mb-6 flex gap-1"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
        data-testid="explore-tab-nav"
      >
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className="cursor-pointer bg-transparent px-4 py-2.5 text-sm font-medium transition"
            style={{
              color:
                activeType === tab.key ? 'var(--color-primary)' : 'var(--color-outline)',
              borderBottom:
                activeType === tab.key
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
            }}
            data-testid={`explore-tab-${tab.key}`}
            onClick={() => navigateToTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeType === 'metrics' ? (
        <MetricsExplorePanel key="metrics" />
      ) : (
        <div
          className="flex flex-1 flex-col items-center justify-center rounded-lg py-16 text-center"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-outline)',
          }}
          data-testid={`explore-placeholder-${activeType}`}
        >
          <p className="m-0 text-sm">
            {activeType === 'logs' ? 'Logs explore' : 'Traces explore'} is coming soon.
          </p>
        </div>
      )}
    </div>
  )
}