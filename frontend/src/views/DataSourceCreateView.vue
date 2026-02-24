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
const isVMAlertType = computed(() => formType.value === 'vmalert')
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
  <div class="datasource-create">
    <header class="page-header">
      <button class="btn btn-secondary" @click="router.push('/app/datasources')">
        <ArrowLeft :size="16" />
        Back to Data Sources
      </button>
      <div class="header-copy">
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </div>
    </header>

    <div v-if="pageLoading" class="load-state">
      <Loader2 :size="18" class="icon-spin" />
      <span>Loading datasource details...</span>
    </div>

    <div v-else-if="loadError" class="error-message load-error">
      {{ loadError }}
    </div>

    <form v-else class="form-shell" @submit.prevent="handleSave">
      <section class="form-section">
        <h2>Basics</h2>
        <div class="form-grid">
          <div class="form-group">
            <label for="ds-name">Name <span class="required">*</span></label>
            <input
              id="ds-name"
              v-model="formName"
              type="text"
              placeholder="My Prometheus"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>

          <div class="form-group">
            <label for="ds-type">Type</label>
            <select id="ds-type" v-model="formType" :disabled="saveLoading">
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
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="ds-url">URL <span class="required">*</span></label>
          <input
            id="ds-url"
            v-model="formUrl"
            type="text"
            placeholder="http://localhost:9090"
            :disabled="saveLoading"
            autocomplete="off"
          />
        </div>
      </section>

      <section v-if="isCloudWatchType" class="form-section">
        <h2>CloudWatch Settings</h2>
        <div class="form-grid">
          <div class="form-group">
            <label for="ds-cloudwatch-region">AWS Region <span class="required">*</span></label>
            <input
              id="ds-cloudwatch-region"
              v-model="formCloudWatchRegion"
              type="text"
              placeholder="us-east-1"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="ds-cloudwatch-namespace">Metric Namespace (optional)</label>
            <input
              id="ds-cloudwatch-namespace"
              v-model="formCloudWatchMetricNamespace"
              type="text"
              placeholder="AWS/ECS"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="ds-cloudwatch-log-group">Default Log Group (optional)</label>
          <input
            id="ds-cloudwatch-log-group"
            v-model="formCloudWatchLogGroup"
            type="text"
            placeholder="/aws/lambda/my-function"
            :disabled="saveLoading"
            autocomplete="off"
          />
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="ds-cloudwatch-access-key">Access Key ID (optional)</label>
            <input
              id="ds-cloudwatch-access-key"
              v-model="formCloudWatchAccessKeyId"
              type="text"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="ds-cloudwatch-secret-key">Secret Access Key (optional)</label>
            <input
              id="ds-cloudwatch-secret-key"
              v-model="formCloudWatchSecretAccessKey"
              type="password"
              :disabled="saveLoading"
              autocomplete="new-password"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="ds-cloudwatch-session-token">Session Token (optional)</label>
          <input
            id="ds-cloudwatch-session-token"
            v-model="formCloudWatchSessionToken"
            type="password"
            :disabled="saveLoading"
            autocomplete="new-password"
          />
        </div>
      </section>

      <section v-if="isClickHouseType" class="form-section">
        <h2>ClickHouse Settings</h2>
        <div class="form-group compact-group">
          <label for="ds-database">Database (optional)</label>
          <input
            id="ds-database"
            v-model="formDatabase"
            type="text"
            placeholder="default"
            :disabled="saveLoading"
            autocomplete="off"
          />
        </div>
      </section>

      <section v-if="isElasticsearchType" class="form-section">
        <h2>Elasticsearch Settings</h2>
        <div class="form-group">
          <label for="ds-elasticsearch-index">Default Index Pattern (optional)</label>
          <input
            id="ds-elasticsearch-index"
            v-model="formElasticsearchIndex"
            type="text"
            placeholder="logs-*"
            :disabled="saveLoading"
            autocomplete="off"
          />
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="ds-elasticsearch-time-field">Timestamp Field (optional)</label>
            <input
              id="ds-elasticsearch-time-field"
              v-model="formElasticsearchTimestampField"
              type="text"
              placeholder="@timestamp"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="ds-elasticsearch-message-field">Message Field (optional)</label>
            <input
              id="ds-elasticsearch-message-field"
              v-model="formElasticsearchMessageField"
              type="text"
              placeholder="message"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="form-group compact-group">
          <label for="ds-elasticsearch-level-field">Level Field (optional)</label>
          <input
            id="ds-elasticsearch-level-field"
            v-model="formElasticsearchLevelField"
            type="text"
            placeholder="level"
            :disabled="saveLoading"
            autocomplete="off"
          />
        </div>
      </section>

      <section v-if="showAuthSettings" class="form-section">
        <h2>Authentication</h2>
        <div class="form-group">
          <label for="ds-auth-type">Authentication</label>
          <select id="ds-auth-type" v-model="formAuthType" :disabled="saveLoading">
            <option value="none">None</option>
            <option value="basic">Basic auth</option>
            <option value="bearer">Bearer token</option>
            <option value="api_key">API key</option>
          </select>
        </div>

        <div v-if="formAuthType === 'basic'" class="form-grid">
          <div class="form-group">
            <label for="ds-basic-username">Username <span class="required">*</span></label>
            <input
              id="ds-basic-username"
              v-model="formBasicUsername"
              type="text"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="ds-basic-password">Password</label>
            <input
              id="ds-basic-password"
              v-model="formBasicPassword"
              type="password"
              :disabled="saveLoading"
              autocomplete="new-password"
            />
          </div>
        </div>

        <div v-else-if="formAuthType === 'bearer'" class="form-group compact-group">
          <label for="ds-bearer-token">Bearer token <span class="required">*</span></label>
          <input
            id="ds-bearer-token"
            v-model="formBearerToken"
            type="password"
            :disabled="saveLoading"
            autocomplete="new-password"
          />
        </div>

        <div v-else-if="formAuthType === 'api_key'" class="form-grid">
          <div class="form-group">
            <label for="ds-api-header">Header name</label>
            <input
              id="ds-api-header"
              v-model="formApiKeyHeader"
              type="text"
              :disabled="saveLoading"
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="ds-api-value">API key <span class="required">*</span></label>
            <input
              id="ds-api-value"
              v-model="formApiKeyValue"
              type="password"
              :disabled="saveLoading"
              autocomplete="new-password"
            />
          </div>
        </div>
      </section>

      <section class="form-section">
        <h2>Connection Test</h2>
        <p class="section-subtitle">
          Run a connection test before saving to verify URL, auth, and datasource availability.
        </p>
        <div class="test-actions">
          <button type="button" class="btn btn-secondary" :disabled="testLoading || saveLoading" @click="handleTestConnection">
            <Loader2 v-if="testLoading" :size="16" class="icon-spin" />
            <HeartPulse v-else :size="16" />
            {{ testLoading ? 'Testing...' : 'Test Connection' }}
          </button>
          <span v-if="testSuccess && !isTestStale" class="test-result test-ok">
            <CheckCircle2 :size="16" />
            {{ testSuccess }}
          </span>
          <span v-else-if="isTestStale" class="test-result test-stale">
            <CircleAlert :size="16" />
            Configuration changed since last successful test
          </span>
          <span v-else-if="testError" class="test-result test-error">
            <CircleAlert :size="16" />
            {{ testError }}
          </span>
        </div>
      </section>

      <section class="form-section compact-section">
        <label class="checkbox-label">
          <input type="checkbox" v-model="formIsDefault" :disabled="saveLoading" />
          Set as default data source
        </label>
      </section>

      <div v-if="formError" class="error-message">{{ formError }}</div>

      <footer class="form-actions">
        <button type="button" class="btn btn-secondary" :disabled="saveLoading" @click="router.push('/app/datasources')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="saveLoading">
          <Loader2 v-if="saveLoading" :size="16" class="icon-spin" />
          <Database v-else :size="16" />
          {{ saveButtonText }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.datasource-create {
  max-width: 980px;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 2rem;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.header-copy h1 {
  margin: 0;
  font-size: 1.12rem;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.header-copy p {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: 0.87rem;
}

.load-state {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--text-secondary);
  font-size: 0.86rem;
  margin-bottom: 0.9rem;
}

.form-shell {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}

.form-section {
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
  padding: 1rem;
}

.compact-section {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.form-section h2 {
  margin: 0 0 0.85rem;
  font-size: 0.92rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.section-subtitle {
  margin: -0.2rem 0 0.8rem;
  color: var(--text-tertiary);
  font-size: 0.82rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.form-group {
  margin-bottom: 0.95rem;
}

.compact-group {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 0.83rem;
  font-weight: 500;
}

.required {
  color: var(--accent-danger);
}

.form-group input[type='text'],
.form-group input[type='password'],
.form-group select {
  width: 100%;
  padding: 0.72rem 0.9rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.88rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: var(--focus-ring);
}

.form-group input::placeholder {
  color: var(--text-tertiary);
}

.form-group select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.3rem;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.88rem;
}

.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
}

.test-actions {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.test-result {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
}

.test-ok {
  color: #59a14f;
}

.test-error {
  color: var(--accent-danger);
}

.test-stale {
  color: #f59e0b;
}

.error-message {
  padding: 0.75rem 0.9rem;
  border-radius: 8px;
  background: rgba(255, 107, 107, 0.12);
  border: 1px solid rgba(255, 107, 107, 0.35);
  color: var(--accent-danger);
  font-size: 0.86rem;
}

.load-error {
  margin-bottom: 0.9rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0.56rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-tertiary);
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--accent-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-primary-hover);
}

.icon-spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .datasource-create {
    padding: 0.9rem;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .btn {
    width: 100%;
  }
}
</style>
