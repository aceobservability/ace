import {
  AlertCircle,
  BellOff,
  BellRing,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createSilence,
  expireSilence,
  fetchAlertManagerAlerts,
  fetchAlertManagerStatus,
  fetchReceivers,
  fetchSilences,
} from '@/api/alertmanager'
import { fetchVMAlertGroups, fetchVMAlerts } from '@/api/vmalert'
import {
  AMAlertsPanel,
  AMConfigPanel,
  AMReceiversPanel,
  AMSilencesPanel,
} from '@/components/alerts/AlertManagerPanels'
import { RuleEditorPanel } from '@/components/alerts/RuleEditorPanel'
import { SilenceModal, type SilenceFormState } from '@/components/alerts/SilenceModal'
import { VMAlertAlertsPanel, VMAlertGroupsPanel } from '@/components/alerts/VMAlertPanels'
import { useAlertingDatasources } from '@/hooks/useAlertingDatasources'
import { toLocalDatetimeString } from '@/lib/alerts'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import {
  dataSourceTypeLabels,
  type AMAlert,
  type AMReceiver,
  type AMSilence,
  type AMStatus,
  type DataSource,
  type VMAlertAlert,
  type VMAlertRule,
  type VMAlertRuleGroup,
} from '@/types/datasource'

type ActiveTab =
  | 'alerts'
  | 'groups'
  | 'am-alerts'
  | 'am-silences'
  | 'am-receivers'
  | 'am-config'

function emptySilenceForm(createdBy: string): SilenceFormState {
  const now = new Date()
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  return {
    matchers: [
      { key: `matcher-${Date.now()}`, name: '', value: '', isRegex: false, isEqual: true },
    ],
    start: toLocalDatetimeString(now),
    end: toLocalDatetimeString(twoHoursLater),
    createdBy,
    comment: '',
  }
}

export function AlertsPage() {
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const user = useAuthStore(state => state.user)
  const { alertingDatasources, isLoading: datasourcesLoading } =
    useAlertingDatasources(currentOrgId)

  const toggleFavorite = useFavoritesStore(state => state.toggleFavorite)
  const isFavorite = useFavoritesStore(state => state.isFavorite)

  const [selectedDatasourceId, setSelectedDatasourceId] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('alerts')

  const [alerts, setAlerts] = useState<VMAlertAlert[]>([])
  const [groups, setGroups] = useState<VMAlertRuleGroup[]>([])
  const [amAlerts, setAmAlerts] = useState<AMAlert[]>([])
  const [amSilences, setAmSilences] = useState<AMSilence[]>([])
  const [amReceivers, setAmReceivers] = useState<AMReceiver[]>([])
  const [amStatus, setAmStatus] = useState<AMStatus | null>(null)
  const [amStatusError, setAmStatusError] = useState<string | null>(null)

  const [amFilterActive, setAmFilterActive] = useState(true)
  const [amFilterSilenced, setAmFilterSilenced] = useState(true)
  const [amFilterInhibited, setAmFilterInhibited] = useState(true)

  const [showSilenceModal, setShowSilenceModal] = useState(false)
  const [silenceDatasourceId, setSilenceDatasourceId] = useState('')
  const [silenceForm, setSilenceForm] = useState<SilenceFormState>(() =>
    emptySilenceForm(user?.email || user?.name || ''),
  )
  const [silenceSaving, setSilenceSaving] = useState(false)
  const [silenceError, setSilenceError] = useState<string | null>(null)

  const [editingRule, setEditingRule] = useState<{
    rule: VMAlertRule
    groupName: string
  } | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [expandedAlertIdx, setExpandedAlertIdx] = useState<number | null>(null)

  const loadGeneration = useRef(0)

  const selectedDatasource = useMemo<DataSource | undefined>(
    () => alertingDatasources.find(d => d.id === selectedDatasourceId),
    [alertingDatasources, selectedDatasourceId],
  )

  const isAlertManager = selectedDatasource?.type === 'alertmanager'
  const isVMAlert = selectedDatasource?.type === 'vmalert'
  const selectedDatasourceType = selectedDatasource?.type

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

  // Keep selection valid for the current org's datasource list (fixes org-switch stale selection).
  useEffect(() => {
    if (datasourcesLoading) return

    if (alertingDatasources.length === 0) {
      if (selectedDatasourceId) setSelectedDatasourceId('')
      return
    }

    const stillValid = alertingDatasources.some(ds => ds.id === selectedDatasourceId)
    if (!stillValid) {
      setSelectedDatasourceId(alertingDatasources[0]!.id)
    }
  }, [alertingDatasources, selectedDatasourceId, datasourcesLoading])

  // Clear page state when org changes so prior-org data never lingers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed only on org switch
  useEffect(() => {
    loadGeneration.current += 1
    setAlerts([])
    setGroups([])
    setAmAlerts([])
    setAmSilences([])
    setAmReceivers([])
    setAmStatus(null)
    setAmStatusError(null)
    setError(null)
    setExpandedGroups({})
    setExpandedAlertIdx(null)
    setEditingRule(null)
    setShowSilenceModal(false)
    setLastRefreshed(null)
  }, [currentOrgId])

  // Reset tab/data when datasource selection/type changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset when id/type change
  useEffect(() => {
    if (!selectedDatasourceType) return
    setActiveTab(selectedDatasourceType === 'alertmanager' ? 'am-alerts' : 'alerts')
    setAlerts([])
    setGroups([])
    setAmAlerts([])
    setAmSilences([])
    setAmReceivers([])
    setAmStatus(null)
    setAmStatusError(null)
    setError(null)
    setExpandedGroups({})
    setExpandedAlertIdx(null)
    setEditingRule(null)
  }, [selectedDatasourceId, selectedDatasourceType])

  const loadVMAlertData = useCallback(async (datasourceId: string) => {
    const [alertsRes, groupsRes] = await Promise.all([
      fetchVMAlerts(datasourceId),
      fetchVMAlertGroups(datasourceId),
    ])
    return {
      alerts: alertsRes.data?.alerts ?? [],
      groups: groupsRes.data?.groups ?? [],
    }
  }, [])

  const loadAlertManagerData = useCallback(
    async (datasourceId: string) => {
      const [alertsRes, silencesRes, receiversRes, statusRes] = await Promise.allSettled([
        fetchAlertManagerAlerts(datasourceId, {
          active: amFilterActive,
          silenced: amFilterSilenced,
          inhibited: amFilterInhibited,
        }),
        fetchSilences(datasourceId),
        fetchReceivers(datasourceId),
        fetchAlertManagerStatus(datasourceId),
      ])

      if (alertsRes.status === 'rejected') throw alertsRes.reason
      if (silencesRes.status === 'rejected') throw silencesRes.reason
      if (receiversRes.status === 'rejected') throw receiversRes.reason

      return {
        alerts: alertsRes.value ?? [],
        silences: silencesRes.value ?? [],
        receivers: receiversRes.value ?? [],
        status: statusRes.status === 'fulfilled' ? statusRes.value : null,
        statusError:
          statusRes.status === 'rejected'
            ? statusRes.reason instanceof Error
              ? statusRes.reason.message
              : 'Failed to fetch Alertmanager status'
            : null,
      }
    },
    [amFilterActive, amFilterSilenced, amFilterInhibited],
  )

  const loadData = useCallback(async () => {
    if (!selectedDatasourceId || !selectedDatasource) return

    const generation = ++loadGeneration.current
    setLoading(true)
    setError(null)

    try {
      if (selectedDatasource.type === 'alertmanager') {
        const data = await loadAlertManagerData(selectedDatasourceId)
        if (generation !== loadGeneration.current) return
        setAmAlerts(data.alerts)
        setAmSilences(data.silences)
        setAmReceivers(data.receivers)
        setAmStatus(data.status)
        setAmStatusError(data.statusError)
      } else {
        const data = await loadVMAlertData(selectedDatasourceId)
        if (generation !== loadGeneration.current) return
        setAlerts(data.alerts)
        setGroups(data.groups)
      }
      if (generation === loadGeneration.current) {
        setLastRefreshed(new Date())
      }
    } catch (e) {
      if (generation !== loadGeneration.current) return
      setError(e instanceof Error ? e.message : 'Failed to fetch data')
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false)
      }
    }
  }, [selectedDatasourceId, selectedDatasource, loadAlertManagerData, loadVMAlertData])

  // Load when datasource is selected / type changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadData identity changes with filters; only reload on ds switch
  useEffect(() => {
    if (selectedDatasourceId && selectedDatasourceType) {
      void loadData()
    }
  }, [selectedDatasourceId, selectedDatasourceType])

  // Re-fetch AM alerts only when filter toggles change — not on datasource switch
  // (that path is owned by loadData). Uses a dedicated generation so filter reloads
  // never discard a full load that also populates silences/receivers/status.
  const amFilterGeneration = useRef(0)
  const amFilterBaseline = useRef(`${amFilterActive}|${amFilterSilenced}|${amFilterInhibited}`)
  useEffect(() => {
    if (!isAlertManager || !selectedDatasourceId) return

    const filterKey = `${amFilterActive}|${amFilterSilenced}|${amFilterInhibited}`
    if (filterKey === amFilterBaseline.current) return
    amFilterBaseline.current = filterKey

    const generation = ++amFilterGeneration.current
    async function reloadFilters() {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchAlertManagerAlerts(selectedDatasourceId, {
          active: amFilterActive,
          silenced: amFilterSilenced,
          inhibited: amFilterInhibited,
        })
        if (generation !== amFilterGeneration.current) return
        setAmAlerts(result)
        setLastRefreshed(new Date())
      } catch (e) {
        if (generation !== amFilterGeneration.current) return
        setError(e instanceof Error ? e.message : 'Failed to fetch alerts')
      } finally {
        if (generation === amFilterGeneration.current) setLoading(false)
      }
    }
    void reloadFilters()
  }, [amFilterActive, amFilterSilenced, amFilterInhibited, isAlertManager, selectedDatasourceId])

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      void loadData()
    }, 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, loadData])

  function openSilenceModal() {
    // Capture the datasource at open time so a selector change while the modal
    // is open cannot create the silence against a different Alertmanager.
    setSilenceDatasourceId(selectedDatasourceId)
    setSilenceForm(emptySilenceForm(user?.email || user?.name || ''))
    setSilenceError(null)
    setShowSilenceModal(true)
  }

  async function handleCreateSilence() {
    const datasourceId = silenceDatasourceId || selectedDatasourceId
    if (!datasourceId) {
      setSilenceError('No Alertmanager datasource selected')
      return
    }
    setSilenceError(null)
    setSilenceSaving(true)
    try {
      const validMatchers = silenceForm.matchers.filter(m => m.name.trim() !== '')
      await createSilence(datasourceId, {
        matchers: validMatchers.map(m => ({
          name: m.name.trim(),
          value: m.value.trim(),
          isRegex: m.isRegex,
          isEqual: m.isEqual,
        })),
        startsAt: new Date(silenceForm.start).toISOString(),
        endsAt: new Date(silenceForm.end).toISOString(),
        createdBy: silenceForm.createdBy.trim() || 'unknown',
        comment: silenceForm.comment.trim(),
      })
      setShowSilenceModal(false)
      setSilenceDatasourceId('')
      if (selectedDatasourceId === datasourceId) {
        setAmSilences(await fetchSilences(datasourceId))
      }
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
    amSilences.length === 0 &&
    !amStatus

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
            Monitor active alerts, rule groups, silences, and Alertmanager configuration
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
          <TabBar
            tabs={[
              {
                id: 'alerts',
                label: 'Active Alerts',
                count: firingAlerts.length,
                emphasize: true,
              },
              {
                id: 'groups',
                label: 'Rule Groups',
                count: groups.length,
                emphasize: false,
              },
            ]}
            activeTab={activeTab}
            onChange={tab => setActiveTab(tab as ActiveTab)}
          />

          {activeTab === 'alerts' ? (
            <VMAlertAlertsPanel
              sortedAlerts={sortedAlerts}
              firingAlerts={firingAlerts}
              expandedAlertIdx={expandedAlertIdx}
              selectedDatasourceId={selectedDatasourceId}
              isFavorite={isFavorite}
              onToggleExpand={idx => setExpandedAlertIdx(prev => (prev === idx ? null : idx))}
              onToggleFavorite={(id, title) =>
                toggleFavorite({ id, title, type: 'alert' })
              }
            />
          ) : null}

          {activeTab === 'groups' ? (
            <VMAlertGroupsPanel
              groups={groups}
              expandedGroups={expandedGroups}
              onToggleGroup={name =>
                setExpandedGroups(prev => ({ ...prev, [name]: !prev[name] }))
              }
              onOpenRuleEditor={(rule, groupName) => setEditingRule({ rule, groupName })}
            />
          ) : null}
        </>
      ) : selectedDatasourceId && isAlertManager ? (
        <>
          <TabBar
            tabs={[
              { id: 'am-alerts', label: 'Active Alerts', count: amAlerts.length, emphasize: true },
              {
                id: 'am-silences',
                label: 'Silences',
                count: activeSilences.length,
                emphasize: false,
              },
              {
                id: 'am-receivers',
                label: 'Receivers',
                count: amReceivers.length,
                emphasize: false,
              },
              {
                id: 'am-config',
                label: 'Configuration',
                count: amStatus?.config?.original ? 1 : 0,
                emphasize: false,
              },
            ]}
            activeTab={activeTab}
            onChange={tab => setActiveTab(tab as ActiveTab)}
          />

          {activeTab === 'am-alerts' ? (
            <AMAlertsPanel
              sortedAMAlerts={sortedAMAlerts}
              selectedDatasourceId={selectedDatasourceId}
              amFilterActive={amFilterActive}
              amFilterSilenced={amFilterSilenced}
              amFilterInhibited={amFilterInhibited}
              isFavorite={isFavorite}
              onToggleFavorite={(id, title) => toggleFavorite({ id, title, type: 'alert' })}
              onFilterActive={setAmFilterActive}
              onFilterSilenced={setAmFilterSilenced}
              onFilterInhibited={setAmFilterInhibited}
            />
          ) : null}

          {activeTab === 'am-silences' ? (
            <AMSilencesPanel
              amSilences={amSilences}
              onNewSilence={openSilenceModal}
              onExpireSilence={id => void handleExpireSilence(id)}
            />
          ) : null}

          {activeTab === 'am-receivers' ? <AMReceiversPanel amReceivers={amReceivers} /> : null}

          {activeTab === 'am-config' ? (
            <AMConfigPanel status={amStatus} loading={loading} error={amStatusError} />
          ) : null}
        </>
      ) : null}

      {showSilenceModal ? (
        <SilenceModal
          form={silenceForm}
          saving={silenceSaving}
          error={silenceError}
          onChange={setSilenceForm}
          onClose={() => setShowSilenceModal(false)}
          onSubmit={() => void handleCreateSilence()}
        />
      ) : null}

      {editingRule ? (
        <RuleEditorPanel
          rule={editingRule.rule}
          groupName={editingRule.groupName}
          onClose={() => setEditingRule(null)}
        />
      ) : null}
    </div>
  )
}

type TabBarProps = {
  tabs: Array<{ id: string; label: string; count: number; emphasize: boolean }>
  activeTab: string
  onChange: (id: string) => void
}

function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div
      className="mb-6 flex flex-wrap gap-1"
      style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className="cursor-pointer bg-transparent px-4 py-2.5 text-sm font-medium transition"
          style={{
            color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-outline)',
            borderBottom:
              activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
          data-testid={`alerts-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count > 0 ? (
            <span
              className="ml-1.5 rounded-sm px-2 py-0.5 font-mono text-xs"
              style={{
                backgroundColor: tab.emphasize
                  ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                  : 'var(--color-surface-container-high)',
                color: tab.emphasize ? 'var(--color-error)' : 'var(--color-outline)',
              }}
            >
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
