import { ArrowLeft, Download, Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { convertGrafanaDashboard } from '@/api/converter'
import {
  exportDashboardYaml,
  getDashboard,
  replaceDashboardYaml,
  updateDashboard,
} from '@/api/dashboards'
import { DashboardPermissionsEditor } from '@/components/DashboardPermissionsEditor'
import { useOrganization } from '@/hooks/useOrganization'
import type { Dashboard } from '@/types/dashboard'
import { extractYamlTitleAndDescription, validateDashboardYaml } from '@/utils/dashboardYaml'

interface DashboardViewSettings {
  timeRangePreset: string
  refreshInterval: string
  variables: string[]
}

type SettingsSection = 'general' | 'yaml' | 'permissions'

const DASHBOARD_VIEW_SETTINGS_KEY = 'dashboard_view_settings'

const TIME_RANGE_OPTIONS = [
  { label: 'Last 5 minutes', value: '5m' },
  { label: 'Last 15 minutes', value: '15m' },
  { label: 'Last 30 minutes', value: '30m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
]

const REFRESH_OPTIONS = [
  { label: 'Off', value: 'off' },
  { label: '5s', value: '5s' },
  { label: '15s', value: '15s' },
  { label: '30s', value: '30s' },
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
]

const ALL_SECTIONS: Array<{ key: SettingsSection; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'yaml', label: 'YAML Editor' },
  { key: 'permissions', label: 'Permissions' },
]

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return value === 'general' || value === 'yaml' || value === 'permissions'
}

function dashboardLoadErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message === 'Not a member of this organization') {
    return 'You do not have permission to view this dashboard'
  }
  return 'Dashboard not found'
}

const FORBIDDEN_SETTINGS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function isDashboardSettingsKey(value: string): boolean {
  return value.length > 0 && !FORBIDDEN_SETTINGS_KEYS.has(value)
}

function readStoredDashboardSettings(): Record<string, DashboardViewSettings> {
  const rawSettings = localStorage.getItem(DASHBOARD_VIEW_SETTINGS_KEY)
  if (!rawSettings) {
    return Object.create(null) as Record<string, DashboardViewSettings>
  }

  try {
    const parsed = JSON.parse(rawSettings) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return Object.create(null) as Record<string, DashboardViewSettings>
    }

    const sanitized = Object.create(null) as Record<string, DashboardViewSettings>
    for (const [key, value] of Object.entries(parsed)) {
      if (!isDashboardSettingsKey(key) || !value || typeof value !== 'object') continue
      sanitized[key] = value as DashboardViewSettings
    }
    return sanitized
  } catch {
    return Object.create(null) as Record<string, DashboardViewSettings>
  }
}

function fileNameFromTitle(titleValue: string): string {
  const normalized = titleValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${normalized || 'dashboard'}.yaml`
}

export function DashboardSettingsPage() {
  const navigate = useNavigate()
  const { id: dashboardId = '', section: sectionParam } = useParams<{
    id: string
    section?: string
  }>()
  const { currentOrg, currentOrgId } = useOrganization()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [timeRangePreset, setTimeRangePreset] = useState('1h')
  const [refreshInterval, setRefreshInterval] = useState('off')
  const [variablesInput, setVariablesInput] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [isYamlSaving, setIsYamlSaving] = useState(false)
  const [isYamlLoading, setIsYamlLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isConvertingGrafana, setIsConvertingGrafana] = useState(false)

  const [actionError, setActionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [yamlValidationError, setYamlValidationError] = useState<string | null>(null)
  const [yamlContent, setYamlContent] = useState('')
  const [originalYamlContent, setOriginalYamlContent] = useState('')
  const [grafanaSource, setGrafanaSource] = useState('')
  const [grafanaWarnings, setGrafanaWarnings] = useState<string[]>([])
  const [showGrafanaReplace, setShowGrafanaReplace] = useState(false)

  // Permissions API requires org admin (see backend permissions.go).
  const canManagePermissions = Boolean(currentOrg && currentOrg.role === 'admin')
  const canEdit = Boolean(
    currentOrg && (currentOrg.role === 'admin' || currentOrg.role === 'editor'),
  )
  const permissionsOrgId = currentOrgId || dashboard?.organization_id || null

  const settingsSections = useMemo(() => {
    if (canManagePermissions) return ALL_SECTIONS
    return ALL_SECTIONS.filter((section) => section.key !== 'permissions')
  }, [canManagePermissions])

  const isSectionAllowed = useCallback(
    (value: string | undefined): value is SettingsSection => {
      if (!isSettingsSection(value)) return false
      if (value === 'permissions' && currentOrg && !canManagePermissions) return false
      return true
    },
    [canManagePermissions, currentOrg],
  )

  const activeSection: SettingsSection = isSectionAllowed(sectionParam) ? sectionParam : 'general'

  const parsedVariables = useMemo(
    () =>
      variablesInput
        .split(',')
        .map((variable) => variable.trim())
        .filter((variable) => variable.length > 0),
    [variablesInput],
  )

  const yamlDirty = yamlContent !== originalYamlContent

  const yamlDiffPreview = useMemo(() => {
    if (!yamlDirty) return [] as string[]

    const originalLines = originalYamlContent.split('\n')
    const updatedLines = yamlContent.split('\n')
    const maxLength = Math.max(originalLines.length, updatedLines.length)
    const preview: string[] = []

    for (let index = 0; index < maxLength; index += 1) {
      const originalLine = originalLines[index]
      const updatedLine = updatedLines[index]
      if (originalLine === updatedLine) continue

      if (typeof originalLine === 'string') {
        preview.push(`- ${originalLine}`)
      }
      if (typeof updatedLine === 'string') {
        preview.push(`+ ${updatedLine}`)
      }

      if (preview.length >= 16) break
    }

    return preview
  }, [originalYamlContent, yamlContent, yamlDirty])

  const sectionPath = useCallback(
    (section: SettingsSection): string => `/app/dashboards/${dashboardId}/settings/${section}`,
    [dashboardId],
  )

  function navigateToSection(section: SettingsSection) {
    if (section === activeSection) return
    setSuccessMessage(null)
    setActionError(null)
    navigate(sectionPath(section))
  }

  const applyStoredDashboardSettings = useCallback((id: string) => {
    const allSettings = readStoredDashboardSettings()
    const storedSettings = allSettings[id]
    setTimeRangePreset(storedSettings?.timeRangePreset || '1h')
    setRefreshInterval(storedSettings?.refreshInterval || 'off')
    setVariablesInput((storedSettings?.variables || []).join(', '))
  }, [])

  function persistDashboardViewSettings(settings: DashboardViewSettings) {
    if (!isDashboardSettingsKey(dashboardId)) return

    const allSettings = readStoredDashboardSettings()
    const nextSettings = Object.create(null) as Record<string, DashboardViewSettings>
    for (const [key, value] of Object.entries(allSettings)) {
      if (!isDashboardSettingsKey(key)) continue
      nextSettings[key] = value
    }
    nextSettings[dashboardId] = settings
    localStorage.setItem(DASHBOARD_VIEW_SETTINGS_KEY, JSON.stringify(nextSettings))
  }

  function resetFormState() {
    setActionError(null)
    setSuccessMessage(null)
    setYamlValidationError(null)
  }

  const loadDashboardYaml = useCallback(async (id: string) => {
    setIsYamlLoading(true)
    setYamlValidationError(null)

    try {
      const fileBlob = await exportDashboardYaml(id)
      const content = await fileBlob.text()
      setYamlContent(content)
      setOriginalYamlContent(content)
    } catch (cause) {
      setYamlValidationError(
        cause instanceof Error ? cause.message : 'Failed to load dashboard YAML',
      )
    } finally {
      setIsYamlLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!dashboardId) return

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const dashboardData = await getDashboard(dashboardId)
        if (cancelled) return

        setDashboard(dashboardData)
        setTitle(dashboardData.title)
        setDescription(dashboardData.description || '')
        applyStoredDashboardSettings(dashboardId)
        await loadDashboardYaml(dashboardId)
      } catch (cause) {
        if (cancelled) return
        setDashboard(null)
        setError(dashboardLoadErrorMessage(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [applyStoredDashboardSettings, dashboardId, loadDashboardYaml])

  useEffect(() => {
    if (!isSectionAllowed(sectionParam)) {
      navigate(sectionPath('general'), { replace: true })
    }
  }, [sectionParam, isSectionAllowed, navigate, sectionPath])

  async function saveGeneralSettings() {
    if (!dashboard || !canEdit || isSaving) return

    if (!title.trim()) {
      setActionError('Dashboard name is required')
      return
    }

    setIsSaving(true)
    resetFormState()

    try {
      await updateDashboard(dashboard.id, {
        title: title.trim(),
        description: description.trim() || undefined,
      })

      setDashboard({
        ...dashboard,
        title: title.trim(),
        description: description.trim() || undefined,
      })

      persistDashboardViewSettings({
        timeRangePreset,
        refreshInterval,
        variables: parsedVariables,
      })

      setSuccessMessage('Dashboard settings saved')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Failed to save dashboard settings')
    } finally {
      setIsSaving(false)
    }
  }

  async function saveYamlSettings() {
    if (!dashboard || !canEdit || isYamlSaving) return

    const validationError = validateDashboardYaml(yamlContent)
    setYamlValidationError(validationError)
    if (validationError) return

    const { title: nextTitle, description: nextDescription } = extractYamlTitleAndDescription(
      yamlContent,
      dashboard.title,
    )
    if (!nextTitle.trim()) {
      setYamlValidationError('Dashboard title is required')
      return
    }

    setIsYamlSaving(true)
    resetFormState()

    try {
      // Persist full dashboard body (title/description/panels) via replace-import.
      const updated = await replaceDashboardYaml(dashboard.id, yamlContent)

      const savedTitle = updated.title || nextTitle
      const savedDescription = updated.description ?? nextDescription

      setDashboard({
        ...dashboard,
        ...updated,
        title: savedTitle,
        description: savedDescription || undefined,
      })
      setTitle(savedTitle)
      setDescription(savedDescription)

      setOriginalYamlContent(yamlContent)
      setYamlValidationError(null)
      setSuccessMessage('Dashboard YAML saved')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Failed to save dashboard YAML')
    } finally {
      setIsYamlSaving(false)
    }
  }

  async function replaceWithGrafana() {
    if (!grafanaSource.trim() || isConvertingGrafana) return

    setIsConvertingGrafana(true)
    setActionError(null)
    setYamlValidationError(null)

    try {
      const response = await convertGrafanaDashboard(grafanaSource, 'yaml')
      setYamlContent(response.content)
      setGrafanaWarnings(response.warnings)
      setYamlValidationError(validateDashboardYaml(response.content))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Failed to convert Grafana dashboard')
    } finally {
      setIsConvertingGrafana(false)
    }
  }

  async function exportSettings() {
    if (!dashboard || isExporting) return

    setIsExporting(true)
    setActionError(null)

    try {
      const fileBlob = await exportDashboardYaml(dashboard.id)
      const objectUrl = URL.createObjectURL(fileBlob)
      const link = document.createElement('a')

      link.href = objectUrl
      link.download = fileNameFromTitle(dashboard.title)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)

      setSuccessMessage('Dashboard export downloaded')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Failed to export dashboard')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-6">
      <button
        type="button"
        className="mb-4 flex cursor-pointer items-center gap-1 border-none bg-transparent text-sm text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)]"
        data-testid="dashboard-settings-back-btn"
        title="Back to Dashboard"
        onClick={() => navigate(`/app/dashboards/${dashboardId}`)}
      >
        <ArrowLeft size={16} />
        <span>Back to dashboard</span>
      </button>

      <h1 className="font-display text-2xl font-bold text-[var(--color-on-surface)]">
        Dashboard Settings
      </h1>
      {dashboard && <p className="mt-1 text-sm text-[var(--color-outline)]">{dashboard.title}</p>}

      {loading ? (
        <div className="py-8 text-center text-[var(--color-outline)]">Loading...</div>
      ) : error ? (
        <div className="py-8 text-center text-[var(--color-error)]">{error}</div>
      ) : dashboard ? (
        <>
          <nav
            className="mt-6 mb-6 flex gap-1 border-b border-[color-mix(in_srgb,var(--color-outline-variant)_15%,transparent)]"
            data-testid="dashboard-settings-sidebar"
          >
            {settingsSections.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  activeSection === section.key
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-outline)] hover:text-[var(--color-on-surface)]'
                }`}
                data-testid={`settings-section-${section.key}`}
                onClick={() => navigateToSection(section.key)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-col gap-4">
            {!canEdit && activeSection !== 'permissions' && (
              <p className="m-0 rounded-sm bg-[var(--color-tertiary)]/10 px-4 py-3 text-sm text-[var(--color-tertiary)]">
                You have view-only access. Settings are visible, but only editors and admins can
                save changes.
              </p>
            )}

            {activeSection === 'general' && (
              <section className="rounded-lg bg-[var(--color-surface-container-low)] p-6">
                <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-[var(--color-on-surface)]">
                  <Settings size={18} /> General
                </h2>

                <div className="grid gap-4">
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="dashboard-name"
                      className="text-sm font-medium text-[var(--color-on-surface-variant)]"
                    >
                      Name
                    </label>
                    <input
                      id="dashboard-name"
                      data-testid="dashboard-name-input"
                      type="text"
                      value={title}
                      autoComplete="off"
                      disabled={!canEdit || isSaving}
                      className="w-full rounded-sm border-none bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] transition placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <label
                      htmlFor="dashboard-description"
                      className="text-sm font-medium text-[var(--color-on-surface-variant)]"
                    >
                      Description
                    </label>
                    <textarea
                      id="dashboard-description"
                      data-testid="dashboard-description-input"
                      rows={3}
                      value={description}
                      disabled={!canEdit || isSaving}
                      placeholder="Optional dashboard description"
                      className="min-h-[100px] w-full resize-y rounded-sm border-none bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] transition placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <label
                      htmlFor="dashboard-time-range"
                      className="text-sm font-medium text-[var(--color-on-surface-variant)]"
                    >
                      Default time range
                    </label>
                    <select
                      id="dashboard-time-range"
                      data-testid="dashboard-time-range-select"
                      value={timeRangePreset}
                      disabled={!canEdit || isSaving}
                      className="w-full rounded-sm border-none bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] transition focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      onChange={(event) => setTimeRangePreset(event.target.value)}
                    >
                      {TIME_RANGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-1.5">
                    <label
                      htmlFor="dashboard-refresh"
                      className="text-sm font-medium text-[var(--color-on-surface-variant)]"
                    >
                      Refresh interval
                    </label>
                    <select
                      id="dashboard-refresh"
                      data-testid="dashboard-refresh-select"
                      value={refreshInterval}
                      disabled={!canEdit || isSaving}
                      className="w-full rounded-sm border-none bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] transition focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      onChange={(event) => setRefreshInterval(event.target.value)}
                    >
                      {REFRESH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-1.5">
                    <label
                      htmlFor="dashboard-variables"
                      className="text-sm font-medium text-[var(--color-on-surface-variant)]"
                    >
                      Variable names (comma-separated)
                    </label>
                    <input
                      id="dashboard-variables"
                      type="text"
                      value={variablesInput}
                      disabled={!canEdit || isSaving}
                      placeholder="env, cluster, instance"
                      className="w-full rounded-sm border-none bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] transition placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      onChange={(event) => setVariablesInput(event.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-surface-container-high)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="dashboard-export-yaml-btn"
                    disabled={isExporting}
                    onClick={() => void exportSettings()}
                  >
                    <Download size={14} />
                    <span>{isExporting ? 'Exporting...' : 'Export YAML'}</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-sm px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
                    }}
                    data-testid="save-dashboard-settings"
                    disabled={!canEdit || isSaving}
                    onClick={() => void saveGeneralSettings()}
                  >
                    {isSaving ? 'Saving...' : 'Save settings'}
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'yaml' && (
              <section className="rounded-lg bg-[var(--color-surface-container-low)] p-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="m-0 font-display text-base font-semibold text-[var(--color-on-surface)]">
                    Dashboard YAML
                  </h2>
                  <button
                    type="button"
                    className="rounded-sm bg-[var(--color-surface-container-high)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isConvertingGrafana || isYamlSaving}
                    data-testid="grafana-replace-toggle"
                    onClick={() => setShowGrafanaReplace((current) => !current)}
                  >
                    {showGrafanaReplace ? 'Hide Grafana replace' : 'Replace with Grafana'}
                  </button>
                </div>

                <p className="mb-4 m-0 text-sm text-[var(--color-outline)]">
                  Edit dashboard YAML directly. Validation runs as you type and shows required
                  schema fields.
                </p>

                {isYamlLoading ? (
                  <p className="m-0 text-sm text-[var(--color-outline)]">
                    Loading current dashboard YAML...
                  </p>
                ) : (
                  <div className="mb-4 overflow-hidden rounded-lg bg-[var(--color-surface-container-high)]">
                    <textarea
                      value={yamlContent}
                      className="min-h-[320px] w-full resize-y border-none bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--color-on-surface)] focus:outline-none"
                      data-testid="yaml-editor-input"
                      spellCheck={false}
                      readOnly={!canEdit || isYamlSaving}
                      onChange={(event) => {
                        const next = event.target.value
                        setYamlContent(next)
                        setYamlValidationError(validateDashboardYaml(next))
                      }}
                    />
                  </div>
                )}

                {showGrafanaReplace && (
                  <div
                    className="mb-4 grid gap-3 rounded-lg bg-[var(--color-surface-container-high)] p-4"
                    data-testid="grafana-replace-panel"
                  >
                    <label
                      htmlFor="grafana-replace-source"
                      className="text-sm font-medium text-[var(--color-on-surface-variant)]"
                    >
                      Grafana JSON
                    </label>
                    <textarea
                      id="grafana-replace-source"
                      value={grafanaSource}
                      rows={5}
                      placeholder="Paste Grafana dashboard JSON"
                      className="min-h-[100px] w-full resize-y rounded-sm border-none bg-[var(--color-surface-bright)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] transition placeholder:text-[var(--color-outline)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="grafana-source"
                      disabled={isConvertingGrafana || isYamlSaving}
                      onChange={(event) => setGrafanaSource(event.target.value)}
                    />
                    <button
                      type="button"
                      className="justify-self-start rounded-sm bg-[var(--color-surface-bright)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-container-highest)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!grafanaSource.trim() || isConvertingGrafana || isYamlSaving}
                      data-testid="grafana-replace-convert"
                      onClick={() => void replaceWithGrafana()}
                    >
                      {isConvertingGrafana ? 'Converting...' : 'Convert to YAML'}
                    </button>
                    {grafanaWarnings.length > 0 && (
                      <ul
                        className="m-0 pl-5 text-xs text-[var(--color-tertiary)]"
                        data-testid="grafana-warnings"
                      >
                        {grafanaWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {yamlDiffPreview.length > 0 && (
                  <div
                    className="mb-4 rounded-lg bg-[var(--color-surface-container-high)] p-4"
                    data-testid="yaml-diff-preview"
                  >
                    <h4 className="mb-2 m-0 font-mono text-xs uppercase tracking-[0.07em] text-[var(--color-outline)]">
                      Diff preview
                    </h4>
                    <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-snug text-[var(--color-on-surface)]">
                      {yamlDiffPreview.join('\n')}
                    </pre>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-surface-container-high)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isExporting}
                    onClick={() => void exportSettings()}
                  >
                    <Download size={14} />
                    <span>{isExporting ? 'Exporting...' : 'Export YAML'}</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-sm px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
                    }}
                    data-testid="save-dashboard-yaml"
                    disabled={!canEdit || isYamlSaving}
                    onClick={() => void saveYamlSettings()}
                  >
                    {isYamlSaving ? 'Saving YAML...' : 'Save YAML'}
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'permissions' && (
              <section
                className="rounded-lg bg-[var(--color-surface-container-low)] p-6"
                data-testid="permissions-settings-panel"
              >
                <h2 className="mb-2 m-0 font-display text-base font-semibold text-[var(--color-on-surface)]">
                  Permissions
                </h2>
                <p className="mb-4 m-0 text-sm text-[var(--color-outline)]">
                  Manage who can view, edit, or administer this dashboard.
                </p>
                {permissionsOrgId ? (
                  <DashboardPermissionsEditor dashboard={dashboard} orgId={permissionsOrgId} />
                ) : (
                  <p className="rounded-sm px-4 py-3 text-sm text-[var(--color-outline)]">
                    Permissions are unavailable until organization context is loaded.
                  </p>
                )}
              </section>
            )}

            {actionError && (
              <p className="m-0 rounded-sm bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]">
                {actionError}
              </p>
            )}
            {yamlValidationError && (
              <p
                className="m-0 rounded-sm bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]"
                data-testid="yaml-validation-error"
              >
                {yamlValidationError}
              </p>
            )}
            {successMessage && (
              <p className="m-0 rounded-sm bg-[var(--color-secondary)]/10 px-4 py-3 text-sm text-[var(--color-secondary)]">
                {successMessage}
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
