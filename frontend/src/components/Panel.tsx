import { AlertCircle, BarChart3, Pencil, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { BarChart } from '@/components/BarChart'
import { GaugeChart, type Threshold } from '@/components/GaugeChart'
import { LineChart } from '@/components/LineChart'
import { LogViewer } from '@/components/LogViewer'
import { PieChart, type PieDataItem } from '@/components/PieChart'
import { StatPanel } from '@/components/StatPanel'
import { TablePanel } from '@/components/TablePanel'
import { TraceHeatmapPanel } from '@/components/TraceHeatmapPanel'
import { TraceListPanel } from '@/components/TraceListPanel'
import { ensurePanelTypesRegistered } from '@/components/panels/registerPanelTypes'
import { useCrosshairSync } from '@/contexts/CrosshairSyncContext'
import { useDashboardVariables } from '@/contexts/VariablesContext'
import { usePanelData } from '@/hooks/usePanelData'
import type { Panel as PanelType } from '@/types/panel'

ensurePanelTypesRegistered()

type PanelProps = {
  panel: PanelType
  onEdit?: (panel: PanelType) => void
  onDelete?: (panel: PanelType) => void
  onOpenTrace?: (payload: { datasourceId: string; traceId: string }) => void
}

export function Panel({ panel, onEdit, onDelete, onOpenTrace }: PanelProps) {
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
  const {
    loading,
    error,
    chartSeries,
    logs,
    traceSummaries,
    hasQuery,
    registry,
  } = usePanelData(panel, interpolate, variableSignature)

  const gaugeValue = useMemo(() => {
    if (chartSeries.length === 0) return 0
    const firstSeries = chartSeries[0]
    if (!firstSeries || firstSeries.data.length === 0) return 0
    return firstSeries.data[firstSeries.data.length - 1]!.value
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
        value: series.data.length > 0 ? series.data[series.data.length - 1]!.value : 0,
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

  const statData = useMemo(
    () =>
      chartSeries[0]?.data.map(point => ({
        timestamp: point.timestamp,
        value: point.value,
      })) ?? [],
    [chartSeries],
  )

  const statValue = useMemo(() => {
    if (statData.length === 0) return 0
    return statData[statData.length - 1]!.value
  }, [statData])

  const statPreviousValue = useMemo(() => {
    if (statData.length < 2) return undefined
    return statData[statData.length - 2]!.value
  }, [statData])

  const statConfig = useMemo(() => {
    const query = panel.query || {}
    return {
      unit: typeof query.unit === 'string' ? query.unit : '',
      decimals: typeof query.decimals === 'number' ? query.decimals : 2,
      showTrend: query.showTrend !== false,
      showSparkline: query.showSparkline !== false,
      thresholds: Array.isArray(query.thresholds) ? (query.thresholds as Threshold[]) : [],
    }
  }, [panel.query])

  const textContent =
    typeof panel.query?.content === 'string' ? panel.query.content : ''

  const isLineChart = panel.type === 'line_chart'
  const isBarChart = panel.type === 'bar_chart'
  const isGaugeChart = panel.type === 'gauge'
  const isPieChart = panel.type === 'pie'
  const isStatPanel = panel.type === 'stat'
  const isTablePanel = panel.type === 'table'
  const isLogPanel = panel.type === 'logs'
  const isTraceListPanel = panel.type === 'trace_list'
  const isTraceHeatmapPanel = panel.type === 'trace_heatmap'
  const isTextPanel = panel.type === 'text'
  const isRegistryPanel = registry !== null
  const registryEmptyState = registry?.emptyState ?? null
  const isUnsupportedRegistryPanel = registry?.supportStatus === 'unsupported'
  const isSetupRequiredRegistryPanel = registry?.supportStatus === 'setup_required'

  function handleOpenTrace(traceId: string) {
    const datasourceId = panel.query?.datasource_id
    if (typeof datasourceId !== 'string' || !datasourceId) return
    onOpenTrace?.({ datasourceId, traceId })
  }

  function renderBody() {
    if (!hasQuery) {
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3"
          style={{ color: 'var(--color-outline)' }}
        >
          <BarChart3 size={48} />
          <p className="m-0 text-sm">No query configured</p>
          {onEdit ? (
            <button
              type="button"
              className="cursor-pointer rounded-lg border-0 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              }}
              data-testid="panel-configure-btn"
              onClick={() => onEdit(panel)}
            >
              Configure Panel
            </button>
          ) : null}
        </div>
      )
    }

    if (loading) {
      return (
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
    }

    if (error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <AlertCircle size={48} style={{ color: 'var(--color-error)' }} />
          <p className="m-0 p-2 text-xs" style={{ color: 'var(--color-error)' }}>
            {error}
          </p>
        </div>
      )
    }

    if (isLineChart && chartSeries.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <LineChart series={chartSeries} group={groupId ?? undefined} />
        </div>
      )
    }

    if (isBarChart && chartSeries.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <BarChart series={chartSeries} />
        </div>
      )
    }

    if (isGaugeChart && chartSeries.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <GaugeChart value={gaugeValue} {...gaugeConfig} />
        </div>
      )
    }

    if (isPieChart && pieData.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <PieChart data={pieData} {...pieConfig} />
        </div>
      )
    }

    if (isStatPanel && statData.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <StatPanel
            value={statValue}
            previousValue={statPreviousValue}
            data={statData}
            label={panel.title}
            unit={statConfig.unit}
            decimals={statConfig.decimals}
            thresholds={statConfig.thresholds}
            showTrend={statConfig.showTrend}
            showSparkline={statConfig.showSparkline}
          />
        </div>
      )
    }

    if (isTablePanel && chartSeries.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <TablePanel series={chartSeries} />
        </div>
      )
    }

    if (isLogPanel && logs.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <LogViewer logs={logs} />
        </div>
      )
    }

    if (isTraceListPanel && traceSummaries.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <TraceListPanel traces={traceSummaries} onOpenTrace={handleOpenTrace} />
        </div>
      )
    }

    if (isTraceHeatmapPanel && traceSummaries.length > 0) {
      return (
        <div className="min-h-0 flex-1">
          <TraceHeatmapPanel traces={traceSummaries} onOpenTrace={handleOpenTrace} />
        </div>
      )
    }

    if (isTextPanel) {
      return (
        <div
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 text-sm leading-6"
          style={{ color: 'var(--color-on-surface)' }}
          data-testid="text-panel"
        >
          {textContent || 'Edit this panel to add content.'}
        </div>
      )
    }

    if (isUnsupportedRegistryPanel || isSetupRequiredRegistryPanel) {
      return (
        <div
          data-testid="panel-unsupported-empty"
          className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          <AlertCircle size={40} style={{ color: 'var(--color-tertiary)' }} />
          <h4 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {registryEmptyState?.title || 'Panel not supported yet'}
          </h4>
          <p className="m-0 max-w-sm text-xs leading-5">
            {registryEmptyState?.description ||
              'This panel type is registered but has no live data integration.'}
          </p>
          {registryEmptyState?.actionLabel ? (
            <span
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--color-primary)' }}
            >
              {registryEmptyState.actionLabel}
            </span>
          ) : null}
        </div>
      )
    }

    if (isRegistryPanel) {
      return (
        <div
          data-testid="panel-registry-placeholder"
          className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          <AlertCircle size={40} style={{ color: 'var(--color-tertiary)' }} />
          <h4 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {registry?.label || panel.type} renderer pending
          </h4>
          <p className="m-0 max-w-sm text-xs leading-5">
            This panel type can be configured and saved. Live React rendering ships with the
            dedicated panel renderer work.
          </p>
        </div>
      )
    }

    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        <AlertCircle size={48} style={{ color: 'var(--color-tertiary)' }} />
        <p className="m-0 text-sm">No data available</p>
      </div>
    )
  }

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
        {(onEdit || onDelete) && (
          <div className="panel-actions flex gap-1">
            {onEdit ? (
              <button
                type="button"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent transition hover:opacity-80"
                style={{ color: 'var(--color-outline)' }}
                data-testid="panel-edit-btn"
                title="Edit panel"
                onClick={() => onEdit(panel)}
              >
                <Pencil size={16} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent transition hover:opacity-80"
                style={{ color: 'var(--color-outline)' }}
                data-testid="panel-delete-btn"
                title="Delete panel"
                onClick={() => onDelete(panel)}
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">{renderBody()}</div>
    </div>
  )
}
