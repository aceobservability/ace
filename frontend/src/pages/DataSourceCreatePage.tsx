import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Database,
  HeartPulse,
  Loader2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  createDataSource,
  fetchTraceDatasources,
  getDataSource,
  testDataSourceDraftConnection,
  updateDataSource,
} from '@/api/datasources'
import { useOrganization } from '@/hooks/useOrganization'
import { DataSourceTypeSections } from '@/components/datasourceForm/DataSourceTypeSections'
import {
  TYPE_OPTIONS,
  emptyAuthFields,
  inputClass,
  labelClass,
  sectionClass,
  selectClass,
  type AuthType,
} from '@/components/datasourceForm/formShared'
import {
  dataSourceTypeLabels,
  isAlertingType,
  isLogsType,
  isTracingType,
  type CreateDataSourceRequest,
  type DataSource,
  type DataSourceType,
  type TraceDatasource,
} from '@/types/datasource'

export function DataSourceCreatePage() {
  const { id: routeId } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { currentOrg } = useOrganization()

  const datasourceId = routeId && routeId.trim() !== '' ? routeId : null
  const isEditing = datasourceId !== null

  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<DataSourceType>('prometheus')
  const [formUrl, setFormUrl] = useState('')
  const [formIsDefault, setFormIsDefault] = useState(false)
  const [authFields, setAuthFields] = useState(emptyAuthFields)
  const [traceDatasources, setTraceDatasources] = useState<TraceDatasource[]>([])
  const [saveLoading, setSaveLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testSuccess, setTestSuccess] = useState<string | null>(null)
  const [lastTestedSignature, setLastTestedSignature] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(isEditing)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadedDatasourceOrgId, setLoadedDatasourceOrgId] = useState<string | null>(null)

  const isClickHouseType = formType === 'clickhouse'
  const isCloudWatchType = formType === 'cloudwatch'
  const isElasticsearchType = formType === 'elasticsearch'
  const showLogCorrelation = isLogsType(formType) && !isClickHouseType
  const showAuthSettings =
    (isTracingType(formType) ||
      isClickHouseType ||
      isElasticsearchType ||
      isAlertingType(formType)) &&
    !isCloudWatchType

  const formSignature = useMemo(
    () =>
      JSON.stringify({
        name: formName.trim(),
        type: formType,
        url: formUrl.trim(),
        isDefault: formIsDefault,
        ...authFields,
      }),
    [formName, formType, formUrl, formIsDefault, authFields],
  )

  const isTestStale =
    lastTestedSignature !== null && lastTestedSignature !== formSignature

  const pageTitle = isEditing ? 'Edit Data Source' : 'Add Data Source'
  const pageDescription = isEditing
    ? 'Update connection details, test connectivity, then save your changes.'
    : 'Configure connection details, test connectivity, then save.'
  const saveButtonText = saveLoading
    ? 'Saving...'
    : isEditing
      ? 'Save Changes'
      : 'Save Data Source'

  const activeOrgId = currentOrg?.id || loadedDatasourceOrgId || null

  const patchAuth = useCallback((patch: Partial<ReturnType<typeof emptyAuthFields>>) => {
    setAuthFields(prev => ({ ...prev, ...patch }))
  }, [])

  const hydrateForm = useCallback((ds: DataSource) => {
    setFormName(ds.name)
    setFormType(ds.type)
    setFormUrl(ds.url)
    setFormIsDefault(ds.is_default)
    setLoadedDatasourceOrgId(ds.organization_id)

    const authType = (ds.auth_type || 'none') as AuthType
    const cfg = ds.auth_config || {}
    setAuthFields({
      authType,
      basicUsername: typeof cfg.username === 'string' ? cfg.username : '',
      basicPassword: typeof cfg.password === 'string' ? cfg.password : '',
      bearerToken: typeof cfg.token === 'string' ? cfg.token : '',
      apiKeyHeader:
        typeof cfg.header === 'string' && cfg.header.trim() !== '' ? cfg.header : 'X-API-Key',
      apiKeyValue: typeof cfg.value === 'string' ? cfg.value : '',
      database: typeof cfg.database === 'string' ? cfg.database : '',
      cloudWatchRegion: typeof cfg.region === 'string' ? cfg.region : '',
      cloudWatchMetricNamespace:
        typeof cfg.metric_namespace === 'string' ? cfg.metric_namespace : '',
      cloudWatchLogGroup: typeof cfg.log_group === 'string' ? cfg.log_group : '',
      cloudWatchAccessKeyId: typeof cfg.access_key_id === 'string' ? cfg.access_key_id : '',
      cloudWatchSecretAccessKey:
        typeof cfg.secret_access_key === 'string' ? cfg.secret_access_key : '',
      cloudWatchSessionToken: typeof cfg.session_token === 'string' ? cfg.session_token : '',
      elasticsearchIndex: typeof cfg.index === 'string' ? cfg.index : '',
      elasticsearchTimestampField: typeof cfg.time_field === 'string' ? cfg.time_field : '',
      elasticsearchMessageField: typeof cfg.message_field === 'string' ? cfg.message_field : '',
      elasticsearchLevelField: typeof cfg.level_field === 'string' ? cfg.level_field : '',
      traceIdField: ds.trace_id_field || 'trace_id',
      linkedTraceDatasourceId: ds.linked_trace_datasource_id || null,
    })
    setFormError(null)
    setLoadError(null)
    setTestError(null)
    setTestSuccess(null)
    setLastTestedSignature(null)
  }, [])

  const loadDatasourceForEdit = useCallback(async () => {
    if (!isEditing || !datasourceId) {
      setFormName('')
      setFormType('prometheus')
      setFormUrl('')
      setFormIsDefault(false)
      setAuthFields(emptyAuthFields())
      setLoadedDatasourceOrgId(null)
      setPageLoading(false)
      setLoadError(null)
      return
    }

    setPageLoading(true)
    setLoadError(null)
    try {
      const ds = await getDataSource(datasourceId)
      hydrateForm(ds)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load datasource')
    } finally {
      setPageLoading(false)
    }
  }, [datasourceId, hydrateForm, isEditing])

  useEffect(() => {
    void loadDatasourceForEdit()
  }, [loadDatasourceForEdit])

  useEffect(() => {
    if (formType !== 'clickhouse') {
      patchAuth({ database: '' })
    }
    if (formType !== 'elasticsearch') {
      patchAuth({
        elasticsearchIndex: '',
        elasticsearchTimestampField: '',
        elasticsearchMessageField: '',
        elasticsearchLevelField: '',
      })
    }
    if (formType === 'cloudwatch') {
      setAuthFields(prev => {
        const region = prev.cloudWatchRegion.trim() || 'us-east-1'
        return {
          ...prev,
          authType: 'none',
          cloudWatchRegion: region,
        }
      })
      setFormUrl(prev => {
        if (prev.trim()) return prev
        return 'https://monitoring.us-east-1.amazonaws.com'
      })
      return
    }
    patchAuth({
      cloudWatchRegion: '',
      cloudWatchMetricNamespace: '',
      cloudWatchLogGroup: '',
      cloudWatchAccessKeyId: '',
      cloudWatchSecretAccessKey: '',
      cloudWatchSessionToken: '',
    })
  }, [formType, patchAuth])

  useEffect(() => {
    if (!showAuthSettings) {
      patchAuth({
        authType: 'none',
        basicUsername: '',
        basicPassword: '',
        bearerToken: '',
        apiKeyHeader: 'X-API-Key',
        apiKeyValue: '',
      })
    }
  }, [showAuthSettings, patchAuth])

  useEffect(() => {
    if (formType !== 'cloudwatch') return
    const region = authFields.cloudWatchRegion.trim() || 'us-east-1'
    setFormUrl(prev => {
      let hostname = ''
      try {
        hostname = new URL(prev.trim()).hostname
      } catch {
        /* invalid URL */
      }
      if (!prev.trim() || hostname.endsWith('.amazonaws.com')) {
        return `https://monitoring.${region}.amazonaws.com`
      }
      return prev
    })
  }, [authFields.cloudWatchRegion, formType])

  useEffect(() => {
    if (!showLogCorrelation || !activeOrgId) {
      setTraceDatasources([])
      if (!showLogCorrelation) {
        patchAuth({
          traceIdField: 'trace_id',
          linkedTraceDatasourceId: null,
        })
      }
      return
    }

    let cancelled = false
    void fetchTraceDatasources(activeOrgId, datasourceId || 'new')
      .then(list => {
        if (!cancelled) setTraceDatasources(list)
      })
      .catch(() => {
        if (!cancelled) setTraceDatasources([])
      })

    return () => {
      cancelled = true
    }
  }, [activeOrgId, datasourceId, patchAuth, showLogCorrelation])

  function buildAuthPayload() {
    if (isCloudWatchType) {
      if (!authFields.cloudWatchRegion.trim()) {
        throw new Error('CloudWatch region is required')
      }

      const cloudWatchConfig: Record<string, unknown> = {
        region: authFields.cloudWatchRegion.trim(),
      }

      const metricNamespace = authFields.cloudWatchMetricNamespace.trim()
      if (metricNamespace) cloudWatchConfig.metric_namespace = metricNamespace

      const logGroup = authFields.cloudWatchLogGroup.trim()
      if (logGroup) cloudWatchConfig.log_group = logGroup

      const accessKeyId = authFields.cloudWatchAccessKeyId.trim()
      const secretAccessKey = authFields.cloudWatchSecretAccessKey.trim()
      if (accessKeyId || secretAccessKey) {
        if (!accessKeyId || !secretAccessKey) {
          throw new Error('CloudWatch access key ID and secret access key must both be provided')
        }
        cloudWatchConfig.access_key_id = accessKeyId
        cloudWatchConfig.secret_access_key = secretAccessKey
      }

      const sessionToken = authFields.cloudWatchSessionToken.trim()
      if (sessionToken) cloudWatchConfig.session_token = sessionToken

      return {
        auth_type: 'none' as const,
        auth_config: cloudWatchConfig,
      }
    }

    if (!showAuthSettings || authFields.authType === 'none') {
      return {
        auth_type: 'none' as const,
        auth_config: undefined as Record<string, unknown> | undefined,
      }
    }

    if (authFields.authType === 'basic') {
      if (!authFields.basicUsername.trim()) {
        throw new Error('Basic auth username is required')
      }
      return {
        auth_type: 'basic' as const,
        auth_config: {
          username: authFields.basicUsername.trim(),
          password: authFields.basicPassword,
        },
      }
    }

    if (authFields.authType === 'bearer') {
      if (!authFields.bearerToken.trim()) {
        throw new Error('Bearer token is required')
      }
      return {
        auth_type: 'bearer' as const,
        auth_config: {
          token: authFields.bearerToken.trim(),
        },
      }
    }

    if (!authFields.apiKeyValue.trim()) {
      throw new Error('API key value is required')
    }

    return {
      auth_type: 'api_key' as const,
      auth_config: {
        header: authFields.apiKeyHeader.trim() || 'X-API-Key',
        value: authFields.apiKeyValue.trim(),
      },
    }
  }

  function buildCreatePayload(requireName: boolean): CreateDataSourceRequest {
    const trimmedName = formName.trim()
    if (requireName && !trimmedName) {
      throw new Error('Name is required')
    }

    let submitURL = formUrl.trim()
    if (isCloudWatchType && !submitURL && authFields.cloudWatchRegion.trim()) {
      submitURL = `https://monitoring.${authFields.cloudWatchRegion.trim()}.amazonaws.com`
      setFormUrl(submitURL)
    }

    if (!submitURL) {
      throw new Error('URL is required')
    }

    const authPayload = buildAuthPayload()
    const authConfig: Record<string, unknown> = authPayload.auth_config
      ? { ...authPayload.auth_config }
      : {}

    if (isClickHouseType) {
      const database = authFields.database.trim()
      if (database) authConfig.database = database
    }

    if (isElasticsearchType) {
      const index = authFields.elasticsearchIndex.trim()
      if (index) authConfig.index = index

      const timeField = authFields.elasticsearchTimestampField.trim()
      if (timeField) authConfig.time_field = timeField

      const messageField = authFields.elasticsearchMessageField.trim()
      if (messageField) authConfig.message_field = messageField

      const levelField = authFields.elasticsearchLevelField.trim()
      if (levelField) authConfig.level_field = levelField
    }

    const finalAuthConfig = Object.keys(authConfig).length > 0 ? authConfig : undefined

    const payload: CreateDataSourceRequest = {
      name: trimmedName || `Untitled ${dataSourceTypeLabels[formType]}`,
      type: formType,
      url: submitURL,
      is_default: formIsDefault,
      auth_type: authPayload.auth_type,
      auth_config: finalAuthConfig,
    }

    if (showLogCorrelation) {
      payload.trace_id_field = authFields.traceIdField.trim() || 'trace_id'
      payload.linked_trace_datasource_id = authFields.linkedTraceDatasourceId || null
    }

    return payload
  }

  async function handleTestConnection() {
    if (!activeOrgId) {
      setTestError('Select an organization before testing this datasource')
      setTestSuccess(null)
      return
    }

    setTestLoading(true)
    setTestError(null)
    setTestSuccess(null)

    try {
      const payload = buildCreatePayload(false)
      await testDataSourceDraftConnection(activeOrgId, payload)
      setLastTestedSignature(formSignature)
      setTestSuccess('Connection test succeeded')
    } catch (e) {
      setTestError(e instanceof Error ? e.message : 'Connection test failed')
      setLastTestedSignature(null)
    } finally {
      setTestLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveLoading(true)
    setFormError(null)

    try {
      const payload = buildCreatePayload(true)
      if (isEditing) {
        if (!datasourceId) throw new Error('Datasource id is required')
        await updateDataSource(datasourceId, payload)
      } else {
        if (!activeOrgId) {
          throw new Error('Select an organization before creating a datasource')
        }
        await createDataSource(activeOrgId, payload)
      }
      navigate('/app/settings/datasources')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save datasource')
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <header className="mb-6 flex flex-col gap-3">
        <Link
          to="/app/settings/datasources"
          className="flex w-fit cursor-pointer items-center gap-1 border-none bg-transparent text-sm text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)] no-underline"
        >
          <ArrowLeft size={16} />
          Back to Data Sources
        </Link>
        <div>
          <h1 className="m-0 font-display text-2xl font-bold text-[var(--color-on-surface)]">
            {pageTitle}
          </h1>
          <p className="m-0 mt-1 text-sm text-[var(--color-outline)]">{pageDescription}</p>
        </div>
      </header>

      {pageLoading ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-low)] px-3.5 py-3 text-sm text-[var(--color-outline)]">
          <Loader2 size={18} className="animate-spin" />
          <span>Loading datasource details...</span>
        </div>
      ) : null}

      {!pageLoading && loadError ? (
        <div className="mb-4 rounded-sm bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
          {loadError}
        </div>
      ) : null}

      {!pageLoading && !loadError ? (
        <form
          className="flex flex-col gap-4"
          data-testid="ds-create-form"
          onSubmit={e => void handleSave(e)}
        >
          <section className={sectionClass}>
            <h2 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">Basics</h2>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <div className="mb-4">
                <label htmlFor="ds-name" className={labelClass}>
                  Name <span className="text-[var(--color-error)]">*</span>
                </label>
                <input
                  id="ds-name"
                  data-testid="ds-name-input"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  type="text"
                  placeholder="My Prometheus"
                  disabled={saveLoading}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
              <div className="mb-4">
                <label htmlFor="ds-type" className={labelClass}>
                  Type
                </label>
                <select
                  id="ds-type"
                  data-testid="ds-type-select"
                  value={formType}
                  onChange={e => setFormType(e.target.value as DataSourceType)}
                  disabled={saveLoading}
                  className={selectClass}
                >
                  {TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-0">
              <label htmlFor="ds-url" className={labelClass}>
                URL <span className="text-[var(--color-error)]">*</span>
              </label>
              <input
                id="ds-url"
                data-testid="ds-url-input"
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                type="text"
                placeholder="http://localhost:9090"
                disabled={saveLoading}
                autoComplete="off"
                className={inputClass}
              />
            </div>
          </section>

          <DataSourceTypeSections
            saveLoading={saveLoading}
            isCloudWatchType={isCloudWatchType}
            isClickHouseType={isClickHouseType}
            isElasticsearchType={isElasticsearchType}
            showLogCorrelation={showLogCorrelation}
            showAuthSettings={showAuthSettings}
            authFields={authFields}
            patchAuth={patchAuth}
            traceDatasources={traceDatasources}
          />

          <section className={sectionClass}>
            <h2 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">
              Connection Test
            </h2>
            <p className="-mt-1 mb-3 text-xs text-[var(--color-outline)]">
              Run a connection test before saving to verify URL, auth, and datasource availability.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-sm border-none bg-[var(--color-surface-container-high)] px-4 py-2 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="ds-test-btn"
                disabled={testLoading || saveLoading}
                onClick={() => void handleTestConnection()}
              >
                {testLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <HeartPulse size={16} />
                )}
                {testLoading ? 'Testing...' : 'Test Connection'}
              </button>
              {testSuccess && !isTestStale ? (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-secondary)]/10 px-3 py-2 text-sm text-[var(--color-secondary)]">
                  <CheckCircle2 size={16} />
                  {testSuccess}
                </span>
              ) : null}
              {isTestStale ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-tertiary)]">
                  <CircleAlert size={16} />
                  Configuration changed since last successful test
                </span>
              ) : null}
              {!testSuccess && !isTestStale && testError ? (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
                  <CircleAlert size={16} />
                  {testError}
                </span>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg bg-[var(--color-surface-container-low)] px-6 py-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--color-on-surface)]">
              <input
                type="checkbox"
                checked={formIsDefault}
                onChange={e => setFormIsDefault(e.target.checked)}
                data-testid="ds-default-checkbox"
                disabled={saveLoading}
                className="h-4 w-4"
              />
              Set as default data source
            </label>
          </section>

          {formError ? (
            <div className="rounded-sm bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
              {formError}
            </div>
          ) : null}

          <footer className="flex justify-end gap-2.5 max-md:flex-col-reverse">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-sm border-none bg-[var(--color-surface-container-high)] px-4 py-2 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-50 max-md:w-full"
              data-testid="ds-cancel-btn"
              disabled={saveLoading}
              onClick={() => navigate('/app/settings/datasources')}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="ds-save-btn"
              className="inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 max-md:w-full"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
              }}
              disabled={saveLoading}
            >
              {saveLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Database size={16} />
              )}
              {saveButtonText}
            </button>
          </footer>
        </form>
      ) : null}
    </div>
  )
}
