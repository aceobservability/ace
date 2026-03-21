<script setup lang="ts">
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Database,
  HeartPulse,
  Loader2,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchTraceDatasources, getDataSource, testDataSourceDraftConnection } from '../api/datasources'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import type { CreateDataSourceRequest, DataSource, DataSourceType, TraceDatasource } from '../types/datasource'
import { dataSourceTypeLabels, isAlertingType, isLogsType, isTracingType } from '../types/datasource'

const route = useRoute()
const router = useRouter()
const { currentOrg } = useOrganization()
const { addDatasource, editDatasource } = useDatasource()

const formName = ref('')
const formType = ref<DataSourceType>('prometheus')
const formUrl = ref('')
const formIsDefault = ref(false)
const formAuthType = ref<'none' | 'basic' | 'bearer' | 'api_key'>('none')
const formBasicUsername = ref('')
const formBasicPassword = ref('')
const formBearerToken = ref('')
const formApiKeyHeader = ref('X-API-Key')
const formApiKeyValue = ref('')
const formDatabase = ref('')
const formCloudWatchRegion = ref('')
const formCloudWatchMetricNamespace = ref('')
const formCloudWatchLogGroup = ref('')
const formCloudWatchAccessKeyId = ref('')
const formCloudWatchSecretAccessKey = ref('')
const formCloudWatchSessionToken = ref('')
const formElasticsearchIndex = ref('')
const formElasticsearchTimestampField = ref('')
const formElasticsearchMessageField = ref('')
const formElasticsearchLevelField = ref('')
const formTraceIdField = ref('trace_id')
const formLinkedTraceDatasourceId = ref<string | null>(null)
const traceDatasources = ref<TraceDatasource[]>([])

const saveLoading = ref(false)
const testLoading = ref(false)
const formError = ref<string | null>(null)
const testError = ref<string | null>(null)
const testSuccess = ref<string | null>(null)
const lastTestedSignature = ref<string | null>(null)
const pageLoading = ref(false)
const loadError = ref<string | null>(null)
const loadedDatasourceOrgId = ref<string | null>(null)

const datasourceId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' && id.trim() !== '' ? id : null
})

const isEditing = computed(() => datasourceId.value !== null)

const pageTitle = computed(() => (isEditing.value ? 'Edit Data Source' : 'Add Data Source'))
const pageDescription = computed(() =>
  isEditing.value
    ? 'Update connection details, test connectivity, then save your changes.'
    : 'Configure connection details, test connectivity, then save.',
)
const saveButtonText = computed(() =>
  saveLoading.value ? 'Saving...' : isEditing.value ? 'Save Changes' : 'Save Data Source',
)

const isClickHouseType = computed(() => formType.value === 'clickhouse')
const isCloudWatchType = computed(() => formType.value === 'cloudwatch')
const isElasticsearchType = computed(() => formType.value === 'elasticsearch')
const isVMAlertType = computed(() => formType.value === 'vmalert')
const showLogCorrelation = computed(() => isLogsType(formType.value) && !isClickHouseType.value)
const showAuthSettings = computed(
  () =>
    (isTracingType(formType.value) ||
      isClickHouseType.value ||
      isElasticsearchType.value ||
      isAlertingType(formType.value)) &&
    !isCloudWatchType.value,
)

const formSignature = computed(() =>
  JSON.stringify({
    name: formName.value.trim(),
    type: formType.value,
    url: formUrl.value.trim(),
    isDefault: formIsDefault.value,
    authType: formAuthType.value,
    basicUsername: formBasicUsername.value.trim(),
    basicPassword: formBasicPassword.value,
    bearerToken: formBearerToken.value,
    apiKeyHeader: formApiKeyHeader.value.trim(),
    apiKeyValue: formApiKeyValue.value,
    database: formDatabase.value.trim(),
    cloudwatchRegion: formCloudWatchRegion.value.trim(),
    cloudwatchMetricNamespace: formCloudWatchMetricNamespace.value.trim(),
    cloudwatchLogGroup: formCloudWatchLogGroup.value.trim(),
    cloudwatchAccessKeyId: formCloudWatchAccessKeyId.value.trim(),
    cloudwatchSecretAccessKey: formCloudWatchSecretAccessKey.value,
    cloudwatchSessionToken: formCloudWatchSessionToken.value,
    elasticsearchIndex: formElasticsearchIndex.value.trim(),
    elasticsearchTimestampField: formElasticsearchTimestampField.value.trim(),
    elasticsearchMessageField: formElasticsearchMessageField.value.trim(),
    elasticsearchLevelField: formElasticsearchLevelField.value.trim(),
  }),
)

const isTestStale = computed(
  () => lastTestedSignature.value !== null && lastTestedSignature.value !== formSignature.value,
)

function resetAuthForm() {
  formAuthType.value = 'none'
  formBasicUsername.value = ''
  formBasicPassword.value = ''
  formBearerToken.value = ''
  formApiKeyHeader.value = 'X-API-Key'
  formApiKeyValue.value = ''
  formDatabase.value = ''
  formCloudWatchRegion.value = ''
  formCloudWatchMetricNamespace.value = ''
  formCloudWatchLogGroup.value = ''
  formCloudWatchAccessKeyId.value = ''
  formCloudWatchSecretAccessKey.value = ''
  formCloudWatchSessionToken.value = ''
  formElasticsearchIndex.value = ''
  formElasticsearchTimestampField.value = ''
  formElasticsearchMessageField.value = ''
  formElasticsearchLevelField.value = ''
  formTraceIdField.value = 'trace_id'
  formLinkedTraceDatasourceId.value = null
}

function resetCreateForm() {
  formName.value = ''
  formType.value = 'prometheus'
  formUrl.value = ''
  formIsDefault.value = false
  resetAuthForm()
  formError.value = null
  testError.value = null
  testSuccess.value = null
  loadError.value = null
  loadedDatasourceOrgId.value = null
  lastTestedSignature.value = null
}

function hydrateAuthForm(ds: DataSource) {
  resetAuthForm()

  const authType = (ds.auth_type || 'none') as 'none' | 'basic' | 'bearer' | 'api_key'
  formAuthType.value = authType

  const authConfig = ds.auth_config || {}
  const username = authConfig.username
  const password = authConfig.password
  const token = authConfig.token
  const header = authConfig.header
  const value = authConfig.value
  const database = authConfig.database
  const region = authConfig.region
  const metricNamespace = authConfig.metric_namespace
  const logGroup = authConfig.log_group
  const accessKeyId = authConfig.access_key_id
  const secretAccessKey = authConfig.secret_access_key
  const sessionToken = authConfig.session_token
  const index = authConfig.index
  const timeField = authConfig.time_field
  const messageField = authConfig.message_field
  const levelField = authConfig.level_field

  if (typeof username === 'string') {
    formBasicUsername.value = username
  }
  if (typeof password === 'string') {
    formBasicPassword.value = password
  }
  if (typeof token === 'string') {
    formBearerToken.value = token
  }
  if (typeof header === 'string' && header.trim() !== '') {
    formApiKeyHeader.value = header
  }
  if (typeof value === 'string') {
    formApiKeyValue.value = value
  }
  if (typeof database === 'string') {
    formDatabase.value = database
  }
  if (typeof region === 'string') {
    formCloudWatchRegion.value = region
  }
  if (typeof metricNamespace === 'string') {
    formCloudWatchMetricNamespace.value = metricNamespace
  }
  if (typeof logGroup === 'string') {
    formCloudWatchLogGroup.value = logGroup
  }
  if (typeof accessKeyId === 'string') {
    formCloudWatchAccessKeyId.value = accessKeyId
  }
  if (typeof secretAccessKey === 'string') {
    formCloudWatchSecretAccessKey.value = secretAccessKey
  }
  if (typeof sessionToken === 'string') {
    formCloudWatchSessionToken.value = sessionToken
  }
  if (typeof index === 'string') {
    formElasticsearchIndex.value = index
  }
  if (typeof timeField === 'string') {
    formElasticsearchTimestampField.value = timeField
  }
  if (typeof messageField === 'string') {
    formElasticsearchMessageField.value = messageField
  }
  if (typeof levelField === 'string') {
    formElasticsearchLevelField.value = levelField
  }
}

function hydrateForm(ds: DataSource) {
  formName.value = ds.name
  formType.value = ds.type
  formUrl.value = ds.url
  formIsDefault.value = ds.is_default
  hydrateAuthForm(ds)
  formTraceIdField.value = ds.trace_id_field || 'trace_id'
  formLinkedTraceDatasourceId.value = ds.linked_trace_datasource_id || null
  loadedDatasourceOrgId.value = ds.organization_id
  formError.value = null
  loadError.value = null
  testError.value = null
  testSuccess.value = null
  lastTestedSignature.value = null
}

function activeOrgId(): string | null {
  return currentOrg.value?.id || loadedDatasourceOrgId.value || null
}

async function loadDatasourceForEdit() {
  if (!isEditing.value || !datasourceId.value) {
    resetCreateForm()
    pageLoading.value = false
    return
  }

  pageLoading.value = true
  loadError.value = null
  try {
    const ds = await getDataSource(datasourceId.value)
    hydrateForm(ds)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load datasource'
  } finally {
    pageLoading.value = false
  }
}

async function loadTraceDatasources() {
  const orgId = activeOrgId()
  if (!orgId || !showLogCorrelation.value) {
    traceDatasources.value = []
    return
  }

  try {
    traceDatasources.value = await fetchTraceDatasources(orgId, datasourceId.value || 'new')
  } catch {
    traceDatasources.value = []
  }
}

function buildAuthPayload() {
  if (isCloudWatchType.value) {
    if (!formCloudWatchRegion.value.trim()) {
      throw new Error('CloudWatch region is required')
    }

    const cloudWatchConfig: Record<string, unknown> = {
      region: formCloudWatchRegion.value.trim(),
    }

    const metricNamespace = formCloudWatchMetricNamespace.value.trim()
    if (metricNamespace) {
      cloudWatchConfig.metric_namespace = metricNamespace
    }

    const logGroup = formCloudWatchLogGroup.value.trim()
    if (logGroup) {
      cloudWatchConfig.log_group = logGroup
    }

    const accessKeyId = formCloudWatchAccessKeyId.value.trim()
    const secretAccessKey = formCloudWatchSecretAccessKey.value.trim()
    if (accessKeyId || secretAccessKey) {
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('CloudWatch access key ID and secret access key must both be provided')
      }
      cloudWatchConfig.access_key_id = accessKeyId
      cloudWatchConfig.secret_access_key = secretAccessKey
    }

    const sessionToken = formCloudWatchSessionToken.value.trim()
    if (sessionToken) {
      cloudWatchConfig.session_token = sessionToken
    }

    return {
      auth_type: 'none' as const,
      auth_config: cloudWatchConfig,
    }
  }

  if (!showAuthSettings.value || formAuthType.value === 'none') {
    return {
      auth_type: 'none' as const,
      auth_config: undefined,
    }
  }

  if (formAuthType.value === 'basic') {
    if (!formBasicUsername.value.trim()) {
      throw new Error('Basic auth username is required')
    }

    return {
      auth_type: 'basic' as const,
      auth_config: {
        username: formBasicUsername.value.trim(),
        password: formBasicPassword.value,
      },
    }
  }

  if (formAuthType.value === 'bearer') {
    if (!formBearerToken.value.trim()) {
      throw new Error('Bearer token is required')
    }

    return {
      auth_type: 'bearer' as const,
      auth_config: {
        token: formBearerToken.value.trim(),
      },
    }
  }

  if (!formApiKeyValue.value.trim()) {
    throw new Error('API key value is required')
  }

  return {
    auth_type: 'api_key' as const,
    auth_config: {
      header: formApiKeyHeader.value.trim() || 'X-API-Key',
      value: formApiKeyValue.value.trim(),
    },
  }
}

function buildCreatePayload(requireName: boolean): CreateDataSourceRequest {
  const trimmedName = formName.value.trim()
  if (requireName && !trimmedName) {
    throw new Error('Name is required')
  }

  let submitURL = formUrl.value.trim()
  if (isCloudWatchType.value && !submitURL && formCloudWatchRegion.value.trim()) {
    submitURL = `https://monitoring.${formCloudWatchRegion.value.trim()}.amazonaws.com`
    formUrl.value = submitURL
  }

  if (!submitURL) {
    throw new Error('URL is required')
  }

  const authPayload = buildAuthPayload()
  const authConfig: Record<string, unknown> = authPayload.auth_config
    ? { ...authPayload.auth_config }
    : {}

  if (isClickHouseType.value) {
    const database = formDatabase.value.trim()
    if (database) {
      authConfig.database = database
    }
  }

  if (isElasticsearchType.value) {
    const index = formElasticsearchIndex.value.trim()
    if (index) {
      authConfig.index = index
    }

    const timeField = formElasticsearchTimestampField.value.trim()
    if (timeField) {
      authConfig.time_field = timeField
    }

    const messageField = formElasticsearchMessageField.value.trim()
    if (messageField) {
      authConfig.message_field = messageField
    }

    const levelField = formElasticsearchLevelField.value.trim()
    if (levelField) {
      authConfig.level_field = levelField
    }
  }

  const finalAuthConfig = Object.keys(authConfig).length > 0 ? authConfig : undefined

  const payload: CreateDataSourceRequest = {
    name: trimmedName || `Untitled ${dataSourceTypeLabels[formType.value]}`,
    type: formType.value,
    url: submitURL,
    is_default: formIsDefault.value,
    auth_type: authPayload.auth_type,
    auth_config: finalAuthConfig,
  }

  if (showLogCorrelation.value) {
    payload.trace_id_field = formTraceIdField.value.trim() || 'trace_id'
    payload.linked_trace_datasource_id = formLinkedTraceDatasourceId.value || null
  }

  return payload
}

async function handleTestConnection() {
  const orgId = activeOrgId()
  if (!orgId) {
    testError.value = 'Select an organization before testing this datasource'
    testSuccess.value = null
    return
  }

  testLoading.value = true
  testError.value = null
  testSuccess.value = null

  try {
    const payload = buildCreatePayload(false)
    await testDataSourceDraftConnection(orgId, payload)
    lastTestedSignature.value = formSignature.value
    testSuccess.value = 'Connection test succeeded'
  } catch (e) {
    testError.value = e instanceof Error ? e.message : 'Connection test failed'
    lastTestedSignature.value = null
  } finally {
    testLoading.value = false
  }
}

async function handleSave() {
  saveLoading.value = true
  formError.value = null

  try {
    const payload = buildCreatePayload(true)
    if (isEditing.value) {
      if (!datasourceId.value) {
        throw new Error('Datasource id is required')
      }
      await editDatasource(datasourceId.value, payload)
    } else {
      const orgId = activeOrgId()
      if (!orgId) {
        throw new Error('Select an organization before creating a datasource')
      }
      await addDatasource(orgId, payload)
    }
    router.push('/datasources')
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Failed to save datasource'
  } finally {
    saveLoading.value = false
  }
}

watch(formType, (type_) => {
  if (type_ !== 'clickhouse') {
    formDatabase.value = ''
  }

  if (type_ !== 'elasticsearch') {
    formElasticsearchIndex.value = ''
    formElasticsearchTimestampField.value = ''
    formElasticsearchMessageField.value = ''
    formElasticsearchLevelField.value = ''
  }

  if (type_ === 'cloudwatch') {
    formAuthType.value = 'none'
    if (!formCloudWatchRegion.value.trim()) {
      formCloudWatchRegion.value = 'us-east-1'
    }
    if (!formUrl.value.trim()) {
      formUrl.value = `https://monitoring.${formCloudWatchRegion.value}.amazonaws.com`
    }
    return
  }

  formCloudWatchRegion.value = ''
  formCloudWatchMetricNamespace.value = ''
  formCloudWatchLogGroup.value = ''
  formCloudWatchAccessKeyId.value = ''
  formCloudWatchSecretAccessKey.value = ''
  formCloudWatchSessionToken.value = ''
})

watch(formCloudWatchRegion, (region) => {
  if (!isCloudWatchType.value) {
    return
  }

  if (!formUrl.value.trim() || formUrl.value.includes('.amazonaws.com')) {
    const resolvedRegion = region.trim() || 'us-east-1'
    formUrl.value = `https://monitoring.${resolvedRegion}.amazonaws.com`
  }
})

watch(formType, () => {
  if (!showAuthSettings.value) {
    formAuthType.value = 'none'
    formBasicUsername.value = ''
    formBasicPassword.value = ''
    formBearerToken.value = ''
    formApiKeyHeader.value = 'X-API-Key'
    formApiKeyValue.value = ''
  }
})

watch(showLogCorrelation, (show) => {
  if (show) {
    loadTraceDatasources()
  } else {
    traceDatasources.value = []
    formTraceIdField.value = 'trace_id'
    formLinkedTraceDatasourceId.value = null
  }
})

resetCreateForm()

onMounted(() => {
  loadDatasourceForEdit()
  if (showLogCorrelation.value) {
    loadTraceDatasources()
  }
})

watch(
  () => route.params.id,
  () => {
    loadDatasourceForEdit()
  },
)
</script>

<template>
  <div class="px-8 py-6 max-w-3xl mx-auto">
    <header class="flex flex-col gap-3 mb-6">
      <button
        class="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition w-fit border-none bg-transparent cursor-pointer"
        @click="router.push('/datasources')"
      >
        <ArrowLeft :size="16" />
        Back to Data Sources
      </button>
      <div>
        <h1 class="text-2xl font-bold text-text-primary m-0">{{ pageTitle }}</h1>
        <p class="text-sm text-text-muted mt-1 m-0">{{ pageDescription }}</p>
      </div>
    </header>

    <div v-if="pageLoading" class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-3.5 py-3 text-sm text-text-muted mb-4">
      <Loader2 :size="18" class="animate-spin" />
      <span>Loading datasource details...</span>
    </div>

    <div v-else-if="loadError" class="rounded-sm bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-sm text-rose-500 mb-4">
      {{ loadError }}
    </div>

    <form v-else class="flex flex-col gap-4" data-testid="ds-create-form" @submit.prevent="handleSave">
      <section class="rounded border border-border bg-surface-raised p-6">
        <h2 class="text-sm font-semibold text-text-primary mb-3 mt-0">Basics</h2>
        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <div class="mb-4">
            <label for="ds-name" class="block text-sm font-medium text-text-primary mb-1.5">Name <span class="text-rose-500">*</span></label>
            <input
              id="ds-name"
              data-testid="ds-name-input"
              v-model="formName"
              type="text"
              placeholder="My Prometheus"
              :disabled="saveLoading"
              autocomplete="off"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
            />
          </div>

          <div class="mb-4">
            <label for="ds-type" class="block text-sm font-medium text-text-primary mb-1.5">Type</label>
            <select
              id="ds-type"
              data-testid="ds-type-select"
              v-model="formType"
              :disabled="saveLoading"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-9"
            >
              <option value="prometheus">Prometheus (PromQL)</option>
              <option value="victoriametrics">VictoriaMetrics (PromQL)</option>
              <option value="loki">Loki (LogQL)</option>
              <option value="victorialogs">Victoria Logs (LogsQL)</option>
              <option value="tempo">Tempo (Tracing)</option>
              <option value="victoriatraces">VictoriaTraces (Tracing)</option>
              <option value="clickhouse">ClickHouse (SQL)</option>
              <option value="cloudwatch">CloudWatch (Metrics + Logs)</option>
              <option value="elasticsearch">Elasticsearch (ELK)</option>
              <option value="vmalert">VMAlert (Alerting)</option>
              <option value="alertmanager">AlertManager (Alerting)</option>
            </select>
          </div>
        </div>

        <div class="mb-0">
          <label for="ds-url" class="block text-sm font-medium text-text-primary mb-1.5">URL <span class="text-rose-500">*</span></label>
          <input
            id="ds-url"
            data-testid="ds-url-input"
            v-model="formUrl"
            type="text"
            placeholder="http://localhost:9090"
            :disabled="saveLoading"
            autocomplete="off"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
          />
        </div>
      </section>

      <section v-if="isCloudWatchType" class="rounded border border-border bg-surface-raised p-6">
        <h2 class="text-sm font-semibold text-text-primary mb-3 mt-0">CloudWatch Settings</h2>
        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <div class="mb-4">
            <label for="ds-cloudwatch-region" class="block text-sm font-medium text-text-primary mb-1.5">AWS Region <span class="text-rose-500">*</span></label>
            <input
              id="ds-cloudwatch-region"
              data-testid="ds-cloudwatch-region-input"
              v-model="formCloudWatchRegion"
              type="text"
              placeholder="us-east-1"
              :disabled="saveLoading"
              autocomplete="off"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
            />
          </div>
          <div class="mb-4">
            <label for="ds-cloudwatch-namespace" class="block text-sm font-medium text-text-primary mb-1.5">Metric Namespace (optional)</label>
            <input
              id="ds-cloudwatch-namespace"
              v-model="formCloudWatchMetricNamespace"
              type="text"
              placeholder="AWS/ECS"
              :disabled="saveLoading"
              autocomplete="off"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
            />
          </div>
        </div>

        <div class="mb-4">
          <label for="ds-cloudwatch-log-group" class="block text-sm font-medium text-text-primary mb-1.5">Default Log Group (optional)</label>
          <input
            id="ds-cloudwatch-log-group"
            v-model="formCloudWatchLogGroup"
            type="text"
            placeholder="/aws/lambda/my-function"
            :disabled="saveLoading"
            autocomplete="off"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
          />
        </div>

        <div class="rounded-sm border border-border bg-surface-overlay p-4 mt-4">
          <h3 class="text-sm font-semibold text-text-primary mb-3 mt-0">AWS Credentials (optional)</h3>
          <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div class="mb-4">
              <label for="ds-cloudwatch-access-key" class="block text-sm font-medium text-text-primary mb-1.5">Access Key ID</label>
              <input
                id="ds-cloudwatch-access-key"
                v-model="formCloudWatchAccessKeyId"
                type="text"
                :disabled="saveLoading"
                autocomplete="off"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
              />
            </div>
            <div class="mb-4">
              <label for="ds-cloudwatch-secret-key" class="block text-sm font-medium text-text-primary mb-1.5">Secret Access Key</label>
              <input
                id="ds-cloudwatch-secret-key"
                v-model="formCloudWatchSecretAccessKey"
                type="password"
                :disabled="saveLoading"
                autocomplete="new-password"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
              />
            </div>
          </div>

          <div class="mb-0">
            <label for="ds-cloudwatch-session-token" class="block text-sm font-medium text-text-primary mb-1.5">Session Token</label>
            <input
              id="ds-cloudwatch-session-token"
              v-model="formCloudWatchSessionToken"
              type="password"
              :disabled="saveLoading"
              autocomplete="new-password"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
            />
          </div>
        </div>
      </section>

      <section v-if="isClickHouseType" class="rounded border border-border bg-surface-raised p-6">
        <h2 class="text-sm font-semibold text-text-primary mb-3 mt-0">ClickHouse Settings</h2>
        <div class="mb-0">
          <label for="ds-database" class="block text-sm font-medium text-text-primary mb-1.5">Database (optional)</label>
          <input
            id="ds-database"
            data-testid="ds-database-input"
            v-model="formDatabase"
            type="text"
            placeholder="default"
            :disabled="saveLoading"
            autocomplete="off"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
          />
        </div>
      </section>

      <section v-if="isElasticsearchType" class="rounded border border-border bg-surface-raised p-6">
        <h2 class="text-sm font-semibold text-text-primary mb-3 mt-0">Elasticsearch Settings</h2>
        <div class="mb-4">
          <label for="ds-elasticsearch-index" class="block text-sm font-medium text-text-primary mb-1.5">Default Index Pattern (optional)</label>
          <input
            id="ds-elasticsearch-index"
            data-testid="ds-elasticsearch-index-input"
            v-model="formElasticsearchIndex"
            type="text"
            placeholder="logs-*"
            :disabled="saveLoading"
            autocomplete="off"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
          />
        </div>

        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <div class="mb-4">
            <label for="ds-elasticsearch-time-field" class="block text-sm font-medium text-text-primary mb-1.5">Timestamp Field (optional)</label>
            <input
              id="ds-elasticsearch-time-field"
              v-model="formElasticsearchTimestampField"
              type="text"
              placeholder="@timestamp"
              :disabled="saveLoading"
              autocomplete="off"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
            />
          </div>
          <div class="mb-4">
            <label for="ds-elasticsearch-message-field" class="block text-sm font-medium text-text-primary mb-1.5">Message Field (optional)</label>
            <input
              id="ds-elasticsearch-message-field"
              v-model="formElasticsearchMessageField"
              type="text"
              placeholder="message"
              :disabled="saveLoading"
              autocomplete="off"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
            />
          </div>
        </div>

        <div class="mb-0">
          <label for="ds-elasticsearch-level-field" class="block text-sm font-medium text-text-primary mb-1.5">Level Field (optional)</label>
          <input
            id="ds-elasticsearch-level-field"
            v-model="formElasticsearchLevelField"
            type="text"
            placeholder="level"
            :disabled="saveLoading"
            autocomplete="off"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
          />
        </div>
      </section>

      <section v-if="showLogCorrelation" class="rounded border border-border bg-surface-raised p-6">
        <h2 class="text-sm font-semibold text-text-primary mb-3 mt-0">Log Correlation</h2>
        <div class="mb-4">
          <label for="ds-trace-id-field" class="block text-sm font-medium text-text-primary mb-1.5">Trace ID Field</label>
          <input
            id="ds-trace-id-field"
            v-model="formTraceIdField"
            type="text"
            placeholder="trace_id"
            :disabled="saveLoading"
            autocomplete="off"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
          />
          <p class="text-xs text-text-muted mt-1 m-0">The log field name that contains distributed trace IDs. Default: trace_id</p>
        </div>
        <div class="mb-0">
          <label for="ds-linked-trace-ds" class="block text-sm font-medium text-text-primary mb-1.5">Linked Tracing Datasource (optional)</label>
          <select
            id="ds-linked-trace-ds"
            :value="formLinkedTraceDatasourceId || ''"
            :disabled="saveLoading"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-9"
            @change="formLinkedTraceDatasourceId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="">None — disable trace linking</option>
            <option v-for="td in traceDatasources" :key="td.id" :value="td.id">{{ td.name }} ({{ td.type }})</option>
          </select>
          <p class="text-xs text-text-muted mt-1 m-0">When a user clicks a trace ID in logs, they'll be taken to this tracing datasource.</p>
        </div>
      </section>

      <section v-if="showAuthSettings" class="rounded border border-border bg-surface-raised p-6">
        <h2 class="text-sm font-semibold text-text-primary mb-3 mt-0">Authentication</h2>
        <div class="mb-4">
          <label for="ds-auth-type" class="block text-sm font-medium text-text-primary mb-1.5">Authentication</label>
          <select
            id="ds-auth-type"
            data-testid="ds-auth-type-select"
            v-model="formAuthType"
            :disabled="saveLoading"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-9"
          >
            <option value="none">None</option>
            <option value="basic">Basic auth</option>
            <option value="bearer">Bearer token</option>
            <option value="api_key">API key</option>
          </select>
        </div>

        <div v-if="formAuthType === 'basic'" class="rounded-sm border border-border bg-surface-overlay p-4 mt-4">
          <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div class="mb-0">
              <label for="ds-basic-username" class="block text-sm font-medium text-text-primary mb-1.5">Username <span class="text-rose-500">*</span></label>
              <input
                id="ds-basic-username"
                data-testid="ds-basic-username-input"
                v-model="formBasicUsername"
                type="text"
                :disabled="saveLoading"
                autocomplete="off"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
              />
            </div>
            <div class="mb-0">
              <label for="ds-basic-password" class="block text-sm font-medium text-text-primary mb-1.5">Password</label>
              <input
                id="ds-basic-password"
                data-testid="ds-basic-password-input"
                v-model="formBasicPassword"
                type="password"
                :disabled="saveLoading"
                autocomplete="new-password"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
              />
            </div>
          </div>
        </div>

        <div v-else-if="formAuthType === 'bearer'" class="rounded-sm border border-border bg-surface-overlay p-4 mt-4">
          <div class="mb-0">
            <label for="ds-bearer-token" class="block text-sm font-medium text-text-primary mb-1.5">Bearer token <span class="text-rose-500">*</span></label>
            <input
              id="ds-bearer-token"
              data-testid="ds-bearer-token-input"
              v-model="formBearerToken"
              type="password"
              :disabled="saveLoading"
              autocomplete="new-password"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
            />
          </div>
        </div>

        <div v-else-if="formAuthType === 'api_key'" class="rounded-sm border border-border bg-surface-overlay p-4 mt-4">
          <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div class="mb-0">
              <label for="ds-api-header" class="block text-sm font-medium text-text-primary mb-1.5">Header name</label>
              <input
                id="ds-api-header"
                data-testid="ds-api-header-input"
                v-model="formApiKeyHeader"
                type="text"
                :disabled="saveLoading"
                autocomplete="off"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
              />
            </div>
            <div class="mb-0">
              <label for="ds-api-value" class="block text-sm font-medium text-text-primary mb-1.5">API key <span class="text-rose-500">*</span></label>
              <input
                id="ds-api-value"
                data-testid="ds-api-value-input"
                v-model="formApiKeyValue"
                type="password"
                :disabled="saveLoading"
                autocomplete="new-password"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="rounded border border-border bg-surface-raised p-6">
        <h2 class="text-sm font-semibold text-text-primary mb-3 mt-0">Connection Test</h2>
        <p class="text-xs text-text-muted -mt-1 mb-3">
          Run a connection test before saving to verify URL, auth, and datasource availability.
        </p>
        <div class="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-sm border border-border-strong px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-border-strong disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="ds-test-btn"
            :disabled="testLoading || saveLoading"
            @click="handleTestConnection"
          >
            <Loader2 v-if="testLoading" :size="16" class="animate-spin" />
            <HeartPulse v-else :size="16" />
            {{ testLoading ? 'Testing...' : 'Test Connection' }}
          </button>
          <span v-if="testSuccess && !isTestStale" class="inline-flex items-center gap-1.5 rounded-sm bg-accent-muted border border-accent-border px-3 py-2 text-sm text-accent">
            <CheckCircle2 :size="16" />
            {{ testSuccess }}
          </span>
          <span v-else-if="isTestStale" class="inline-flex items-center gap-1.5 text-sm text-amber-600">
            <CircleAlert :size="16" />
            Configuration changed since last successful test
          </span>
          <span v-else-if="testError" class="inline-flex items-center gap-1.5 rounded-sm bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-sm text-rose-500">
            <CircleAlert :size="16" />
            {{ testError }}
          </span>
        </div>
      </section>

      <section class="rounded border border-border bg-surface-raised px-6 py-4">
        <label class="inline-flex items-center gap-2 cursor-pointer text-sm text-text-primary">
          <input type="checkbox" v-model="formIsDefault" data-testid="ds-default-checkbox" :disabled="saveLoading" class="h-4 w-4" />
          Set as default data source
        </label>
      </section>

      <div v-if="formError" class="rounded-sm bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-sm text-rose-500">{{ formError }}</div>

      <footer class="flex justify-end gap-2.5 max-md:flex-col-reverse">
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-sm border border-border-strong px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-border-strong disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full"
          data-testid="ds-cancel-btn"
          :disabled="saveLoading"
          @click="router.push('/datasources')"
        >
          Cancel
        </button>
        <button
          type="submit"
          data-testid="ds-save-btn"
          class="inline-flex items-center justify-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full"
          :disabled="saveLoading"
        >
          <Loader2 v-if="saveLoading" :size="16" class="animate-spin" />
          <Database v-else :size="16" />
          {{ saveButtonText }}
        </button>
      </footer>
    </form>
  </div>
</template>
