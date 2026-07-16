import { AlertCircle, BarChart3 } from 'lucide-react'
import { lazy, Suspense, useMemo, type ComponentType } from 'react'
import '@/components/panels/registerChartPanels'
import { BarChart } from '@/components/BarChart'
import { GaugeChart, type Threshold } from '@/components/GaugeChart'
import { LineChart } from '@/components/LineChart'
import { PieChart, type PieDataItem } from '@/components/PieChart'
import { useCrosshairSync } from '@/contexts/CrosshairSyncContext'
import { useDashboardVariables } from '@/contexts/VariablesContext'
import { usePanelData } from '@/hooks/usePanelData'
import type { Panel as PanelType, RawQueryResult } from '@/types/panel'
import { isRegisteredPanel, lookupPanel } from '@/utils/panelRegistry'

const BUILTIN_PANEL_TYPES = new Set(['line_chart', 'bar_chart', 'gauge', 'pie'])

const registryComponentCache = new Map<string, ComponentType<Record<string, unknown>>>()

function getRegistryComponent(type: string): ComponentType<Record<string, unknown>> | null {
  const registration = lookupPanel(type)
  if (!registration) return null

  if (!registryComponentCache.has(type)) {
    registryComponentCache.set(
      type,
      lazy(
        () =>
          registration.component() as Promise<{
            default: ComponentType<Record<string, unknown>>
          }>,
      ),
    )
  }

  return registryComponentCache.get(type) ?? null
}

type PanelProps = {
  panel: PanelType
}

export function Panel({ panel }: PanelProps) {
  const { interpolate, variables } = useDashboardVariables()
  const { groupId } = useCrosshairSync()
  const variableSignature = useMemo(
    () =>
      variables
        .map(variable => {
          const current = Array.isArray(variable.current)
            ? variable.current.join(',')
            : (variable.current ?? '')
          return `${variable.name}:${current}`
        })
        .join('|'),
    [variables],
  )
  const { loading, error, chartSeries, hasQuery } = usePanelData(
    panel,
    interpolate,
    variableSignature,
  )

  const registryPanel = useMemo(() => {
    if (BUILTIN_PANEL_TYPES.has(panel.type)) return null
    if (!isRegisteredPanel(panel.type)) return null
    return lookupPanel(panel.type)
  }, [panel.type])

  const RegistryComponent = useMemo(
    () => (registryPanel ? getRegistryComponent(panel.type) : null),
    [panel.type, registryPanel],
  )

  const panelHasQuery = useMemo(() => {
    if (!registryPanel) return hasQuery
    if (registryPanel.queryMode === 'none') return true
    if (registryPanel.queryMode === 'traces') {
      const queryExpr = (panel.query?.promql || panel.query?.expr || '') as string
      return !!panel.query?.datasource_id && !!queryExpr.trim()
    }
    return hasQuery
  }, [hasQuery, panel.query, registryPanel])

  const registryProps = useMemo(() => {
    if (!registryPanel) return null
    const raw: RawQueryResult = {
      series: chartSeries.map(series => ({
        name: series.name,
        data: series.data,
      })),
    }
    return registryPanel.dataAdapter(raw, panel.query)
  }, [chartSeries, panel.query, registryPanel])

  const gaugeValue = useMemo(() => {
    if (chartSeries.length === 0) return 0
    const firstSeries = chartSeries[0]
    if (firstSeries.data.length === 0) return 0
    return firstSeries.data[firstSeries.data.length - 1].value
  }, [chartSeries])

  const gaugeConfig = useMemo(() => {
    const query = panel.query || {}
    return {
      min: typeof query.min === 'number' ? query.min : 0,
      max: typeof query.max === 'number' ? query.max : 100,
      unit: typeof query.unit === 'string' ? query.unit : '',
      decimals: typeof query.decimals === 'number' ? query.decimals : 2,
      thresholds: Array.isArray(query.thresholds) ? (query.thresholds as Threshold[]) : [],
    }
  }, [panel.query])

  const pieData = useMemo<PieDataItem[]>(
    () =>
      chartSeries.map(series => ({
        name: series.name,
        value: series.data.length > 0 ? series.data[series.data.length - 1].value : 0,
      })),
    [chartSeries],
  )

  const pieConfig = useMemo(() => {
    const query = panel.query || {}
    return {
      displayAs: (query.displayAs === 'donut' ? 'donut' : 'pie') as 'pie' | 'donut',
      showLegend: query.showLegend !== false,
      showLabels: query.showLabels !== false,
    }
  }, [panel.query])

  const isLineChart = panel.type === 'line_chart'
  const isBarChart = panel.type === 'bar_chart'
  const isGaugeChart = panel.type === 'gauge'
  const isPieChart = panel.type === 'pie'
  const isRegistryPanel = registryPanel !== null
  const isUnsupportedRegistryPanel = registryPanel?.supportStatus === 'unsupported'

  const loadingSpinner = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div
        className="h-8 w-8 animate-spin rounded-full border-[3px]"
        style={{
          borderColor: 'var(--color-outline-variant)',
          borderTopColor: 'var(--color-primary)',
        }}
      />
      <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        Loading data...
      </p>
    </div>
  )

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-lg"
      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      data-testid={`dashboard-panel-${panel.id}`}
    >
      <div
        className="panel-header flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <h3 className="truncate text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          {panel.title}
        </h3>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        {!panelHasQuery ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3"
            style={{ color: 'var(--color-outline)' }}
          >
            <BarChart3 size={48} />
            <p className="m-0 text-sm">No query configured</p>
          </div>
        ) : loading ? (
          loadingSpinner
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <AlertCircle size={48} style={{ color: 'var(--color-error)' }} />
            <p className="m-0 p-2 text-xs" style={{ color: 'var(--color-error)' }}>
              {error}
            </p>
          </div>
        ) : isLineChart && chartSeries.length > 0 ? (
          <div className="min-h-0 flex-1">
            <LineChart series={chartSeries} group={groupId ?? undefined} />
          </div>
        ) : isBarChart && chartSeries.length > 0 ? (
          <div className="min-h-0 flex-1">
            <BarChart series={chartSeries} />
          </div>
        ) : isGaugeChart && chartSeries.length > 0 ? (
          <div className="min-h-0 flex-1">
            <GaugeChart value={gaugeValue} {...gaugeConfig} />
          </div>
        ) : isPieChart && pieData.length > 0 ? (
          <div className="min-h-0 flex-1">
            <PieChart data={pieData} {...pieConfig} />
          </div>
        ) : isUnsupportedRegistryPanel ? (
          <div
            data-testid="panel-unsupported-empty"
            className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <AlertCircle size={40} style={{ color: 'var(--color-tertiary)' }} />
            <h4 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
              {registryPanel?.emptyState?.title || 'Panel not supported yet'}
            </h4>
            <p className="m-0 max-w-sm text-xs leading-5">
              {registryPanel?.emptyState?.description ||
                'This panel type is registered but has no live data integration.'}
            </p>
            {registryPanel?.emptyState?.actionLabel ? (
              <span
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-primary)' }}
              >
                {registryPanel.emptyState.actionLabel}
              </span>
            ) : null}
          </div>
        ) : isRegistryPanel && RegistryComponent && registryProps && chartSeries.length > 0 ? (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={loadingSpinner}>
              <RegistryComponent {...registryProps} />
            </Suspense>
          </div>
        ) : (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <AlertCircle size={48} style={{ color: 'var(--color-tertiary)' }} />
            <p className="m-0 text-sm">No data available</p>
          </div>
        )}
      </div>
    </div>
  )
}