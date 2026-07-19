import { AlertCircle, BarChart3, Pencil, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { BarChart } from '@/components/BarChart'
import { GaugeChart, type Threshold } from '@/components/GaugeChart'
import { LineChart } from '@/components/LineChart'
import { PieChart, type PieDataItem } from '@/components/PieChart'
import { useCrosshairSync } from '@/contexts/CrosshairSyncContext'
import { useDashboardVariables } from '@/contexts/VariablesContext'
import { usePanelData } from '@/hooks/usePanelData'
import type { Panel as PanelType } from '@/types/panel'

type PanelProps = {
  panel: PanelType
  onEdit?: (panel: PanelType) => void
  onDelete?: (panel: PanelType) => void
}

export function Panel({ panel, onEdit, onDelete }: PanelProps) {
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        {!hasQuery ? (
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
        ) : loading ? (
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