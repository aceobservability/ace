import { Activity, AlertCircle, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchDataSourceTraceServices } from '@/api/datasources'
import { EmptyState } from '@/components/EmptyState'
import { StatusDot } from '@/components/StatusDot'
import { useTracingDatasources } from '@/hooks/useTracingDatasources'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import { dataSourceTypeLabels, type DataSource } from '@/types/datasource'

interface ServiceInventoryItem {
  id: string
  name: string
  sourceId: string
  sourceName: string
  sourceTypeLabel: string
  status: 'info'
}

function labelForDataSource(source: DataSource): string {
  return source.name || dataSourceTypeLabels[source.type]
}

export function ServicesPage() {
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const {
    data: datasources = [],
    tracingDatasources,
    isLoading: datasourcesLoading,
    error: datasourcesQueryError,
  } = useTracingDatasources(currentOrgId)

  const toggleFavorite = useFavoritesStore(state => state.toggleFavorite)
  const isFavorite = useFavoritesStore(state => state.isFavorite)

  const [services, setServices] = useState<ServiceInventoryItem[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)

  const hasDataSources = datasources.length > 0
  const hasTracingSources = tracingDatasources.length > 0
  const datasourcesError =
    datasourcesQueryError instanceof Error
      ? datasourcesQueryError.message
      : datasourcesQueryError
        ? String(datasourcesQueryError)
        : null

  const tracingSourceKey = useMemo(
    () => tracingDatasources.map(source => `${source.id}:${source.name}:${source.type}`).join('|'),
    [tracingDatasources],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by tracingSourceKey to avoid array-identity refetches
  useEffect(() => {
    if (tracingDatasources.length === 0) {
      setServices([])
      setDiscoveryError(null)
      setLoadingServices(false)
      return
    }

    const controller = new AbortController()
    let cancelled = false
    const sources = tracingDatasources

    async function loadDiscoveredServices() {
      setLoadingServices(true)
      setDiscoveryError(null)

      try {
        const results = await Promise.allSettled(
          sources.map(async source => {
            const names = await fetchDataSourceTraceServices(source.id, controller.signal)
            return names
              .map(name => name.trim())
              .filter(Boolean)
              .map<ServiceInventoryItem>(name => ({
                id: `${source.id}:${name}`,
                name,
                sourceId: source.id,
                sourceName: labelForDataSource(source),
                sourceTypeLabel: dataSourceTypeLabels[source.type],
                status: 'info',
              }))
          }),
        )

        if (cancelled || controller.signal.aborted) return

        setServices(
          results
            .flatMap(result => (result.status === 'fulfilled' ? result.value : []))
            .sort((left, right) => left.name.localeCompare(right.name)),
        )

        const failedSources = results.filter(result => result.status === 'rejected').length
        setDiscoveryError(
          failedSources
            ? `Service discovery failed for ${failedSources} tracing datasource${failedSources === 1 ? '' : 's'}.`
            : null,
        )
      } catch (error) {
        if (cancelled || controller.signal.aborted) return
        setServices([])
        setDiscoveryError(error instanceof Error ? error.message : 'Failed to discover services')
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setLoadingServices(false)
        }
      }
    }

    void loadDiscoveredServices()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [tracingSourceKey])

  const loading = datasourcesLoading || loadingServices

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--color-on-surface)' }}>
          Services
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Service inventory discovered from tracing datasources. Ace does not show sample health
          data here.
        </p>
      </div>

      {loading ? (
        <div
          data-testid="services-loading"
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg p-6 text-sm"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          <Activity size={28} aria-hidden />
          Discovering services from tracing datasources…
        </div>
      ) : datasourcesError ? (
        <div
          data-testid="services-error"
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg p-6 text-sm"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-error)',
          }}
        >
          <AlertCircle size={28} aria-hidden />
          {datasourcesError}
        </div>
      ) : !hasDataSources ? (
        <EmptyState
          icon={Activity}
          title="No service telemetry configured"
          description="Connect a tracing datasource to discover services. Ace will not show hardcoded sample services here."
          actionLabel="Add Data Source"
          actionRoute="/app/settings/datasources"
        />
      ) : !hasTracingSources ? (
        <EmptyState
          icon={Activity}
          title="No tracing datasource configured"
          description="Services are discovered from Tempo, VictoriaTraces, or ClickHouse tracing data. Add one to populate this view."
          actionLabel="Add Tracing Source"
          actionRoute="/app/settings/datasources"
        />
      ) : discoveryError && services.length === 0 ? (
        <div
          data-testid="services-discovery-error"
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg p-6 text-center text-sm"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          <AlertCircle size={28} style={{ color: 'var(--color-tertiary)' }} aria-hidden />
          <h2 className="m-0 font-display text-lg" style={{ color: 'var(--color-on-surface)' }}>
            Service discovery unavailable
          </h2>
          <p className="m-0 max-w-md">{discoveryError}</p>
          <p className="m-0 max-w-md">
            Check the tracing datasource connection or use Explore to run a trace query directly.
          </p>
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No services discovered yet"
          description="Ace queried your tracing datasource but did not find service names in the current backend response. No sample services are shown."
          actionLabel="Open Traces Explore"
          actionRoute="/app/explore/traces"
        />
      ) : (
        <div className="space-y-4">
          {discoveryError ? (
            <div
              data-testid="services-partial-warning"
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(249,115,22,0.08)',
                border: '1px solid rgba(249,115,22,0.16)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {discoveryError} Showing services from the datasources that responded.
            </div>
          ) : null}

          <div
            data-testid="services-data-notice"
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: 'var(--color-surface-container-low)',
              border: '1px solid var(--color-outline-variant)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            Inventory only: health, latency, error rate, and throughput are not inferred on this
            page until they are backed by real telemetry queries.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(service => {
              const favoriteId = `svc::${service.name}`
              const favorited = isFavorite(favoriteId)
              return (
                <div
                  key={service.id}
                  data-testid="service-card"
                  className="relative rounded-lg p-5 transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                >
                  <span
                    data-testid="service-inventory-chip"
                    className="absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-medium"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    Inventory only
                  </span>

                  <div className="mb-4 flex items-center gap-3 pr-24">
                    <StatusDot status={service.status} size={8} />
                    <h3
                      data-testid="service-name"
                      className="flex-1 truncate font-display text-base font-semibold"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      {service.name}
                    </h3>
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer border-none bg-transparent p-1"
                      data-testid={`favorite-svc-${service.name}`}
                      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={() =>
                        toggleFavorite({
                          id: favoriteId,
                          title: service.name,
                          type: 'service',
                        })
                      }
                    >
                      <Star
                        size={14}
                        fill={favorited ? 'currentColor' : 'none'}
                        style={{
                          color: favorited ? 'var(--color-primary)' : 'var(--color-outline)',
                        }}
                      />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                        Source
                      </span>
                      <span
                        data-testid="service-field"
                        className="truncate text-right font-mono text-sm font-medium"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        {service.sourceName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                        Datasource
                      </span>
                      <span
                        data-testid="service-field"
                        className="font-mono text-sm font-medium"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        {service.sourceTypeLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                        Health
                      </span>
                      <span
                        data-testid="service-field"
                        className="font-mono text-sm font-medium"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        Not evaluated
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
