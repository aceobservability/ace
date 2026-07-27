import { Plus, Trash2 } from 'lucide-react'
import type { Threshold } from '@/components/panelEdit/thresholdFields'

const inputClass =
  'w-full rounded-lg px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50'
const selectClass =
  'w-full cursor-pointer appearance-none rounded-lg px-3 py-2.5 pr-10 text-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50'
const fieldStyle = {
  backgroundColor: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid var(--color-outline-variant)',
} as const

export type PanelTypeOptionsProps = {
  loading: boolean
  isBuiltinTracePanel: boolean
  isGaugeType: boolean
  isPieType: boolean
  isStatType: boolean
  traceService: string
  setTraceService: (value: string) => void
  traceLimit: number
  setTraceLimit: (value: number) => void
  gaugeMin: number
  setGaugeMin: (value: number) => void
  gaugeMax: number
  setGaugeMax: (value: number) => void
  gaugeUnit: string
  setGaugeUnit: (value: string) => void
  gaugeDecimals: number
  setGaugeDecimals: (value: number) => void
  gaugeThresholds: Threshold[]
  addGaugeThreshold: () => void
  removeGaugeThreshold: (id: string) => void
  updateGaugeThreshold: (id: string, patch: Partial<Pick<Threshold, 'value' | 'color'>>) => void
  pieDisplayAs: 'pie' | 'donut'
  setPieDisplayAs: (value: 'pie' | 'donut') => void
  pieShowLegend: boolean
  setPieShowLegend: (value: boolean) => void
  pieShowLabels: boolean
  setPieShowLabels: (value: boolean) => void
  statUnit: string
  setStatUnit: (value: string) => void
  statDecimals: number
  setStatDecimals: (value: number) => void
  statShowTrend: boolean
  setStatShowTrend: (value: boolean) => void
  statShowSparkline: boolean
  setStatShowSparkline: (value: boolean) => void
  statThresholds: Threshold[]
  addStatThreshold: () => void
  removeStatThreshold: (id: string) => void
  updateStatThreshold: (id: string, patch: Partial<Pick<Threshold, 'value' | 'color'>>) => void
}

export function PanelTypeOptions(props: PanelTypeOptionsProps) {
  const {
    loading,
    isBuiltinTracePanel,
    isGaugeType,
    isPieType,
    isStatType,
    traceService,
    setTraceService,
    traceLimit,
    setTraceLimit,
    gaugeMin,
    setGaugeMin,
    gaugeMax,
    setGaugeMax,
    gaugeUnit,
    setGaugeUnit,
    gaugeDecimals,
    setGaugeDecimals,
    gaugeThresholds,
    addGaugeThreshold,
    removeGaugeThreshold,
    updateGaugeThreshold,
    pieDisplayAs,
    setPieDisplayAs,
    pieShowLegend,
    setPieShowLegend,
    pieShowLabels,
    setPieShowLabels,
    statUnit,
    setStatUnit,
    statDecimals,
    setStatDecimals,
    statShowTrend,
    setStatShowTrend,
    statShowSparkline,
    setStatShowSparkline,
    statThresholds,
    addStatThreshold,
    removeStatThreshold,
    updateStatThreshold,
  } = props

  return (
    <>
          {isBuiltinTracePanel ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Trace Panel Options
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="trace-service-filter"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Service Filter (optional)
                  </label>
                  <input
                    id="trace-service-filter"
                    type="text"
                    value={traceService}
                    onChange={event => setTraceService(event.target.value)}
                    placeholder="api-service"
                    disabled={loading}
                    data-testid="panel-trace-service-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="trace-limit"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Max traces
                  </label>
                  <input
                    id="trace-limit"
                    type="number"
                    min={1}
                    max={200}
                    value={traceLimit}
                    onChange={event => setTraceLimit(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-trace-limit-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {isGaugeType ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Gauge Options
              </h4>
              <div className="grid grid-cols-4 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="gauge-min"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Min
                  </label>
                  <input
                    id="gauge-min"
                    type="number"
                    value={gaugeMin}
                    onChange={event => setGaugeMin(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-gauge-min-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="gauge-max"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Max
                  </label>
                  <input
                    id="gauge-max"
                    type="number"
                    value={gaugeMax}
                    onChange={event => setGaugeMax(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-gauge-max-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="gauge-unit"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Unit
                  </label>
                  <input
                    id="gauge-unit"
                    type="text"
                    value={gaugeUnit}
                    onChange={event => setGaugeUnit(event.target.value)}
                    placeholder="%"
                    disabled={loading}
                    data-testid="panel-gauge-unit-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="gauge-decimals"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Decimals
                  </label>
                  <input
                    id="gauge-decimals"
                    type="number"
                    min={0}
                    max={10}
                    value={gaugeDecimals}
                    onChange={event => setGaugeDecimals(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-gauge-decimals-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Thresholds
                  </span>
                  <button
                    type="button"
                    data-testid="panel-gauge-add-threshold-btn"
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                    onClick={addGaugeThreshold}
                    disabled={loading}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {gaugeThresholds.map(threshold => (
                    <div key={threshold.id} className="flex items-center gap-2">
                      <input
                        type="number"
                        value={threshold.value}
                        onChange={event =>
                          updateGaugeThreshold(threshold.id, {
                            value: Number(event.target.value),
                          })
                        }
                        placeholder="Value"
                        disabled={loading}
                        className={`${inputClass} !w-auto flex-1`}
                        style={fieldStyle}
                      />
                      <input
                        type="color"
                        value={threshold.color}
                        onChange={event =>
                          updateGaugeThreshold(threshold.id, { color: event.target.value })
                        }
                        disabled={loading}
                        className="h-9 w-10 cursor-pointer rounded-lg p-0.5"
                        style={fieldStyle}
                      />
                      <button
                        type="button"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition hover:opacity-80"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() => removeGaugeThreshold(threshold.id)}
                        disabled={loading}
                        title="Remove threshold"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {isPieType ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Pie Chart Options
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="pie-display"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Display Style
                  </label>
                  <select
                    id="pie-display"
                    value={pieDisplayAs}
                    onChange={event => setPieDisplayAs(event.target.value as 'pie' | 'donut')}
                    disabled={loading}
                    data-testid="panel-pie-display-select"
                    className={selectClass}
                    style={fieldStyle}
                  >
                    <option value="pie">Pie</option>
                    <option value="donut">Donut</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="pie-legend"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Show Legend
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="pie-legend"
                      type="checkbox"
                      checked={pieShowLegend}
                      onChange={event => setPieShowLegend(event.target.checked)}
                      disabled={loading}
                      data-testid="panel-pie-legend-checkbox"
                      className="h-4 w-4 rounded"
                    />
                    <label
                      htmlFor="pie-legend"
                      className="text-sm"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      Display legend
                    </label>
                  </div>
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="pie-labels"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Show Labels
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="pie-labels"
                      type="checkbox"
                      checked={pieShowLabels}
                      onChange={event => setPieShowLabels(event.target.checked)}
                      disabled={loading}
                      data-testid="panel-pie-labels-checkbox"
                      className="h-4 w-4 rounded"
                    />
                    <label
                      htmlFor="pie-labels"
                      className="text-sm"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      Display value labels
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isStatType ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Stat Panel Options
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="stat-unit"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Unit
                  </label>
                  <input
                    id="stat-unit"
                    type="text"
                    value={statUnit}
                    onChange={event => setStatUnit(event.target.value)}
                    placeholder="%"
                    disabled={loading}
                    data-testid="panel-stat-unit-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="stat-decimals"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Decimals
                  </label>
                  <input
                    id="stat-decimals"
                    type="number"
                    min={0}
                    max={10}
                    value={statDecimals}
                    onChange={event => setStatDecimals(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-stat-decimals-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  <input
                    type="checkbox"
                    checked={statShowTrend}
                    onChange={event => setStatShowTrend(event.target.checked)}
                    disabled={loading}
                    data-testid="panel-stat-trend-checkbox"
                    className="h-4 w-4 rounded"
                  />
                  Show Trend Indicator
                </label>
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  <input
                    type="checkbox"
                    checked={statShowSparkline}
                    onChange={event => setStatShowSparkline(event.target.checked)}
                    disabled={loading}
                    data-testid="panel-stat-sparkline-checkbox"
                    className="h-4 w-4 rounded"
                  />
                  Show Sparkline
                </label>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Thresholds (Optional)
                  </span>
                  <button
                    type="button"
                    data-testid="panel-stat-add-threshold-btn"
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                    onClick={addStatThreshold}
                    disabled={loading}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {statThresholds.map(threshold => (
                    <div key={threshold.id} className="flex items-center gap-2">
                      <input
                        type="number"
                        value={threshold.value}
                        onChange={event =>
                          updateStatThreshold(threshold.id, {
                            value: Number(event.target.value),
                          })
                        }
                        placeholder="Value"
                        disabled={loading}
                        className={`${inputClass} !w-auto flex-1`}
                        style={fieldStyle}
                      />
                      <input
                        type="color"
                        value={threshold.color}
                        onChange={event =>
                          updateStatThreshold(threshold.id, { color: event.target.value })
                        }
                        disabled={loading}
                        className="h-9 w-10 cursor-pointer rounded-lg p-0.5"
                        style={fieldStyle}
                      />
                      <button
                        type="button"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition hover:opacity-80"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() => removeStatThreshold(threshold.id)}
                        disabled={loading}
                        title="Remove threshold"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

    </>
  )
}
