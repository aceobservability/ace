import {
  AlertCircle,
  BellOff,
  BellRing,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createSilence,
  expireSilence,
  fetchAlertManagerAlerts,
  fetchReceivers,
  fetchSilences,
} from '@/api/alertmanager'
import { fetchVMAlertGroups, fetchVMAlerts } from '@/api/vmalert'
import { AiAlertTriage } from '@/components/AiAlertTriage'
import { StatusDot } from '@/components/StatusDot'
import { useAlertingDatasources } from '@/hooks/useAlertingDatasources'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import {
  dataSourceTypeLabels,
  type AMAlert,
  type AMMatcher,
  type AMReceiver,
  type AMSilence,
  type DataSource,
  type VMAlertAlert,
  type VMAlertRuleGroup,
} from '@/types/datasource'

type ActiveTab = 'alerts' | 'groups' | 'am-alerts' | 'am-silences' | 'am-receivers'

function stateToStatusDot(state: string): 'healthy' | 'warning' | 'critical' | 'info' {
  switch (state) {
    case 'firing':
    case 'active':
      return 'critical'
    case 'pending':
    case 'suppressed':
      return 'warning'
    default:
      return 'healthy'
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m`
}

function truncateId(id: string): string {
  return id.length > 8 ? `${id.substring(0, 8)}...` : id
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function matcherOperator(m: AMMatcher): string {
  if (m.isEqual) return m.isRegex ? '=~' : '='
  return m.isRegex ? '!~' : '!='
}

export function AlertsPage() {
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const user = useAuthStore(state => state.user)
  const { alertingDatasources, isLoading: datasourcesLoading } = useAlertingDatasources(currentOrgId)

  const toggleFavorite = useFavoritesStore(state => state.toggleFavorite)
  const isFavorite = useFavoritesStore(state => state.isFavorite)

  const [selectedDatasourceId, setSelectedDatasourceId] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('alerts')

  const [alerts, setAlerts] = useState<VMAlertAlert[]>([])
  const [groups, setGroups] = useState<VMAlertRuleGroup[]>([])
  const [amAlerts, setAmAlerts] = useState<AMAlert[]>([])
  const [amSilences, setAmSilences] = useState<AMSilence[]>([])
  const [amReceivers, setAmReceivers] = useState<AMReceiver[]>([])

  const [amFilterActive, setAmFilterActive] = useState(true)
  const [amFilterSilenced, setAmFilterSilenced] = useState(true)
  const [amFilterInhibited, setAmFilterInhibited] = useState(true)

  const [showSilenceModal, setShowSilenceModal] = useState(false)
  const [silenceMatchers, setSilenceMatchers] = useState<Array<AMMatcher & { key: string }>>([
    { key: 'matcher-0', name: '', value: '', isRegex: false, isEqual: true },
  ])
  const [silenceStart, setSilenceStart] = useState('')
  const [silenceEnd, setSilenceEnd] = useState('')
  const [silenceCreatedBy, setSilenceCreatedBy] = useState('')
  const [silenceComment, setSilenceComment] = useState('')
  const [silenceSaving, setSilenceSaving] = useState(false)
  const [silenceError, setSilenceError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [expandedAlertIdx, setExpandedAlertIdx] = useState<number | null>(null)

  const selectedDatasource = useMemo<DataSource | undefined>(
    () => alertingDatasources.find(d => d.id === selectedDatasourceId),
    [alertingDatasources, selectedDatasourceId],
  )

  const isAlertManager = selectedDatasource?.type === 'alertmanager'
  const isVMAlert = selectedDatasource?.type === 'vmalert'

  const firingAlerts = useMemo(() => alerts.filter(a => a.state === 'firing'), [alerts])
  const pendingAlerts = useMemo(() => alerts.filter(a => a.state === 'pending'), [alerts])
  const inactiveAlerts = useMemo(
    () => alerts.filter(a => a.state !== 'firing' && a.state !== 'pending'),
    [alerts],
  )
  const sortedAlerts = useMemo(
    () => [...firingAlerts, ...pendingAlerts, ...inactiveAlerts],
    [firingAlerts, pendingAlerts, inactiveAlerts],
  )

  const sortedAMAlerts = useMemo(() => {
    const stateOrder: Record<string, number> = { active: 0, suppressed: 1, unprocessed: 2 }
    return [...amAlerts].sort((a, b) => {
      const aState = a.status?.state ?? 'unprocessed'
      const bState = b.status?.state ?? 'unprocessed'
      return (stateOrder[aState] ?? 3) - (stateOrder[bState] ?? 3)
    })
  }, [amAlerts])

  const activeSilences = useMemo(
    () => amSilences.filter(s => s.status.state === 'active' || s.status.state === 'pending'),
    [amSilences],
  )

  const formattedLastRefreshed = lastRefreshed ? lastRefreshed.toLocaleTimeString() : ''

  // Auto-select first alerting datasource
  useEffect(() => {
    if (alertingDatasources.length > 0 && !selectedDatasourceId) {
      setSelectedDatasourceId(alertingDatasources[0]!.id)
    }
  }, [alertingDatasources, selectedDatasourceId])

  const selectedDatasourceType = selectedDatasource?.type

  // Reset tab when datasource selection/type changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset when id/type change, not full object identity
  useEffect(() => {
    if (!selectedDatasourceType) return
    setActiveTab(selectedDatasourceType === 'alertmanager' ? 'am-alerts' : 'alerts')
    setAlerts([])
    setGroups([])
    setAmAlerts([])
    setAmSilences([])
    setAmReceivers([])
    setError(null)
    setExpandedGroups({})
    setExpandedAlertIdx(null)
  }, [selectedDatasourceId, selectedDatasourceType])

  const loadVMAlertData = useCallback(async (datasourceId: string) => {
    const [alertsRes, groupsRes] = await Promise.all([
      fetchVMAlerts(datasourceId),
      fetchVMAlertGroups(datasourceId),
    ])
    setAlerts(alertsRes.data?.alerts ?? [])
    setGroups(groupsRes.data?.groups ?? [])
  }, [])

  const loadAlertManagerData = useCallback(
    async (datasourceId: string) => {
      const [alertsRes, silencesRes, receiversRes] = await Promise.all([
        fetchAlertManagerAlerts(datasourceId, {
          active: amFilterActive,
          silenced: amFilterSilenced,
          inhibited: amFilterInhibited,
        }),
        fetchSilences(datasourceId),
        fetchReceivers(datasourceId),
      ])
      setAmAlerts(alertsRes ?? [])
      setAmSilences(silencesRes ?? [])
      setAmReceivers(receiversRes ?? [])
    },
    [amFilterActive, amFilterSilenced, amFilterInhibited],
  )

  const loadData = useCallback(async () => {
    if (!selectedDatasourceId || !selectedDatasource) return

    setLoading(true)
    setError(null)

    try {
      if (selectedDatasource.type === 'alertmanager') {
        await loadAlertManagerData(selectedDatasourceId)
      } else {
        await loadVMAlertData(selectedDatasourceId)
      }
      setLastRefreshed(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [selectedDatasourceId, selectedDatasource, loadAlertManagerData, loadVMAlertData])

  // Load when datasource is selected / type changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadData identity changes with filters; only reload on ds switch
  useEffect(() => {
    if (selectedDatasourceId && selectedDatasourceType) {
      void loadData()
    }
  }, [selectedDatasourceId, selectedDatasourceType])

  // Re-fetch AM alerts when filter toggles change (skip initial mount)
  const amFiltersReady = useRef(false)
  useEffect(() => {
    if (!amFiltersReady.current) {
      amFiltersReady.current = true
      return
    }
    if (!isAlertManager || !selectedDatasourceId) return

    let cancelled = false
    async function reloadFilters() {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchAlertManagerAlerts(selectedDatasourceId, {
          active: amFilterActive,
          silenced: amFilterSilenced,
          inhibited: amFilterInhibited,
        })
        if (!cancelled) {
          setAmAlerts(result)
          setLastRefreshed(new Date())
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch alerts')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void reloadFilters()
    return () => {
      cancelled = true
    }
  }, [amFilterActive, amFilterSilenced, amFilterInhibited, isAlertManager, selectedDatasourceId])

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      void loadData()
    }, 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, loadData])

  function toggleGroup(groupName: string) {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))
  }

  function openSilenceModal() {
    const now = new Date()
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    setSilenceMatchers([
      { key: `matcher-${Date.now()}`, name: '', value: '', isRegex: false, isEqual: true },
    ])
    setSilenceStart(toLocalDatetimeString(now))
    setSilenceEnd(toLocalDatetimeString(twoHoursLater))
    setSilenceCreatedBy(user?.email || user?.name || '')
    setSilenceComment('')
    setSilenceError(null)
    setShowSilenceModal(true)
  }

  async function handleCreateSilence() {
    setSilenceError(null)

    const validMatchers = silenceMatchers.filter(m => m.name.trim() !== '')
    if (validMatchers.length === 0) {
      setSilenceError('At least one matcher is required')
      return
    }
    if (!silenceComment.trim()) {
      setSilenceError('Comment is required')
      return
    }

    const startDate = new Date(silenceStart)
    const endDate = new Date(silenceEnd)
    if (endDate <= startDate) {
      setSilenceError('End time must be after start time')
      return
    }

    setSilenceSaving(true)
    try {
      await createSilence(selectedDatasourceId, {
        matchers: validMatchers.map(m => ({
          name: m.name.trim(),
          value: m.value.trim(),
          isRegex: m.isRegex,
          isEqual: m.isEqual,
        })),
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        createdBy: silenceCreatedBy.trim() || 'unknown',
        comment: silenceComment.trim(),
      })
      setShowSilenceModal(false)
      setAmSilences(await fetchSilences(selectedDatasourceId))
    } catch (e) {
      setSilenceError(e instanceof Error ? e.message : 'Failed to create silence')
    } finally {
      setSilenceSaving(false)
    }
  }

  async function handleExpireSilence(silenceId: string) {
    try {
      await expireSilence(selectedDatasourceId, silenceId)
      setAmSilences(await fetchSilences(selectedDatasourceId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to expire silence')
    }
  }

  const emptyDatasourceState =
    !selectedDatasourceId && alertingDatasources.length === 0 && !datasourcesLoading

  const showLoadingSkeleton =
    loading &&
    alerts.length === 0 &&
    groups.length === 0 &&
    amAlerts.length === 0 &&
    amSilences.length === 0

  return (
    <div className="mx-auto max-w-5xl px-8 py-6" style={{ color: 'var(--color-on-surface)' }}>
      <header
        className="mb-6 flex items-center justify-between gap-4 rounded-lg px-5 py-4"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div>
          <h1
            className="m-0 flex items-center gap-2 font-display text-base font-bold tracking-wide"
            style={{ color: 'var(--color-on-surface)' }}
          >
            <BellRing size={20} aria-hidden />
            Alerts
          </h1>
          <p className="mt-1 mb-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Monitor active alerts and alerting rule groups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedDatasourceId}
            onChange={e => setSelectedDatasourceId(e.target.value)}
            data-testid="alerts-datasource-select"
            className="appearance-none rounded-sm px-3 py-2 pr-8 text-sm focus:outline-none"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }}
            disabled={alertingDatasources.length === 0}
          >
            <option value="" disabled>
              {alertingDatasources.length === 0 ? 'No alerting datasources' : 'Select datasource'}
            </option>
            {alertingDatasources.map(ds => (
              <option key={ds.id} value={ds.id}>
                {ds.name} ({dataSourceTypeLabels[ds.type]})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
            }}
            data-testid="alerts-refresh-btn"
            disabled={!selectedDatasourceId || loading}
            onClick={() => void loadData()}
            title="Refresh"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw size={14} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: autoRefresh
                ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                : 'var(--color-surface-container-high)',
              color: autoRefresh ? 'var(--color-primary)' : 'var(--color-on-surface)',
              border: autoRefresh
                ? '1px solid var(--color-primary)'
                : '1px solid var(--color-outline-variant)',
            }}
            data-testid="alerts-auto-refresh-btn"
            disabled={!selectedDatasourceId}
            onClick={() => setAutoRefresh(v => !v)}
            title="Auto-refresh every 30s"
          >
            <Clock size={14} aria-hidden />
            Auto
          </button>
          {lastRefreshed ? (
            <span
              className="flex items-center gap-2 font-mono text-xs"
              style={{ color: 'var(--color-outline)' }}
            >
              {autoRefresh ? (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                />
              ) : null}
              {formattedLastRefreshed}
            </span>
          ) : null}
        </div>
      </header>

      {emptyDatasourceState ? (
        <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <BellOff size={48} style={{ color: 'var(--color-outline)' }} aria-hidden />
          <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            No alerting datasources configured
          </h3>
          <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Add a VMAlert or AlertManager datasource in Data Sources settings to view alerts.
          </p>
        </div>
      ) : error ? (
        <div
          className="mb-4 flex items-center gap-2 rounded-sm px-4 py-3 text-sm"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: 'var(--color-error)',
          }}
          data-testid="alerts-error"
        >
          <AlertCircle size={16} aria-hidden />
          {error}
        </div>
      ) : showLoadingSkeleton ? (
        <div className="flex flex-col gap-3 py-4" data-testid="alerts-loading">
          {['a', 'b', 'c', 'd', 'e'].map(row => (
            <div key={row} className="flex items-center gap-4">
              <div
                className="h-3.5 w-40 animate-pulse rounded"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              />
              <div
                className="h-3.5 w-15 animate-pulse rounded"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              />
              <div
                className="h-3.5 w-55 animate-pulse rounded"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              />
              <div
                className="h-3.5 w-32 animate-pulse rounded"
                style={{ backgroundColor: 'var(--color-surface-container-high)' }}
              />
            </div>
          ))}
        </div>
      ) : selectedDatasourceId && isVMAlert ? (
        <>
          <div
            className="mb-6 flex gap-1"
            style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
          >
            <button
              type="button"
              className="cursor-pointer bg-transparent px-4 py-2.5 text-sm font-medium transition"
              style={{
                color: activeTab === 'alerts' ? 'var(--color-primary)' : 'var(--color-outline)',
                borderBottom:
                  activeTab === 'alerts'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
              }}
              data-testid="alerts-tab-alerts"
              onClick={() => setActiveTab('alerts')}
            >
              Active Alerts
              {firingAlerts.length > 0 ? (
                <span
                  className="ml-1.5 rounded-sm px-2 py-0.5 font-mono text-xs"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
                    color: 'var(--color-error)',
                  }}
                >
                  {firingAlerts.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="cursor-pointer bg-transparent px-4 py-2.5 text-sm font-medium transition"
              style={{
                color: activeTab === 'groups' ? 'var(--color-primary)' : 'var(--color-outline)',
                borderBottom:
                  activeTab === 'groups'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
              }}
              data-testid="alerts-tab-groups"
              onClick={() => setActiveTab('groups')}
            >
              Rule Groups
              {groups.length > 0 ? (
                <span
                  className="ml-1.5 rounded-sm px-2 py-0.5 font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-outline)',
                  }}
                >
                  {groups.length}
                </span>
              ) : null}
            </button>
          </div>

          {activeTab === 'alerts' ? (
            <div>
              {firingAlerts.length > 0 ? (
                <AiAlertTriage
                  alertCount={firingAlerts.length}
                  alertNames={firingAlerts
                    .map(a => a.name)
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .slice(0, 5)}
                  className="mb-4"
                />
              ) : null}

              {sortedAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
                  <h3
                    className="m-0 text-lg font-semibold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    No alerts firing
                  </h3>
                  <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    All quiet -- no active or pending alerts.
                  </p>
                </div>
              ) : (
                <table className="w-full border-collapse" data-testid="alert-table">
                  <thead data-testid="alert-table-header">
                    <tr>
                      {['Status', 'Alert', 'Labels', 'Active Since'].map((label, i) => (
                        <th
                          key={label}
                          className={`px-4 py-3 text-xs font-semibold tracking-wider uppercase ${i === 3 ? 'text-right' : 'text-left'}`}
                          style={{ color: 'var(--color-outline)' }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAlerts.map((alert, idx) => {
                      const favoriteId = `alert::${selectedDatasourceId}::${alert.name}`
                      const favorited = isFavorite(favoriteId)
                      const rowKey = `${alert.name}|${alert.state}|${alert.activeAt}|${JSON.stringify(alert.labels ?? {})}`
                      return (
                        <AlertRow
                          key={rowKey}
                          alert={alert}
                          expanded={expandedAlertIdx === idx}
                          favorited={favorited}
                          onToggleExpand={() =>
                            setExpandedAlertIdx(prev => (prev === idx ? null : idx))
                          }
                          onToggleFavorite={() =>
                            toggleFavorite({
                              id: favoriteId,
                              title: alert.name,
                              type: 'alert',
                            })
                          }
                        />
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {activeTab === 'groups' ? (
            <div>
              {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
                  <h3
                    className="m-0 text-lg font-semibold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    No rule groups
                  </h3>
                  <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    No alerting or recording rule groups found.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {groups.map(group => {
                    const expanded = !!expandedGroups[group.name]
                    return (
                      <div
                        key={group.name}
                        className="overflow-hidden rounded-lg"
                        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                        data-testid="rule-group"
                      >
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-4 py-3 text-left transition hover:opacity-90"
                          onClick={() => toggleGroup(group.name)}
                        >
                          <div className="flex items-center gap-2">
                            {expanded ? (
                              <ChevronDown size={16} style={{ color: 'var(--color-outline)' }} />
                            ) : (
                              <ChevronRight size={16} style={{ color: 'var(--color-outline)' }} />
                            )}
                            <span
                              className="text-sm font-semibold"
                              style={{ color: 'var(--color-on-surface)' }}
                            >
                              {group.name}
                            </span>
                          </div>
                          <span
                            className="font-mono text-xs"
                            style={{ color: 'var(--color-outline)' }}
                          >
                            {group.rules.length} rule{group.rules.length !== 1 ? 's' : ''} · every{' '}
                            {formatInterval(group.interval)}
                          </span>
                        </button>

                        {expanded ? (
                          <div
                            className="px-4 py-3"
                            style={{ borderTop: '1px solid var(--color-outline-variant)' }}
                          >
                            <div className="flex flex-col">
                              {group.rules.map((rule, rIdx) => (
                                <div
                                  key={`${group.name}:${rule.name}:${rule.type}:${rule.query}:${rule.duration}`}
                                  className="py-3"
                                  style={
                                    rIdx > 0
                                      ? { borderTop: '1px solid var(--color-outline-variant)' }
                                      : undefined
                                  }
                                  data-testid="rule-item"
                                >
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span
                                      className="text-sm font-semibold"
                                      style={{ color: 'var(--color-on-surface)' }}
                                    >
                                      {rule.name}
                                    </span>
                                    <span
                                      className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase"
                                      style={{
                                        backgroundColor:
                                          rule.type === 'alerting'
                                            ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                                            : 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                                        color:
                                          rule.type === 'alerting'
                                            ? 'var(--color-error)'
                                            : 'var(--color-primary)',
                                      }}
                                    >
                                      {rule.type}
                                    </span>
                                    {rule.state ? (
                                      <span
                                        className="rounded-sm px-2 py-0.5 text-xs font-semibold"
                                        style={{
                                          backgroundColor:
                                            rule.state === 'firing'
                                              ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                                              : rule.state === 'pending'
                                                ? 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)'
                                                : 'var(--color-surface-container-high)',
                                          color:
                                            rule.state === 'firing'
                                              ? 'var(--color-error)'
                                              : rule.state === 'pending'
                                                ? 'var(--color-tertiary)'
                                                : 'var(--color-on-surface-variant)',
                                        }}
                                      >
                                        {rule.state}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div
                                    className="mb-2 overflow-x-auto rounded-sm px-3 py-2"
                                    style={{
                                      backgroundColor: 'var(--color-surface-container-high)',
                                    }}
                                  >
                                    <code
                                      className="font-mono text-xs break-all whitespace-pre-wrap"
                                      style={{ color: 'var(--color-on-surface-variant)' }}
                                    >
                                      {rule.query}
                                    </code>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {rule.duration > 0 ? (
                                      <span
                                        className="mr-1 text-xs"
                                        style={{ color: 'var(--color-outline)' }}
                                      >
                                        <strong>for:</strong> {formatDuration(rule.duration)}
                                      </span>
                                    ) : null}
                                    {Object.entries(rule.labels ?? {}).map(([key, value]) => (
                                      <span
                                        key={key}
                                        className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                                        style={{
                                          backgroundColor: 'var(--color-surface-container-high)',
                                          color: 'var(--color-on-surface-variant)',
                                        }}
                                      >
                                        {key}={value}
                                      </span>
                                    ))}
                                  </div>
                                  {rule.annotations && Object.keys(rule.annotations).length > 0 ? (
                                    <div
                                      className="mt-2 pt-2"
                                      style={{
                                        borderTop: '1px solid var(--color-outline-variant)',
                                      }}
                                    >
                                      {Object.entries(rule.annotations).map(([key, value]) => (
                                        <div
                                          key={key}
                                          className="text-xs leading-relaxed"
                                          style={{ color: 'var(--color-outline)' }}
                                        >
                                          <strong
                                            style={{ color: 'var(--color-on-surface-variant)' }}
                                          >
                                            {key}:
                                          </strong>{' '}
                                          {value}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : selectedDatasourceId && isAlertManager ? (
        <>
          <div
            className="mb-6 flex gap-1"
            style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
          >
            {(
              [
                ['am-alerts', 'Active Alerts', amAlerts.length, true],
                ['am-silences', 'Silences', activeSilences.length, false],
                ['am-receivers', 'Receivers', amReceivers.length, false],
              ] as const
            ).map(([tab, label, count, isError]) => (
              <button
                key={tab}
                type="button"
                className="cursor-pointer bg-transparent px-4 py-2.5 text-sm font-medium transition"
                style={{
                  color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-outline)',
                  borderBottom:
                    activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                }}
                data-testid={`alerts-tab-${tab}`}
                onClick={() => setActiveTab(tab)}
              >
                {label}
                {count > 0 ? (
                  <span
                    className="ml-1.5 rounded-sm px-2 py-0.5 font-mono text-xs"
                    style={{
                      backgroundColor: isError
                        ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                        : 'var(--color-surface-container-high)',
                      color: isError ? 'var(--color-error)' : 'var(--color-outline)',
                    }}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {activeTab === 'am-alerts' ? (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--color-outline)' }}>
                  Show:
                </span>
                {(
                  [
                    ['Active', amFilterActive, setAmFilterActive, 'alerts-filter-active-btn'],
                    [
                      'Silenced',
                      amFilterSilenced,
                      setAmFilterSilenced,
                      'alerts-filter-silenced-btn',
                    ],
                    [
                      'Inhibited',
                      amFilterInhibited,
                      setAmFilterInhibited,
                      'alerts-filter-inhibited-btn',
                    ],
                  ] as const
                ).map(([label, on, setOn, testId]) => (
                  <button
                    key={label}
                    type="button"
                    className="cursor-pointer rounded-sm px-2.5 py-1 text-xs transition"
                    style={{
                      backgroundColor: on
                        ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                        : 'var(--color-surface-container-high)',
                      color: on ? 'var(--color-primary)' : 'var(--color-outline)',
                      border: on
                        ? '1px solid var(--color-primary)'
                        : '1px solid var(--color-outline-variant)',
                    }}
                    data-testid={testId}
                    onClick={() => setOn(v => !v)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sortedAMAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
                  <h3
                    className="m-0 text-lg font-semibold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    No alerts
                  </h3>
                  <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    No alerts matching current filters.
                  </p>
                </div>
              ) : (
                <table className="w-full border-collapse" data-testid="am-alert-table">
                  <thead>
                    <tr>
                      {['Status', 'Alert', 'Severity', 'Started'].map((label, i) => (
                        <th
                          key={label}
                          className={`px-4 py-3 text-xs font-semibold tracking-wider uppercase ${i === 3 ? 'text-right' : 'text-left'}`}
                          style={{ color: 'var(--color-outline)' }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAMAlerts.map(alert => {
                      const favoriteId = alert.fingerprint
                        ? `alert::${selectedDatasourceId}::${alert.fingerprint}`
                        : null
                      const favorited = favoriteId ? isFavorite(favoriteId) : false
                      const rowKey =
                        alert.fingerprint ||
                        `${alert.labels?.alertname ?? 'alert'}|${alert.startsAt}|${alert.status?.state ?? ''}`
                      return (
                        <tr key={rowKey} className="transition-colors hover:opacity-90">
                          <td className="px-4 py-3">
                            <StatusDot
                              status={stateToStatusDot(alert.status?.state || '')}
                              size={8}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-sm font-semibold"
                                style={{ color: 'var(--color-on-surface)' }}
                              >
                                {alert.labels?.alertname || '--'}
                              </span>
                              {favoriteId ? (
                                <button
                                  type="button"
                                  className="shrink-0 cursor-pointer border-none bg-transparent p-0.5"
                                  title={favorited ? 'Remove from favorites' : 'Add to favorites'}
                                  onClick={() =>
                                    toggleFavorite({
                                      id: favoriteId,
                                      title: alert.labels?.alertname || 'Alert',
                                      type: 'alert',
                                    })
                                  }
                                >
                                  <Star
                                    size={12}
                                    fill={favorited ? 'currentColor' : 'none'}
                                    style={{
                                      color: favorited
                                        ? 'var(--color-primary)'
                                        : 'var(--color-outline)',
                                    }}
                                  />
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="font-mono text-xs"
                              style={{ color: 'var(--color-on-surface-variant)' }}
                            >
                              {alert.labels?.severity || 'none'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className="font-mono text-xs"
                              style={{ color: 'var(--color-outline)' }}
                            >
                              {formatDateShort(alert.startsAt)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {activeTab === 'am-silences' ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3
                  className="m-0 text-sm font-semibold"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  Silences
                </h3>
                <button
                  type="button"
                  data-testid="alerts-new-silence-btn"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                    color: '#fff',
                    border: 'none',
                  }}
                  onClick={openSilenceModal}
                >
                  <Plus size={14} aria-hidden />
                  New Silence
                </button>
              </div>

              {amSilences.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
                  <h3
                    className="m-0 text-lg font-semibold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    No silences
                  </h3>
                  <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    No silence rules configured.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {amSilences.map(silence => (
                    <div
                      key={silence.id}
                      className="rounded-lg p-4"
                      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                      data-testid="silence-card"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="shrink-0 font-mono text-xs"
                            style={{ color: 'var(--color-outline)' }}
                            title={silence.id}
                          >
                            {truncateId(silence.id)}
                          </span>
                          <StatusDot
                            status={
                              silence.status.state === 'active'
                                ? 'info'
                                : silence.status.state === 'pending'
                                  ? 'warning'
                                  : 'healthy'
                            }
                            size={6}
                          />
                          <span
                            className="text-xs font-semibold"
                            style={{ color: 'var(--color-on-surface-variant)' }}
                          >
                            {silence.status.state}
                          </span>
                        </div>
                        {silence.status.state === 'active' || silence.status.state === 'pending' ? (
                          <button
                            type="button"
                            className="inline-flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent text-sm transition"
                            style={{ color: 'var(--color-error)' }}
                            title="Expire silence"
                            data-testid={`expire-silence-${silence.id}`}
                            onClick={() => void handleExpireSilence(silence.id)}
                          >
                            <Trash2 size={12} aria-hidden />
                            Expire
                          </button>
                        ) : null}
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {silence.matchers.map(m => (
                          <span
                            key={`${m.name}${matcherOperator(m)}${m.value}`}
                            className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                            style={{
                              backgroundColor: 'var(--color-surface-container-high)',
                              color: 'var(--color-on-surface-variant)',
                            }}
                          >
                            {m.name}
                            {matcherOperator(m)}&quot;{m.value}&quot;
                          </span>
                        ))}
                      </div>
                      <div
                        className="flex items-center gap-3 text-xs"
                        style={{ color: 'var(--color-outline)' }}
                      >
                        <span>{silence.createdBy}</span>
                        <span className="max-w-[200px] truncate">{silence.comment}</span>
                        <span className="ml-auto shrink-0 font-mono">
                          ends {formatDateShort(silence.endsAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'am-receivers' ? (
            <div>
              {amReceivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <Radio size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
                  <h3
                    className="m-0 text-lg font-semibold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    No receivers
                  </h3>
                  <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                    No receivers configured in AlertManager.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {amReceivers.map(receiver => (
                    <div
                      key={receiver.name}
                      className="flex items-center gap-3 rounded-lg p-4"
                      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                      data-testid="receiver-card"
                    >
                      <Radio
                        size={16}
                        style={{ color: 'var(--color-outline)' }}
                        className="shrink-0"
                        aria-hidden
                      />
                      <span
                        className="text-sm font-semibold"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        {receiver.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {showSilenceModal
        ? createPortal(
            // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              onClick={e => {
                if (e.target === e.currentTarget) setShowSilenceModal(false)
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') setShowSilenceModal(false)
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="silence-modal-title"
                className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-lg"
                style={{
                  backgroundColor: 'var(--color-surface-bright)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
                >
                  <h2
                    id="silence-modal-title"
                    className="m-0 font-display text-base font-bold"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Create Silence
                  </h2>
                  <button
                    type="button"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition"
                    style={{ color: 'var(--color-outline)' }}
                    onClick={() => setShowSilenceModal(false)}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex flex-col gap-4 px-5 py-5">
                  <div className="flex flex-col gap-1.5">
                    <div
                      className="text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      Matchers <span style={{ color: 'var(--color-error)' }}>*</span>
                    </div>
                    <div className="mb-2 flex flex-col gap-2">
                      {silenceMatchers.map((m, idx) => (
                        <div key={m.key} className="flex items-center gap-2">
                          <input
                            value={m.name}
                            onChange={e => {
                              const next = [...silenceMatchers]
                              next[idx] = { ...m, name: e.target.value }
                              setSilenceMatchers(next)
                            }}
                            type="text"
                            placeholder="Label name"
                            data-testid={`silence-matcher-name-${idx}`}
                            className="flex-1 rounded-sm px-2.5 py-1.5 font-mono text-sm focus:outline-none"
                            style={{
                              backgroundColor: 'var(--color-surface-container-high)',
                              color: 'var(--color-on-surface)',
                              border: '1px solid var(--color-outline-variant)',
                            }}
                          />
                          <select
                            value={m.isEqual ? 'eq' : 'neq'}
                            onChange={e => {
                              const next = [...silenceMatchers]
                              next[idx] = { ...m, isEqual: e.target.value === 'eq' }
                              setSilenceMatchers(next)
                            }}
                            className="w-13 rounded-sm px-1.5 py-1.5 text-center font-mono text-sm focus:outline-none"
                            style={{
                              backgroundColor: 'var(--color-surface-container-high)',
                              color: 'var(--color-on-surface)',
                              border: '1px solid var(--color-outline-variant)',
                            }}
                          >
                            <option value="eq">{m.isRegex ? '=~' : '='}</option>
                            <option value="neq">{m.isRegex ? '!~' : '!='}</option>
                          </select>
                          <input
                            value={m.value}
                            onChange={e => {
                              const next = [...silenceMatchers]
                              next[idx] = { ...m, value: e.target.value }
                              setSilenceMatchers(next)
                            }}
                            type="text"
                            placeholder="Value"
                            data-testid={`silence-matcher-value-${idx}`}
                            className="flex-1 rounded-sm px-2.5 py-1.5 font-mono text-sm focus:outline-none"
                            style={{
                              backgroundColor: 'var(--color-surface-container-high)',
                              color: 'var(--color-on-surface)',
                              border: '1px solid var(--color-outline-variant)',
                            }}
                          />
                          <label
                            className="flex cursor-pointer items-center gap-1 text-xs whitespace-nowrap"
                            style={{ color: 'var(--color-outline)' }}
                            title="Regex match"
                          >
                            <input
                              type="checkbox"
                              checked={m.isRegex}
                              onChange={e => {
                                const next = [...silenceMatchers]
                                next[idx] = { ...m, isRegex: e.target.checked }
                                setSilenceMatchers(next)
                              }}
                              className="h-3.5 w-3.5"
                            />
                            Regex
                          </label>
                          <button
                            type="button"
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent transition disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ color: 'var(--color-outline)' }}
                            disabled={silenceMatchers.length <= 1}
                            onClick={() => {
                              if (silenceMatchers.length > 1) {
                                setSilenceMatchers(silenceMatchers.filter(item => item.key !== m.key))
                              }
                            }}
                            title="Remove matcher"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 self-start border-none bg-transparent text-sm transition"
                      style={{ color: 'var(--color-primary)' }}
                      onClick={() =>
                        setSilenceMatchers([
                          ...silenceMatchers,
                          {
                            key: `matcher-${Date.now()}-${silenceMatchers.length}`,
                            name: '',
                            value: '',
                            isRegex: false,
                            isEqual: true,
                          },
                        ])
                      }
                    >
                      <Plus size={12} aria-hidden />
                      Add Matcher
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="silence-start"
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        Start
                      </label>
                      <input
                        id="silence-start"
                        data-testid="silence-start-input"
                        value={silenceStart}
                        onChange={e => setSilenceStart(e.target.value)}
                        type="datetime-local"
                        className="rounded-sm px-3 py-2 text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--color-surface-container-high)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="silence-end"
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        End
                      </label>
                      <input
                        id="silence-end"
                        data-testid="silence-end-input"
                        value={silenceEnd}
                        onChange={e => setSilenceEnd(e.target.value)}
                        type="datetime-local"
                        className="rounded-sm px-3 py-2 text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--color-surface-container-high)',
                          color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)',
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="silence-created-by"
                      className="text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      Created By
                    </label>
                    <input
                      id="silence-created-by"
                      data-testid="silence-created-by-input"
                      value={silenceCreatedBy}
                      onChange={e => setSilenceCreatedBy(e.target.value)}
                      type="text"
                      placeholder="your-name@example.com"
                      className="rounded-sm px-3 py-2 text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-high)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="silence-comment"
                      className="text-sm font-medium"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      Comment <span style={{ color: 'var(--color-error)' }}>*</span>
                    </label>
                    <textarea
                      id="silence-comment"
                      data-testid="silence-comment-input"
                      value={silenceComment}
                      onChange={e => setSilenceComment(e.target.value)}
                      rows={3}
                      placeholder="Reason for silencing..."
                      className="min-h-[68px] resize-y rounded-sm px-3 py-2 text-sm focus:outline-none"
                      style={{
                        backgroundColor: 'var(--color-surface-container-high)',
                        color: 'var(--color-on-surface)',
                        border: '1px solid var(--color-outline-variant)',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  {silenceError ? (
                    <div
                      className="flex items-center gap-2 rounded-sm px-4 py-3 text-sm"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                        color: 'var(--color-error)',
                      }}
                      data-testid="silence-error"
                    >
                      <AlertCircle size={14} aria-hidden />
                      {silenceError}
                    </div>
                  ) : null}
                </div>

                <div
                  className="flex justify-end gap-2.5 px-5 py-4"
                  style={{ borderTop: '1px solid var(--color-outline-variant)' }}
                >
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface-variant)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                    data-testid="silence-cancel-btn"
                    onClick={() => setShowSilenceModal(false)}
                    disabled={silenceSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                      color: '#fff',
                      border: 'none',
                    }}
                    data-testid="silence-create-btn"
                    onClick={() => void handleCreateSilence()}
                    disabled={silenceSaving}
                  >
                    {silenceSaving ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : null}
                    {silenceSaving ? 'Creating...' : 'Create Silence'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

type AlertRowProps = {
  alert: VMAlertAlert
  expanded: boolean
  favorited: boolean
  onToggleExpand: () => void
  onToggleFavorite: () => void
}

function AlertRow({
  alert,
  expanded,
  favorited,
  onToggleExpand,
  onToggleFavorite,
}: AlertRowProps) {
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: expandable table row pattern */}
      <tr
        data-testid="alert-row"
        className="cursor-pointer transition-colors"
        style={{
          backgroundColor: expanded ? 'var(--color-surface-container-high)' : 'transparent',
        }}
        onClick={onToggleExpand}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleExpand()
          }
        }}
        role="button"
        tabIndex={0}
      >
        <td className="px-4 py-3">
          <StatusDot status={stateToStatusDot(alert.state)} size={8} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
              {alert.name}
            </span>
            <button
              type="button"
              className="shrink-0 cursor-pointer border-none bg-transparent p-0.5"
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
              onClick={e => {
                e.stopPropagation()
                onToggleFavorite()
              }}
            >
              <Star
                size={12}
                fill={favorited ? 'currentColor' : 'none'}
                style={{
                  color: favorited ? 'var(--color-primary)' : 'var(--color-outline)',
                }}
              />
            </button>
          </div>
        </td>
        <td className="px-4 py-3">
          {alert.labels && Object.keys(alert.labels).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(alert.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {key}={value}
                </span>
              ))}
            </div>
          ) : null}
        </td>
        <td className="px-4 py-3 text-right">
          <span className="font-mono text-xs" style={{ color: 'var(--color-outline)' }}>
            {alert.activeAt || '--'}
          </span>
        </td>
      </tr>
      {expanded ? (
        <tr data-testid="alert-detail">
          <td
            colSpan={4}
            className="px-4 py-4"
            style={{ backgroundColor: 'var(--color-surface-container-low)' }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-semibold tracking-wider uppercase"
                  style={{ color: 'var(--color-outline)' }}
                >
                  State
                </span>
                <span
                  className="rounded-sm px-2 py-0.5 font-mono text-xs font-semibold"
                  style={{
                    backgroundColor:
                      alert.state === 'firing'
                        ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                        : alert.state === 'pending'
                          ? 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)'
                          : 'var(--color-surface-container-high)',
                    color:
                      alert.state === 'firing'
                        ? 'var(--color-error)'
                        : alert.state === 'pending'
                          ? 'var(--color-tertiary)'
                          : 'var(--color-on-surface-variant)',
                  }}
                >
                  {alert.state}
                </span>
              </div>
              {alert.labels && Object.keys(alert.labels).length > 0 ? (
                <div>
                  <span
                    className="text-xs font-semibold tracking-wider uppercase"
                    style={{ color: 'var(--color-outline)' }}
                  >
                    Labels
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(alert.labels).map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                        style={{
                          backgroundColor: 'var(--color-surface-container-high)',
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        {key}={value}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="font-mono text-xs" style={{ color: 'var(--color-outline)' }}>
                Active since: {alert.activeAt || '--'}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
