<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CheckCircle2, CircleAlert, Database, HeartPulse, Loader2 } from 'lucide-vue-next'
import { useOrganization } from '../composables/useOrganization'
import { useDatasource } from '../composables/useDatasource'
import { getDataSource, testDataSourceDraftConnection } from '../api/datasources'
import type { CreateDataSourceRequest, DataSource, DataSourceType } from '../types/datasource'
import { dataSourceTypeLabels, isTracingType, isAlertingType } from '../types/datasource'

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

const pageTitle = computed(() => isEditing.value ? 'Edit Data Source' : 'Add Data Source')
const pageDescription = computed(() =>
  isEditing.value
    ? 'Update connection details, test connectivity, then save your changes.'
    : 'Configure connection details, test connectivity, then save.',
)
const saveButtonText = computed(() =>
  saveLoading.value
    ? 'Saving...'
    : isEditing.value
      ? 'Save Changes'
      : 'Save Data Source',
)

const isClickHouseType = computed(() => formType.value === 'clickhouse')
const isCloudWatchType = computed(() => formType.value === 'cloudwatch')
const isElasticsearchType = computed(() => formType.value === 'elasticsearch')
// @ts-expect-error kept for future use
const _isVMAlertType = computed(() => formType.value === 'vmalert')
const showAuthSettings = computed(() =>
  (isTracingType(formType.value) || isClickHouseType.value || isElasticsearchType.value || isAlertingType(formType.value)) && !isCloudWatchType.value,
)

const formSignature = computed(() => JSON.stringify({
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
}))

const isTestStale = computed(() =>
  lastTestedSignature.value !== null && lastTestedSignature.value !== formSignature.value,
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

  return {
    name: trimmedName || `Untitled ${dataSourceTypeLabels[formType.value]}`,
    type: formType.value,
    url: submitURL,
    is_default: formIsDefault.value,
    auth_type: authPayload.auth_type,
    auth_config: finalAuthConfig,
  }
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
    router.push('/app/datasources')
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

resetCreateForm()

onMounted(() => {
  loadDatasourceForEdit()
})

watch(
  () => route.params.id,
  () => {
    loadDatasourceForEdit()
  },
)
</script>


<template>
  <div class="max-w-[980px] mx-auto py-5 px-6 pb-8 max-md:p-[0.9rem]">
    <header class="flex flex-col gap-[0.8rem] mb-4">
      <button class="inline-flex items-center gap-[0.45rem] border border-accent rounded-[8px] py-[0.56rem] px-[0.9rem] bg-transparent text-text-accent text-[0.85rem] font-medium cursor-pointer hover:bg-bg-hover" @click="router.push('/app/datasources')">
        <ArrowLeft :size="16" />
        Back to Data Sources
      </button>
      <div>
        <h1 class="text-[1.12rem] font-mono tracking-[0.04em] uppercase">{{ pageTitle }}</h1>
        <p class="mt-1 text-text-1 text-[0.87rem]">{{ pageDescription }}</p>
      </div>
    </header>

    <div v-if="pageLoading" class="inline-flex items-center gap-2 py-3 px-[0.9rem] border border-border rounded-[8px] bg-surface-1 text-text-1 text-[0.86rem] mb-[0.9rem]">
      <Loader2 :size="18" class="animate-[spin_0.8s_linear_infinite]" />
      <span>Loading datasource details...</span>
    </div>

    <div v-else-if="loadError" class="py-3 px-[0.9rem] rounded-[8px] text-danger text-[0.86rem] mb-[0.9rem]" style="background: rgba(255, 107, 107, 0.12); border: 1px solid rgba(255, 107, 107, 0.35)">
      {{ loadError }}
    </div>

    <form v-else class="flex flex-col gap-[0.95rem]" @submit.prevent="handleSave">
      <section class="border border-border rounded-[12px] bg-surface-1 shadow-sm p-4">
        <h2 class="mb-[0.85rem] text-[0.92rem] uppercase tracking-[0.06em] text-text-1">Basics</h2>
        <div class="grid grid-cols-2 gap-[0.8rem] max-md:grid-cols-1">
          <div class="mb-[0.95rem]">
            <label for="ds-name" class="block mb-[0.45rem] text-[0.83rem] font-medium">Name <span class="text-danger">*</span></label>
            <input id="ds-name" v-model="formName" type="text" placeholder="My Prometheus" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] transition-colors duration-200 focus:outline-none focus:border-accent placeholder:text-text-2" />
          </div>
          <div class="mb-[0.95rem]">
            <label for="ds-type" class="block mb-[0.45rem] text-[0.83rem] font-medium">Type</label>
            <select id="ds-type" v-model="formType" :disabled="saveLoading" class="ds-select w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] transition-colors duration-200 focus:outline-none focus:border-accent">
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
        <div class="mb-[0.95rem]">
          <label for="ds-url" class="block mb-[0.45rem] text-[0.83rem] font-medium">URL <span class="text-danger">*</span></label>
          <input id="ds-url" v-model="formUrl" type="text" placeholder="http://localhost:9090" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] transition-colors duration-200 focus:outline-none focus:border-accent placeholder:text-text-2" />
        </div>
      </section>

      <section v-if="isCloudWatchType" class="border border-border rounded-[12px] bg-surface-1 shadow-sm p-4">
        <h2 class="mb-[0.85rem] text-[0.92rem] uppercase tracking-[0.06em] text-text-1">CloudWatch Settings</h2>
        <div class="grid grid-cols-2 gap-[0.8rem] max-md:grid-cols-1">
          <div class="mb-[0.95rem]">
            <label for="ds-cloudwatch-region" class="block mb-[0.45rem] text-[0.83rem] font-medium">AWS Region <span class="text-danger">*</span></label>
            <input id="ds-cloudwatch-region" v-model="formCloudWatchRegion" type="text" placeholder="us-east-1" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
          </div>
          <div class="mb-[0.95rem]">
            <label for="ds-cloudwatch-namespace" class="block mb-[0.45rem] text-[0.83rem] font-medium">Metric Namespace (optional)</label>
            <input id="ds-cloudwatch-namespace" v-model="formCloudWatchMetricNamespace" type="text" placeholder="AWS/ECS" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
          </div>
        </div>
        <div class="mb-[0.95rem]">
          <label for="ds-cloudwatch-log-group" class="block mb-[0.45rem] text-[0.83rem] font-medium">Default Log Group (optional)</label>
          <input id="ds-cloudwatch-log-group" v-model="formCloudWatchLogGroup" type="text" placeholder="/aws/lambda/my-function" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
        </div>
        <div class="grid grid-cols-2 gap-[0.8rem] max-md:grid-cols-1">
          <div class="mb-[0.95rem]">
            <label for="ds-cloudwatch-access-key" class="block mb-[0.45rem] text-[0.83rem] font-medium">Access Key ID (optional)</label>
            <input id="ds-cloudwatch-access-key" v-model="formCloudWatchAccessKeyId" type="text" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
          </div>
          <div class="mb-[0.95rem]">
            <label for="ds-cloudwatch-secret-key" class="block mb-[0.45rem] text-[0.83rem] font-medium">Secret Access Key (optional)</label>
            <input id="ds-cloudwatch-secret-key" v-model="formCloudWatchSecretAccessKey" type="password" :disabled="saveLoading" autocomplete="new-password" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div class="mb-[0.95rem]">
          <label for="ds-cloudwatch-session-token" class="block mb-[0.45rem] text-[0.83rem] font-medium">Session Token (optional)</label>
          <input id="ds-cloudwatch-session-token" v-model="formCloudWatchSessionToken" type="password" :disabled="saveLoading" autocomplete="new-password" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
        </div>
      </section>

      <section v-if="isClickHouseType" class="border border-border rounded-[12px] bg-surface-1 shadow-sm p-4">
        <h2 class="mb-[0.85rem] text-[0.92rem] uppercase tracking-[0.06em] text-text-1">ClickHouse Settings</h2>
        <div>
          <label for="ds-database" class="block mb-[0.45rem] text-[0.83rem] font-medium">Database (optional)</label>
          <input id="ds-database" v-model="formDatabase" type="text" placeholder="default" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
        </div>
      </section>

      <section v-if="isElasticsearchType" class="border border-border rounded-[12px] bg-surface-1 shadow-sm p-4">
        <h2 class="mb-[0.85rem] text-[0.92rem] uppercase tracking-[0.06em] text-text-1">Elasticsearch Settings</h2>
        <div class="mb-[0.95rem]">
          <label for="ds-elasticsearch-index" class="block mb-[0.45rem] text-[0.83rem] font-medium">Default Index Pattern (optional)</label>
          <input id="ds-elasticsearch-index" v-model="formElasticsearchIndex" type="text" placeholder="logs-*" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
        </div>
        <div class="grid grid-cols-2 gap-[0.8rem] max-md:grid-cols-1">
          <div class="mb-[0.95rem]">
            <label for="ds-elasticsearch-time-field" class="block mb-[0.45rem] text-[0.83rem] font-medium">Timestamp Field (optional)</label>
            <input id="ds-elasticsearch-time-field" v-model="formElasticsearchTimestampField" type="text" placeholder="@timestamp" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
          </div>
          <div class="mb-[0.95rem]">
            <label for="ds-elasticsearch-message-field" class="block mb-[0.45rem] text-[0.83rem] font-medium">Message Field (optional)</label>
            <input id="ds-elasticsearch-message-field" v-model="formElasticsearchMessageField" type="text" placeholder="message" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
          </div>
        </div>
        <div>
          <label for="ds-elasticsearch-level-field" class="block mb-[0.45rem] text-[0.83rem] font-medium">Level Field (optional)</label>
          <input id="ds-elasticsearch-level-field" v-model="formElasticsearchLevelField" type="text" placeholder="level" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent placeholder:text-text-2" />
        </div>
      </section>

      <section v-if="showAuthSettings" class="border border-border rounded-[12px] bg-surface-1 shadow-sm p-4">
        <h2 class="mb-[0.85rem] text-[0.92rem] uppercase tracking-[0.06em] text-text-1">Authentication</h2>
        <div class="mb-[0.95rem]">
          <label for="ds-auth-type" class="block mb-[0.45rem] text-[0.83rem] font-medium">Authentication</label>
          <select id="ds-auth-type" v-model="formAuthType" :disabled="saveLoading" class="ds-select w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent">
            <option value="none">None</option>
            <option value="basic">Basic auth</option>
            <option value="bearer">Bearer token</option>
            <option value="api_key">API key</option>
          </select>
        </div>
        <div v-if="formAuthType === 'basic'" class="grid grid-cols-2 gap-[0.8rem] max-md:grid-cols-1">
          <div class="mb-[0.95rem]">
            <label for="ds-basic-username" class="block mb-[0.45rem] text-[0.83rem] font-medium">Username <span class="text-danger">*</span></label>
            <input id="ds-basic-username" v-model="formBasicUsername" type="text" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
          </div>
          <div class="mb-[0.95rem]">
            <label for="ds-basic-password" class="block mb-[0.45rem] text-[0.83rem] font-medium">Password</label>
            <input id="ds-basic-password" v-model="formBasicPassword" type="password" :disabled="saveLoading" autocomplete="new-password" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div v-else-if="formAuthType === 'bearer'">
          <label for="ds-bearer-token" class="block mb-[0.45rem] text-[0.83rem] font-medium">Bearer token <span class="text-danger">*</span></label>
          <input id="ds-bearer-token" v-model="formBearerToken" type="password" :disabled="saveLoading" autocomplete="new-password" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
        </div>
        <div v-else-if="formAuthType === 'api_key'" class="grid grid-cols-2 gap-[0.8rem] max-md:grid-cols-1">
          <div class="mb-[0.95rem]">
            <label for="ds-api-header" class="block mb-[0.45rem] text-[0.83rem] font-medium">Header name</label>
            <input id="ds-api-header" v-model="formApiKeyHeader" type="text" :disabled="saveLoading" autocomplete="off" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
          </div>
          <div class="mb-[0.95rem]">
            <label for="ds-api-value" class="block mb-[0.45rem] text-[0.83rem] font-medium">API key <span class="text-danger">*</span></label>
            <input id="ds-api-value" v-model="formApiKeyValue" type="password" :disabled="saveLoading" autocomplete="new-password" class="w-full py-[0.72rem] px-[0.9rem] bg-bg-2 border border-border rounded-[8px] text-text-0 text-[0.88rem] focus:outline-none focus:border-accent" />
          </div>
        </div>
      </section>

      <section class="border border-border rounded-[12px] bg-surface-1 shadow-sm p-4">
        <h2 class="mb-[0.85rem] text-[0.92rem] uppercase tracking-[0.06em] text-text-1">Connection Test</h2>
        <p class="text-text-2 text-[0.82rem] -mt-1 mb-[0.8rem]">Run a connection test before saving to verify URL, auth, and datasource availability.</p>
        <div class="flex items-center gap-[0.7rem] flex-wrap">
          <button type="button" class="inline-flex items-center gap-[0.45rem] border border-accent rounded-[8px] py-[0.56rem] px-[0.9rem] bg-transparent text-text-accent text-[0.85rem] font-medium cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed" :disabled="testLoading || saveLoading" @click="handleTestConnection">
            <Loader2 v-if="testLoading" :size="16" class="animate-[spin_0.8s_linear_infinite]" />
            <HeartPulse v-else :size="16" />
            {{ testLoading ? 'Testing...' : 'Test Connection' }}
          </button>
          <span v-if="testSuccess && !isTestStale" class="inline-flex items-center gap-[0.35rem] text-[0.82rem] text-[#59a14f]">
            <CheckCircle2 :size="16" /> {{ testSuccess }}
          </span>
          <span v-else-if="isTestStale" class="inline-flex items-center gap-[0.35rem] text-[0.82rem] text-[#f59e0b]">
            <CircleAlert :size="16" /> Configuration changed since last successful test
          </span>
          <span v-else-if="testError" class="inline-flex items-center gap-[0.35rem] text-[0.82rem] text-danger">
            <CircleAlert :size="16" /> {{ testError }}
          </span>
        </div>
      </section>

      <section class="border border-border rounded-[12px] bg-surface-1 shadow-sm py-3 px-4">
        <label class="inline-flex items-center gap-2 cursor-pointer text-[0.88rem]">
          <input type="checkbox" v-model="formIsDefault" :disabled="saveLoading" class="w-4 h-4" />
          Set as default data source
        </label>
      </section>

      <div v-if="formError" class="py-3 px-[0.9rem] rounded-[8px] text-danger text-[0.86rem]" style="background: rgba(255, 107, 107, 0.12); border: 1px solid rgba(255, 107, 107, 0.35)">{{ formError }}</div>

      <footer class="flex justify-end gap-[0.65rem] max-md:flex-col-reverse">
        <button type="button" class="inline-flex items-center justify-center gap-[0.45rem] border border-accent rounded-[8px] py-[0.56rem] px-[0.9rem] bg-transparent text-text-accent text-[0.85rem] font-medium cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed max-md:w-full" :disabled="saveLoading" @click="router.push('/app/datasources')">Cancel</button>
        <button type="submit" class="inline-flex items-center justify-center gap-[0.45rem] rounded-[8px] py-[0.56rem] px-[0.9rem] bg-accent text-[#1a0f00] text-[0.85rem] font-medium cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed max-md:w-full" :disabled="saveLoading">
          <Loader2 v-if="saveLoading" :size="16" class="animate-[spin_0.8s_linear_infinite]" />
          <Database v-else :size="16" />
          {{ saveButtonText }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style>
/* Select arrow styling (requires CSS for appearance override) */
.ds-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.3rem;
}
</style>
