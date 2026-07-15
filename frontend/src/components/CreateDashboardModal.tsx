import { Globe, Loader2, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { convertGrafanaDashboard } from '@/api/converter'
import { createDashboard, importDashboardYaml } from '@/api/dashboards'
import {
  connectToGrafana,
  getGrafanaDashboard,
  listGrafanaDashboards,
  type GrafanaDashboardSummary,
} from '@/api/grafanaDiscovery'
import { bulkCreateVariables } from '@/api/variables'
import { useDatasources } from '@/hooks/useDatasources'
import { useOrganization } from '@/hooks/useOrganization'
import type { ConversionReport } from '@/types/converter'

type CreationMode = 'create' | 'import' | 'grafana'
type ModalStep = 'choice' | 'form'
type GrafanaSubTab = 'upload' | 'connect'

type ImportPreview = {
  title: string
  description: string
  panelCount: number
}

type CreateDashboardModalProps = {
  initialMode?: CreationMode
  onClose: () => void
  onCreated: () => void
}

function normalizeYamlValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function buildYamlPreview(rawYaml: string): ImportPreview {
  const versionMatch = rawYaml.match(/(?:^|\n)version:\s*(.+)/)
  if (!versionMatch) {
    throw new Error('Missing version')
  }

  const titleMatch = rawYaml.match(/(?:^|\n)title:\s*(.+)/)
  if (!titleMatch) {
    throw new Error('Missing dashboard title')
  }

  const extractedTitle = normalizeYamlValue(titleMatch[1] ?? '')
  if (!extractedTitle) {
    throw new Error('Dashboard title is empty')
  }

  const descriptionMatch = rawYaml.match(/(?:^|\n)description:\s*(.+)/)
  const panelsSectionMatch = rawYaml.match(
    /(?:^|\n)panels:\s*\n([\s\S]*?)(?=\n[a-zA-Z_][\w-]*:\s*|\s*$)/,
  )
  const panelCount = (panelsSectionMatch?.[1]?.match(/(?:^|\n)\s{2}-\s+/g) ?? []).length

  return {
    title: extractedTitle,
    description: normalizeYamlValue(descriptionMatch?.[1] ?? ''),
    panelCount,
  }
}

export function CreateDashboardModal({
  initialMode = 'create',
  onClose,
  onCreated,
}: CreateDashboardModalProps) {
  const navigate = useNavigate()
  const { currentOrgId } = useOrganization()
  const { data: aceDatasources = [] } = useDatasources(currentOrgId)

  const [step, setStep] = useState<ModalStep>('choice')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<CreationMode>(initialMode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yamlFileName, setYamlFileName] = useState('')
  const [yamlContent, setYamlContent] = useState('')
  const [grafanaFileName, setGrafanaFileName] = useState('')
  const [grafanaSource, setGrafanaSource] = useState('')
  const [grafanaWarnings, setGrafanaWarnings] = useState<string[]>([])
  const [convertingGrafana, setConvertingGrafana] = useState(false)
  const [grafanaSubTab, setGrafanaSubTab] = useState<GrafanaSubTab>('upload')
  const [conversionReport, setConversionReport] = useState<ConversionReport | null>(null)
  const [grafanaUrl, setGrafanaUrl] = useState('')
  const [grafanaApiKey, setGrafanaApiKey] = useState('')
  const [grafanaConnecting, setGrafanaConnecting] = useState(false)
  const [grafanaConnected, setGrafanaConnected] = useState(false)
  const [grafanaVersion, setGrafanaVersion] = useState('')
  const [remoteDashboards, setRemoteDashboards] = useState<GrafanaDashboardSummary[]>([])
  const [loadingRemoteDashboard, setLoadingRemoteDashboard] = useState(false)
  const [grafanaDatasourceNames, setGrafanaDatasourceNames] = useState<string[]>([])
  const [datasourceMapping, setDatasourceMapping] = useState<Record<string, string>>({})
  const [convertedVariables, setConvertedVariables] = useState<
    Array<{
      name: string
      type: string
      label?: string
      query?: string
      multi: boolean
      include_all: boolean
    }>
  >([])
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

  const submitLabel = useMemo(() => {
    if (loading) {
      return mode === 'create' ? 'Creating...' : 'Importing...'
    }
    return mode === 'create' ? 'Create Dashboard' : 'Import Dashboard'
  }, [loading, mode])

  const canConvertGrafana =
    grafanaSource.trim().length > 0 && !convertingGrafana && !loading

  function setImportPreviewFromDocument(document: {
    title: string
    description?: string
    panels: unknown[]
  }) {
    setImportPreview({
      title: document.title,
      description: document.description ?? '',
      panelCount: document.panels.length,
    })
  }

  function clearImportState() {
    setYamlContent('')
    setYamlFileName('')
    setImportPreview(null)
    setGrafanaWarnings([])
  }

  function chooseBlank() {
    setStep('form')
    setMode('create')
  }

  function chooseAI() {
    onClose()
    navigate('/app/dashboards/new/ai')
  }

  function setModeAndClearError(nextMode: CreationMode) {
    setMode(nextMode)
    setError(null)
  }

  async function handleYamlFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    clearImportState()
    setError(null)

    if (!file) return

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.yaml') && !lowerName.endsWith('.yml')) {
      setError('Please upload a .yaml or .yml file')
      return
    }

    try {
      const content = await file.text()
      if (!content.trim()) {
        setError('YAML file is empty')
        return
      }

      setImportPreview(buildYamlPreview(content))
      setYamlContent(content)
      setYamlFileName(file.name)
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Expected dashboard document format'
      setError(`Invalid YAML file. ${reason}`)
    }
  }

  async function handleGrafanaFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setGrafanaSource('')
    setGrafanaFileName('')
    clearImportState()
    setError(null)

    if (!file) return

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.json')) {
      setError('Please upload a .json file')
      return
    }

    try {
      const content = await file.text()
      if (!content.trim()) {
        setError('Grafana JSON file is empty')
        return
      }
      setGrafanaSource(content)
      setGrafanaFileName(file.name)
    } catch {
      setError('Failed to read selected Grafana file')
    }
  }

  async function handleGrafanaConnect() {
    if (!grafanaUrl.trim()) {
      setError('Grafana URL is required')
      return
    }
    setGrafanaConnecting(true)
    setError(null)
    try {
      const resp = await connectToGrafana(grafanaUrl, grafanaApiKey)
      if (!resp.ok) {
        setError(resp.error || 'Failed to connect to Grafana')
        return
      }
      setGrafanaConnected(true)
      setGrafanaVersion(resp.version || '')
      setRemoteDashboards(await listGrafanaDashboards(grafanaUrl, grafanaApiKey))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setGrafanaConnecting(false)
    }
  }

  function extractGrafanaDatasources(jsonContent: string) {
    try {
      const parsed = JSON.parse(jsonContent) as {
        dashboard?: { panels?: Array<{ datasource?: string | { uid?: string; type?: string } }> }
        panels?: Array<{ datasource?: string | { uid?: string; type?: string } }>
      }
      const panels = parsed.dashboard?.panels ?? parsed.panels ?? []
      const names = new Set<string>()
      for (const panel of panels) {
        if (panel.datasource) {
          const name =
            typeof panel.datasource === 'string'
              ? panel.datasource
              : panel.datasource?.uid || panel.datasource?.type || ''
          if (name && name !== '-- Mixed --') names.add(name)
        }
      }
      setGrafanaDatasourceNames(Array.from(names))
    } catch {
      setGrafanaDatasourceNames([])
    }
  }

  async function convertGrafana(sourceOverride?: string) {
    if (!currentOrgId) {
      setError('No organization selected')
      return
    }

    // Prefer an explicit override so callers that just setGrafanaSource can
    // convert immediately without waiting for the async state update.
    const source = sourceOverride ?? grafanaSource
    if (!source.trim()) {
      setError('Paste or upload Grafana JSON before converting')
      return
    }

    setConvertingGrafana(true)
    setError(null)
    clearImportState()

    try {
      const response = await convertGrafanaDashboard(source, 'yaml')
      setYamlContent(response.content)
      setGrafanaWarnings(response.warnings)
      setConversionReport(response.report ?? null)
      setImportPreviewFromDocument(response.document)
      extractGrafanaDatasources(source)
      setConvertedVariables([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to convert Grafana dashboard')
    } finally {
      setConvertingGrafana(false)
    }
  }

  async function importRemoteDashboard(uid: string) {
    setLoadingRemoteDashboard(true)
    setError(null)
    try {
      const dashJson = await getGrafanaDashboard(uid, grafanaUrl, grafanaApiKey)
      setGrafanaSource(dashJson)
      setGrafanaFileName(`${uid}.json`)
      await convertGrafana(dashJson)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch dashboard')
    } finally {
      setLoadingRemoteDashboard(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!currentOrgId) {
      setError('No organization selected')
      return
    }

    if (mode === 'create' && !title.trim()) {
      setError('Title is required')
      return
    }

    if ((mode === 'import' || mode === 'grafana') && !importPreview) {
      setError(
        mode === 'grafana'
          ? 'Convert Grafana JSON before importing'
          : 'Upload a valid YAML file before importing',
      )
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (mode === 'create') {
        await createDashboard(currentOrgId, {
          title: title.trim(),
          description: description.trim() || undefined,
        })
      } else {
        const result = await importDashboardYaml(currentOrgId, yamlContent)

        if (mode === 'grafana' && convertedVariables.length > 0 && result?.id) {
          try {
            await bulkCreateVariables(
              result.id,
              convertedVariables.map((variable, index) => ({
                name: variable.name,
                type: variable.type,
                label: variable.label,
                query: variable.query,
                multi: variable.multi,
                include_all: variable.include_all,
                sort_order: index,
              })),
            )
          } catch {
            console.warn('Failed to persist imported variables')
          }
        }
      }
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create dashboard')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="create-dashboard-modal">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default border-none p-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-xl shadow-2xl"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-surface-container-highest) 85%, transparent)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        <header
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
        >
          <h2
            className="font-display text-lg font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Create Dashboard
          </h2>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition"
            style={{ color: 'var(--color-on-surface-variant)' }}
            data-testid="create-dashboard-close-btn"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        {step === 'choice' ? (
          <div className="px-6 py-6">
            <p className="mb-5 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Choose how to create your dashboard.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors"
                style={{
                  borderColor: 'var(--color-outline-variant)',
                  color: 'var(--color-on-surface)',
                  backgroundColor: 'var(--color-surface-container-low)',
                }}
                onClick={chooseBlank}
              >
                Blank Dashboard
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                }}
                onClick={chooseAI}
              >
                Generate with AI
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-4">
            <div
              className="mb-4 flex gap-1 rounded-lg p-1"
              style={{ backgroundColor: 'var(--color-surface-container)' }}
              role="tablist"
              aria-label="Creation mode"
            >
              <button
                type="button"
                className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition"
                style={{
                  backgroundColor:
                    mode === 'create' ? 'var(--color-surface-container-highest)' : 'transparent',
                  color:
                    mode === 'create'
                      ? 'var(--color-on-surface)'
                      : 'var(--color-on-surface-variant)',
                }}
                data-testid="create-mode-create-btn"
                disabled={loading}
                onClick={() => setModeAndClearError('create')}
              >
                Create New
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition"
                style={{
                  backgroundColor:
                    mode === 'import' ? 'var(--color-surface-container-highest)' : 'transparent',
                  color:
                    mode === 'import'
                      ? 'var(--color-on-surface)'
                      : 'var(--color-on-surface-variant)',
                }}
                data-testid="create-mode-import-btn"
                disabled={loading}
                onClick={() => setModeAndClearError('import')}
              >
                Import YAML
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition"
                style={{
                  backgroundColor:
                    mode === 'grafana' ? 'var(--color-surface-container-highest)' : 'transparent',
                  color:
                    mode === 'grafana'
                      ? 'var(--color-on-surface)'
                      : 'var(--color-on-surface-variant)',
                }}
                data-testid="create-mode-grafana-btn"
                disabled={loading}
                onClick={() => setModeAndClearError('grafana')}
              >
                Import Grafana
              </button>
            </div>

            {mode === 'create' ? (
              <>
                <div className="mb-5">
                  <label
                    htmlFor="title"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Title <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input
                    id="title"
                    data-testid="create-dashboard-title-input"
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    type="text"
                    placeholder="My Dashboard"
                    disabled={loading}
                    autoComplete="off"
                    className="w-full rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                    style={{
                      borderColor: 'var(--color-outline-variant)',
                      backgroundColor: 'var(--color-surface-container-low)',
                      color: 'var(--color-on-surface)',
                    }}
                  />
                </div>
                <div className="mb-5">
                  <label
                    htmlFor="description"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    data-testid="create-dashboard-description-input"
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    placeholder="Dashboard description (optional)"
                    rows={3}
                    disabled={loading}
                    className="min-h-[80px] w-full resize-y rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                    style={{
                      borderColor: 'var(--color-outline-variant)',
                      backgroundColor: 'var(--color-surface-container-low)',
                      color: 'var(--color-on-surface)',
                    }}
                  />
                </div>
              </>
            ) : null}

            {mode === 'import' ? (
              <>
                <div className="mb-5">
                  <label
                    htmlFor="yaml-file"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    YAML file <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input
                    id="yaml-file"
                    type="file"
                    accept=".yaml,.yml"
                    disabled={loading}
                    onChange={handleYamlFileChange}
                    className="w-full text-sm file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:transition"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  />
                  <p className="mt-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Upload an exported dashboard YAML to import it into this organization.
                  </p>
                </div>
                {importPreview ? (
                  <div
                    className="mb-5 rounded-lg p-3"
                    data-testid="yaml-preview"
                    style={{
                      backgroundColor: 'var(--color-surface-container)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    <p className="text-[0.8125rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                      <strong>Preview:</strong> {importPreview.title}
                    </p>
                    {importPreview.description ? (
                      <p
                        className="mt-1 text-[0.8125rem]"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {importPreview.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[0.8125rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {importPreview.panelCount} panel{importPreview.panelCount === 1 ? '' : 's'}
                    </p>
                    {yamlFileName ? (
                      <p className="mt-1 text-[0.8125rem]" style={{ color: 'var(--color-outline)' }}>
                        File: {yamlFileName}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {mode === 'grafana' ? (
              <>
                <div
                  className="mb-4 flex gap-1 rounded-lg p-1"
                  style={{ backgroundColor: 'var(--color-surface-container)' }}
                >
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition"
                    style={{
                      backgroundColor:
                        grafanaSubTab === 'upload'
                          ? 'var(--color-surface-container-highest)'
                          : 'transparent',
                      color:
                        grafanaSubTab === 'upload'
                          ? 'var(--color-on-surface)'
                          : 'var(--color-on-surface-variant)',
                    }}
                    onClick={() => setGrafanaSubTab('upload')}
                  >
                    <Upload size={14} /> Upload JSON
                  </button>
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition"
                    style={{
                      backgroundColor:
                        grafanaSubTab === 'connect'
                          ? 'var(--color-surface-container-highest)'
                          : 'transparent',
                      color:
                        grafanaSubTab === 'connect'
                          ? 'var(--color-on-surface)'
                          : 'var(--color-on-surface-variant)',
                    }}
                    onClick={() => setGrafanaSubTab('connect')}
                  >
                    <Globe size={14} /> Connect to Grafana
                  </button>
                </div>

                {grafanaSubTab === 'upload' ? (
                  <>
                    <div className="mb-5">
                      <label
                        htmlFor="grafana-file"
                        className="mb-2 block text-sm font-medium"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        Grafana JSON file
                      </label>
                      <input
                        id="grafana-file"
                        type="file"
                        accept=".json,application/json"
                        disabled={loading || convertingGrafana}
                        onChange={handleGrafanaFileChange}
                        className="w-full text-sm file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:transition"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      />
                    </div>
                    <div className="mb-5">
                      <label
                        htmlFor="grafana-source"
                        className="mb-2 block text-sm font-medium"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        Grafana JSON <span style={{ color: 'var(--color-error)' }}>*</span>
                      </label>
                      <textarea
                        id="grafana-source"
                        value={grafanaSource}
                        onChange={event => setGrafanaSource(event.target.value)}
                        rows={5}
                        disabled={loading || convertingGrafana}
                        placeholder="Paste Grafana dashboard JSON here"
                        data-testid="grafana-source"
                        className="min-h-[80px] w-full resize-y rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                        style={{
                          borderColor: 'var(--color-outline-variant)',
                          backgroundColor: 'var(--color-surface-container-low)',
                          color: 'var(--color-on-surface)',
                        }}
                      />
                      {grafanaFileName ? (
                        <p className="mt-2 text-xs" style={{ color: 'var(--color-outline)' }}>
                          File: {grafanaFileName}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="mb-3 cursor-pointer rounded-lg border px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        borderColor: 'var(--color-outline-variant)',
                        color: 'var(--color-on-surface)',
                      }}
                      disabled={!canConvertGrafana}
                      data-testid="grafana-convert"
                      onClick={() => void convertGrafana()}
                    >
                      {convertingGrafana ? 'Converting...' : 'Convert to Ace'}
                    </button>
                  </>
                ) : !grafanaConnected ? (
                      <div className="mb-4 space-y-4">
                        <div>
                          <label
                            htmlFor="create-dashboard-grafana-url"
                            className="mb-1.5 block text-sm font-medium"
                            style={{ color: 'var(--color-on-surface)' }}
                          >
                            Grafana URL <span style={{ color: 'var(--color-error)' }}>*</span>
                          </label>
                          <input
                            id="create-dashboard-grafana-url"
                            value={grafanaUrl}
                            onChange={event => setGrafanaUrl(event.target.value)}
                            type="url"
                            placeholder="https://grafana.example.com"
                            disabled={grafanaConnecting}
                            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                            style={{
                              borderColor: 'var(--color-outline-variant)',
                              backgroundColor: 'var(--color-surface-container-low)',
                              color: 'var(--color-on-surface)',
                            }}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="create-dashboard-grafana-api-key"
                            className="mb-1.5 block text-sm font-medium"
                            style={{ color: 'var(--color-on-surface)' }}
                          >
                            API Key{' '}
                            <span
                              className="text-xs font-normal"
                              style={{ color: 'var(--color-on-surface-variant)' }}
                            >
                              (optional)
                            </span>
                          </label>
                          <input
                            id="create-dashboard-grafana-api-key"
                            value={grafanaApiKey}
                            onChange={event => setGrafanaApiKey(event.target.value)}
                            type="password"
                            placeholder="glsa_..."
                            disabled={grafanaConnecting}
                            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                            style={{
                              borderColor: 'var(--color-outline-variant)',
                              backgroundColor: 'var(--color-surface-container-low)',
                              color: 'var(--color-on-surface)',
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="flex cursor-pointer items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50"
                          style={{
                            borderColor: 'var(--color-outline-variant)',
                            color: 'var(--color-on-surface)',
                          }}
                          disabled={grafanaConnecting || !grafanaUrl.trim()}
                          onClick={() => void handleGrafanaConnect()}
                        >
                          {grafanaConnecting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : null}
                          {grafanaConnecting ? 'Connecting...' : 'Connect'}
                        </button>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <div
                          className="mb-3 flex items-center gap-2 text-xs"
                          style={{ color: 'var(--color-secondary)' }}
                        >
                          Connected to Grafana {grafanaVersion}
                        </div>
                        {remoteDashboards.length === 0 ? (
                          <div
                            className="py-4 text-center text-sm"
                            style={{ color: 'var(--color-on-surface-variant)' }}
                          >
                            No dashboards found
                          </div>
                        ) : (
                          <div className="max-h-48 space-y-1 overflow-y-auto">
                            {remoteDashboards.map(dash => (
                              <button
                                key={dash.uid}
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition"
                                style={{
                                  backgroundColor: 'var(--color-surface-container)',
                                  color: 'var(--color-on-surface)',
                                  border: '1px solid var(--color-outline-variant)',
                                }}
                                disabled={loadingRemoteDashboard}
                                onClick={() => void importRemoteDashboard(dash.uid)}
                              >
                                <span className="flex-1 truncate">{dash.title}</span>
                                {dash.tags?.length ? (
                                  <span
                                    className="shrink-0 text-[10px]"
                                    style={{ color: 'var(--color-on-surface-variant)' }}
                                  >
                                    {dash.tags.slice(0, 2).join(', ')}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                {conversionReport ? (
                  <div
                    className="mb-4 rounded-lg p-3"
                    style={{
                      backgroundColor: 'var(--color-surface-container)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor:
                            conversionReport.fidelity_percent >= 80
                              ? 'rgba(79,175,120,0.12)'
                              : conversionReport.fidelity_percent >= 50
                                ? 'rgba(212,161,30,0.12)'
                                : 'rgba(217,92,84,0.12)',
                          color:
                            conversionReport.fidelity_percent >= 80
                              ? 'var(--color-secondary)'
                              : conversionReport.fidelity_percent >= 50
                                ? 'var(--color-tertiary)'
                                : 'var(--color-error)',
                        }}
                      >
                        {conversionReport.fidelity_percent}% fidelity
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {conversionReport.mapped_panels}/{conversionReport.total_panels} panels mapped
                      </span>
                      {conversionReport.variables_found > 0 ? (
                        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                          {conversionReport.variables_found} variables
                        </span>
                      ) : null}
                    </div>
                    {conversionReport.unsupported_panels > 0 ? (
                      <div className="text-xs" style={{ color: 'var(--color-tertiary)' }}>
                        {conversionReport.unsupported_panels} unsupported panel
                        {conversionReport.unsupported_panels > 1 ? 's' : ''} mapped to line chart
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {grafanaWarnings.length > 0 && !conversionReport ? (
                  <ul
                    className="mb-4 list-disc pl-5 text-[0.8rem]"
                    data-testid="grafana-warnings"
                    style={{ color: 'var(--color-warning)' }}
                  >
                    {grafanaWarnings.map(warning => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}

                {grafanaDatasourceNames.length > 0 && importPreview ? (
                  <div
                    className="mb-4 rounded-lg p-3"
                    style={{
                      backgroundColor: 'var(--color-surface-container)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    <p
                      className="mb-2 text-xs font-semibold"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      Datasource Mapping
                    </p>
                    <div className="space-y-2">
                      {grafanaDatasourceNames.map(dsName => (
                        <div key={dsName} className="flex items-center gap-2">
                          <span
                            className="w-1/3 truncate text-xs"
                            style={{ color: 'var(--color-on-surface-variant)' }}
                          >
                            {dsName}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
                            →
                          </span>
                          <select
                            value={datasourceMapping[dsName] ?? ''}
                            onChange={event =>
                              setDatasourceMapping(current => ({
                                ...current,
                                [dsName]: event.target.value,
                              }))
                            }
                            className="flex-1 rounded border px-2 py-1 text-xs focus:outline-none"
                            style={{
                              borderColor: 'var(--color-outline-variant)',
                              backgroundColor: 'var(--color-surface-container-low)',
                              color: 'var(--color-on-surface)',
                            }}
                          >
                            <option value="">Auto-detect</option>
                            {aceDatasources.map(ds => (
                              <option key={ds.id} value={ds.id}>
                                {ds.name} ({ds.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {importPreview ? (
                  <div
                    className="mb-5 rounded-lg p-3"
                    data-testid="yaml-preview"
                    style={{
                      backgroundColor: 'var(--color-surface-container)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    <p className="text-[0.8125rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                      <strong>Preview:</strong> {importPreview.title}
                    </p>
                    {importPreview.description ? (
                      <p
                        className="mt-1 text-[0.8125rem]"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {importPreview.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[0.8125rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {importPreview.panelCount} panel{importPreview.panelCount === 1 ? '' : 's'}
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}

            {error ? (
              <div
                className="mb-5 rounded-lg px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                  color: 'var(--color-error)',
                }}
              >
                {error}
              </div>
            ) : null}

            <div
              className="flex justify-end gap-3 pt-4"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <button
                type="button"
                data-testid="create-dashboard-cancel-btn"
                className="cursor-pointer rounded-lg border px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: 'var(--color-outline-variant)',
                  color: 'var(--color-on-surface)',
                }}
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="create-dashboard-submit-btn"
                className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                }}
                disabled={loading}
              >
                {submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}