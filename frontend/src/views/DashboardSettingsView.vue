<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Download, Settings } from 'lucide-vue-next'
import { exportDashboardYaml, getDashboard, updateDashboard } from '../api/dashboards'
import { convertGrafanaDashboard } from '../api/converter'
import type { Dashboard } from '../types/dashboard'
import { useOrganization } from '../composables/useOrganization'
import DashboardPermissionsEditor from '../components/DashboardPermissionsEditor.vue'

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

const TIME_RANGE_LOOKUP: Record<string, string> = {
  'now-5m|now': '5m',
  'now-15m|now': '15m',
  'now-30m|now': '30m',
  'now-1h|now': '1h',
  'now-6h|now': '6h',
  'now-24h|now': '24h',
  'now-7d|now': '7d',
}

const ALL_SECTIONS: Array<{ key: SettingsSection; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'yaml', label: 'YAML Editor' },
  { key: 'permissions', label: 'Permissions' },
]

const route = useRoute()
const router = useRouter()
const { currentOrg, currentOrgId, fetchOrganizations } = useOrganization()

const loading = ref(true)
const error = ref<string | null>(null)
const dashboard = ref<Dashboard | null>(null)

const title = ref('')
const description = ref('')
const timeRangePreset = ref('1h')
const refreshInterval = ref('off')
const variablesInput = ref('')

const isSaving = ref(false)
const isYamlSaving = ref(false)
const isYamlLoading = ref(false)
const isExporting = ref(false)
const isConvertingGrafana = ref(false)

const actionError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const yamlValidationError = ref<string | null>(null)
const yamlContent = ref('')
const originalYamlContent = ref('')
const grafanaSource = ref('')
const grafanaWarnings = ref<string[]>([])
const showGrafanaReplace = ref(false)

const dashboardId = computed(() => route.params.id as string)
const canManagePermissions = computed(() => Boolean(currentOrg.value && currentOrg.value.role !== 'viewer'))
const canEdit = computed(() => Boolean(currentOrg.value && (currentOrg.value.role === 'admin' || currentOrg.value.role === 'editor')))
const permissionsOrgId = computed(() => currentOrgId.value || dashboard.value?.organization_id || null)

const settingsSections = computed(() => {
  if (canManagePermissions.value) {
    return ALL_SECTIONS
  }

  return ALL_SECTIONS.filter((section) => section.key !== 'permissions')
})

const parsedVariables = computed(() => {
  return variablesInput.value
    .split(',')
    .map(variable => variable.trim())
    .filter(variable => variable.length > 0)
})

const yamlDirty = computed(() => yamlContent.value !== originalYamlContent.value)

const yamlDiffPreview = computed(() => {
  if (!yamlDirty.value) {
    return [] as string[]
  }

  const originalLines = originalYamlContent.value.split('\n')
  const updatedLines = yamlContent.value.split('\n')
  const maxLength = Math.max(originalLines.length, updatedLines.length)
  const preview: string[] = []

  for (let index = 0; index < maxLength; index += 1) {
    const originalLine = originalLines[index]
    const updatedLine = updatedLines[index]
    if (originalLine === updatedLine) {
      continue
    }

    if (typeof originalLine === 'string') {
      preview.push(`- ${originalLine}`)
    }
    if (typeof updatedLine === 'string') {
      preview.push(`+ ${updatedLine}`)
    }

    if (preview.length >= 16) {
      break
    }
  }

  return preview
})

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return value === 'general' || value === 'yaml' || value === 'permissions'
}

function isSectionAllowed(value: string | undefined): value is SettingsSection {
  if (!isSettingsSection(value)) {
    return false
  }

  if (value === 'permissions' && currentOrg.value && !canManagePermissions.value) {
    return false
  }

  return true
}

const activeSection = computed<SettingsSection>(() => {
  const section = route.params.section as string | undefined
  return isSectionAllowed(section) ? section : 'general'
})

function dashboardLoadErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message === 'Not a member of this organization') {
    return 'You do not have permission to view this dashboard'
  }

  return 'Dashboard not found'
}

function sectionPath(section: SettingsSection): string {
  return `/app/dashboards/${dashboardId.value}/settings/${section}`
}

function navigateToSection(section: SettingsSection) {
  if (section === activeSection.value) {
    return
  }

  successMessage.value = null
  actionError.value = null
  router.push(sectionPath(section))
}

function readStoredDashboardSettings(): Record<string, DashboardViewSettings> {
  const rawSettings = localStorage.getItem(DASHBOARD_VIEW_SETTINGS_KEY)
  if (!rawSettings) {
    return {}
  }

  try {
    return JSON.parse(rawSettings) as Record<string, DashboardViewSettings>
  } catch {
    return {}
  }
}

function applyStoredDashboardSettings() {
  const allSettings = readStoredDashboardSettings()
  const storedSettings = allSettings[dashboardId.value]

  timeRangePreset.value = storedSettings?.timeRangePreset || '1h'
  refreshInterval.value = storedSettings?.refreshInterval || 'off'
  variablesInput.value = (storedSettings?.variables || []).join(', ')
}

function persistDashboardViewSettings(settings: DashboardViewSettings) {
  const allSettings = readStoredDashboardSettings()
  allSettings[dashboardId.value] = settings
  localStorage.setItem(DASHBOARD_VIEW_SETTINGS_KEY, JSON.stringify(allSettings))
}

function resetFormState() {
  actionError.value = null
  successMessage.value = null
  yamlValidationError.value = null
}

async function loadDashboardYaml() {
  if (!dashboard.value) {
    return
  }

  isYamlLoading.value = true
  yamlValidationError.value = null

  try {
    const fileBlob = await exportDashboardYaml(dashboard.value.id)
    const content = await fileBlob.text()
    yamlContent.value = content
    originalYamlContent.value = content
  } catch (e) {
    yamlValidationError.value = e instanceof Error ? e.message : 'Failed to load dashboard YAML'
  } finally {
    isYamlLoading.value = false
  }
}

async function loadData() {
  loading.value = true
  error.value = null

  try {
    if (!currentOrg.value) {
      await fetchOrganizations()
    }

    const dashboardData = await getDashboard(dashboardId.value)
    dashboard.value = dashboardData
    title.value = dashboardData.title
    description.value = dashboardData.description || ''
    applyStoredDashboardSettings()
    await loadDashboardYaml()
  } catch (e) {
    dashboard.value = null
    error.value = dashboardLoadErrorMessage(e)
  } finally {
    loading.value = false
  }
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

function extractDashboardSection(rawYaml: string): string {
  const dashboardSectionMatch = rawYaml.match(/(?:^|\n)dashboard:\s*\n([\s\S]*)/)
  return dashboardSectionMatch?.[1] ?? ''
}

function validateYamlContent(rawYaml: string): string | null {
  if (!rawYaml.trim()) {
    return 'YAML content is required'
  }

  const schemaVersionMatch = rawYaml.match(/(?:^|\n)schema_version:\s*(\d+)/)
  if (!schemaVersionMatch) {
    return 'Missing schema_version'
  }
  if (schemaVersionMatch[1] !== '1') {
    return `Unsupported schema_version ${schemaVersionMatch[1]}`
  }

  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) {
    return 'Missing dashboard section'
  }

  const titleMatch = dashboardSection.match(/(?:^|\n)\s{2}title:\s*(.+)/)
  if (!titleMatch || !normalizeYamlValue(titleMatch[1] ?? '')) {
    return 'Missing dashboard title'
  }

  const panelsMatch = dashboardSection.match(/(?:^|\n)\s{2}panels:\s*(?:\n|\[])/)
  if (!panelsMatch) {
    return 'Missing dashboard panels section'
  }

  return null
}

function extractVariables(rawYaml: string): string[] {
  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) {
    return []
  }

  const variablesSectionMatch = dashboardSection.match(
    /(?:^|\n)\s{2}variables:\s*\n([\s\S]*?)(?=\n\s{2}[a-zA-Z_][\w-]*:\s*|\s*$)/,
  )

  const section = variablesSectionMatch?.[1] ?? ''
  return [...section.matchAll(/(?:^|\n)\s{4}-\s*name:\s*(.+)/g)]
    .map(match => normalizeYamlValue(match[1] ?? ''))
    .filter(name => name.length > 0)
}

function extractTimeRangePreset(rawYaml: string, fallback: string): string {
  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) {
    return fallback
  }

  const fromMatch = dashboardSection.match(/(?:^|\n)\s{4}from:\s*(.+)/)
  const toMatch = dashboardSection.match(/(?:^|\n)\s{4}to:\s*(.+)/)

  const fromValue = normalizeYamlValue(fromMatch?.[1] ?? '')
  const toValue = normalizeYamlValue(toMatch?.[1] ?? '')
  if (!fromValue || !toValue) {
    return fallback
  }

  return TIME_RANGE_LOOKUP[`${fromValue}|${toValue}`] ?? fallback
}

function extractRefreshInterval(rawYaml: string, fallback: string): string {
  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) {
    return fallback
  }

  const refreshMatch = dashboardSection.match(/(?:^|\n)\s{2}refresh_interval:\s*(.+)/)
  const value = normalizeYamlValue(refreshMatch?.[1] ?? '')
  return REFRESH_OPTIONS.some(option => option.value === value) ? value : fallback
}

function extractTitleAndDescription(rawYaml: string): { title: string; description: string } {
  const dashboardSection = extractDashboardSection(rawYaml)
  const titleMatch = dashboardSection.match(/(?:^|\n)\s{2}title:\s*(.+)/)
  const descriptionMatch = dashboardSection.match(/(?:^|\n)\s{2}description:\s*(.+)/)

  return {
    title: normalizeYamlValue(titleMatch?.[1] ?? dashboard.value?.title ?? ''),
    description: normalizeYamlValue(descriptionMatch?.[1] ?? ''),
  }
}

async function saveGeneralSettings() {
  if (!dashboard.value || !canEdit.value || isSaving.value) {
    return
  }

  if (!title.value.trim()) {
    actionError.value = 'Dashboard name is required'
    return
  }

  isSaving.value = true
  resetFormState()

  try {
    await updateDashboard(dashboard.value.id, {
      title: title.value.trim(),
      description: description.value.trim() || undefined,
    })

    dashboard.value = {
      ...dashboard.value,
      title: title.value.trim(),
      description: description.value.trim() || undefined,
    }

    persistDashboardViewSettings({
      timeRangePreset: timeRangePreset.value,
      refreshInterval: refreshInterval.value,
      variables: parsedVariables.value,
    })

    successMessage.value = 'Dashboard settings saved'
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Failed to save dashboard settings'
  } finally {
    isSaving.value = false
  }
}

async function saveYamlSettings() {
  if (!dashboard.value || !canEdit.value || isYamlSaving.value) {
    return
  }

  yamlValidationError.value = validateYamlContent(yamlContent.value)
  if (yamlValidationError.value) {
    return
  }

  const { title: nextTitle, description: nextDescription } = extractTitleAndDescription(yamlContent.value)
  if (!nextTitle.trim()) {
    yamlValidationError.value = 'Dashboard title is required'
    return
  }

  isYamlSaving.value = true
  resetFormState()

  try {
    await updateDashboard(dashboard.value.id, {
      title: nextTitle,
      description: nextDescription || undefined,
    })

    const yamlSettings = {
      timeRangePreset: extractTimeRangePreset(yamlContent.value, timeRangePreset.value),
      refreshInterval: extractRefreshInterval(yamlContent.value, refreshInterval.value),
      variables: extractVariables(yamlContent.value),
    }

    dashboard.value = {
      ...dashboard.value,
      title: nextTitle,
      description: nextDescription || undefined,
    }
    title.value = nextTitle
    description.value = nextDescription
    timeRangePreset.value = yamlSettings.timeRangePreset
    refreshInterval.value = yamlSettings.refreshInterval
    variablesInput.value = yamlSettings.variables.join(', ')
    persistDashboardViewSettings(yamlSettings)

    originalYamlContent.value = yamlContent.value
    yamlValidationError.value = null
    successMessage.value = 'Dashboard YAML saved'
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Failed to save dashboard YAML'
  } finally {
    isYamlSaving.value = false
  }
}

async function replaceWithGrafana() {
  if (!grafanaSource.value.trim() || isConvertingGrafana.value) {
    return
  }

  isConvertingGrafana.value = true
  actionError.value = null
  yamlValidationError.value = null

  try {
    const response = await convertGrafanaDashboard(grafanaSource.value, 'yaml')
    yamlContent.value = response.content
    grafanaWarnings.value = response.warnings
    yamlValidationError.value = validateYamlContent(response.content)
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Failed to convert Grafana dashboard'
  } finally {
    isConvertingGrafana.value = false
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

async function exportSettings() {
  if (!dashboard.value || isExporting.value) {
    return
  }

  isExporting.value = true
  actionError.value = null

  try {
    const fileBlob = await exportDashboardYaml(dashboard.value.id)
    const objectUrl = URL.createObjectURL(fileBlob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = fileNameFromTitle(dashboard.value.title)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(objectUrl)

    successMessage.value = 'Dashboard export downloaded'
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Failed to export dashboard'
  } finally {
    isExporting.value = false
  }
}

function goBack() {
  router.push(`/app/dashboards/${dashboardId.value}`)
}

watch(
  () => route.params.id,
  async () => {
    await loadData()
  },
)

watch(
  [() => route.params.section, canManagePermissions, () => currentOrg.value?.id],
  () => {
    const section = route.params.section as string | undefined
    if (!isSectionAllowed(section)) {
      router.replace(sectionPath('general'))
    }
  },
  { immediate: true },
)

onMounted(async () => {
  await loadData()
})
</script>

<template>
  <div class="dashboard-settings">
    <header class="page-header">
      <button class="btn-back" @click="goBack" title="Back to Dashboard">
        <ArrowLeft :size="20" />
      </button>
      <div class="header-content">
        <h1>Dashboard Settings</h1>
        <p v-if="dashboard">{{ dashboard.title }}</p>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="dashboard" class="settings-layout">
      <aside class="settings-sidebar" data-testid="dashboard-settings-sidebar">
        <button
          v-for="section in settingsSections"
          :key="section.key"
          class="settings-sidebar-link"
          :class="{ active: activeSection === section.key }"
          :data-testid="`settings-section-${section.key}`"
          @click="navigateToSection(section.key)"
        >
          {{ section.label }}
        </button>
      </aside>

      <div class="settings-content">
        <p v-if="!canEdit && activeSection !== 'permissions'" class="viewer-note">
          You have view-only access. Settings are visible, but only editors and admins can save changes.
        </p>

        <section v-if="activeSection === 'general'" class="settings-section">
          <div class="section-header">
            <h2><Settings :size="18" /> General</h2>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label for="dashboard-name">Name</label>
              <input
                id="dashboard-name"
                v-model="title"
                type="text"
                :disabled="!canEdit || isSaving"
                autocomplete="off"
              />
            </div>

            <div class="form-group">
              <label for="dashboard-description">Description</label>
              <textarea
                id="dashboard-description"
                v-model="description"
                rows="3"
                :disabled="!canEdit || isSaving"
                placeholder="Optional dashboard description"
              ></textarea>
            </div>

            <div class="form-group">
              <label for="dashboard-time-range">Default time range</label>
              <select id="dashboard-time-range" v-model="timeRangePreset" :disabled="!canEdit || isSaving">
                <option v-for="option in TIME_RANGE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="dashboard-refresh">Refresh interval</label>
              <select id="dashboard-refresh" v-model="refreshInterval" :disabled="!canEdit || isSaving">
                <option v-for="option in REFRESH_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="dashboard-variables">Variable names (comma-separated)</label>
              <input
                id="dashboard-variables"
                v-model="variablesInput"
                type="text"
                :disabled="!canEdit || isSaving"
                placeholder="env, cluster, instance"
              />
            </div>
          </div>

          <div class="section-actions">
            <button type="button" class="btn btn-secondary btn-export" :disabled="isExporting" @click="exportSettings">
              <Download :size="14" />
              <span>{{ isExporting ? 'Exporting...' : 'Export YAML' }}</span>
            </button>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="save-dashboard-settings"
              :disabled="!canEdit || isSaving"
              @click="saveGeneralSettings"
            >
              {{ isSaving ? 'Saving...' : 'Save settings' }}
            </button>
          </div>
        </section>

        <section v-else-if="activeSection === 'yaml'" class="settings-section yaml-section">
          <div class="yaml-section-header">
            <h2>Dashboard YAML</h2>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="isConvertingGrafana || isYamlSaving"
              data-testid="grafana-replace-toggle"
              @click="showGrafanaReplace = !showGrafanaReplace"
            >
              {{ showGrafanaReplace ? 'Hide Grafana replace' : 'Replace with Grafana' }}
            </button>
          </div>

          <p class="yaml-hint">
            Edit dashboard YAML directly. Validation runs as you type and shows required schema fields.
          </p>

          <p v-if="isYamlLoading" class="yaml-hint">Loading current dashboard YAML...</p>

          <textarea
            v-else
            v-model="yamlContent"
            class="yaml-editor"
            data-testid="yaml-editor-input"
            spellcheck="false"
            :readonly="!canEdit || isYamlSaving"
            @input="yamlValidationError = validateYamlContent(yamlContent)"
          ></textarea>

          <div v-if="showGrafanaReplace" class="grafana-replace" data-testid="grafana-replace-panel">
            <label for="grafana-replace-source">Grafana JSON</label>
            <textarea
              id="grafana-replace-source"
              v-model="grafanaSource"
              rows="5"
              placeholder="Paste Grafana dashboard JSON"
              data-testid="grafana-source"
              :disabled="isConvertingGrafana || isYamlSaving"
            ></textarea>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="!grafanaSource.trim() || isConvertingGrafana || isYamlSaving"
              data-testid="grafana-replace-convert"
              @click="replaceWithGrafana"
            >
              {{ isConvertingGrafana ? 'Converting...' : 'Convert to YAML' }}
            </button>
            <ul v-if="grafanaWarnings.length" class="warning-list" data-testid="grafana-warnings">
              <li v-for="warning in grafanaWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>

          <div v-if="yamlDiffPreview.length" class="diff-preview" data-testid="yaml-diff-preview">
            <h4>Diff preview</h4>
            <pre>{{ yamlDiffPreview.join('\n') }}</pre>
          </div>

          <div class="section-actions">
            <button type="button" class="btn btn-secondary btn-export" :disabled="isExporting" @click="exportSettings">
              <Download :size="14" />
              <span>{{ isExporting ? 'Exporting...' : 'Export YAML' }}</span>
            </button>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="save-dashboard-yaml"
              :disabled="!canEdit || isYamlSaving"
              @click="saveYamlSettings"
            >
              {{ isYamlSaving ? 'Saving YAML...' : 'Save YAML' }}
            </button>
          </div>
        </section>

        <section v-else class="settings-section permissions-section" data-testid="permissions-settings-panel">
          <h2>Permissions</h2>
          <p class="permissions-hint">Manage who can view, edit, or administer this dashboard.</p>
          <DashboardPermissionsEditor
            v-if="permissionsOrgId"
            data-testid="dashboard-permissions-editor"
            :dashboard="dashboard"
            :org-id="permissionsOrgId"
          />
          <p v-else class="inline-state">Permissions are unavailable until organization context is loaded.</p>
        </section>

        <p v-if="actionError" class="error-message">{{ actionError }}</p>
        <p v-if="yamlValidationError" class="error-message" data-testid="yaml-validation-error">
          {{ yamlValidationError }}
        </p>
        <p v-if="successMessage" class="success-message">{{ successMessage }}</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
.dashboard-settings {
  padding: 1.35rem 1.5rem;
  max-width: 1080px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.2rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.btn-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--surface-2);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-back:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-content h1 {
  margin: 0 0 0.25rem 0;
  font-size: 1.03rem;
  font-weight: 700;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.header-content p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.loading,
.error {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.error {
  color: var(--accent-danger);
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  padding: 0.75rem;
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 1rem;
}

.settings-sidebar-link {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text-secondary);
  padding: 0.65rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-sidebar-link:hover {
  color: var(--text-primary);
  border-color: rgba(252, 211, 77, 0.22);
  background: rgba(31, 49, 73, 0.64);
}

.settings-sidebar-link.active {
  color: #FCD34D;
  border-color: rgba(245, 158, 11, 0.34);
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.18), rgba(99, 102, 241, 0.1));
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-section {
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  padding: 1.2rem;
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: 0.7rem;
}

.section-header h2,
.settings-section h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.viewer-note {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(252, 211, 77, 0.3);
  border-radius: 10px;
  background: rgba(252, 211, 77, 0.08);
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.form-grid {
  display: grid;
  gap: 0.75rem;
}

.form-group {
  display: grid;
  gap: 0.35rem;
}

label {
  font-size: 0.82rem;
  color: var(--text-primary);
}

input,
textarea,
select {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-primary);
  background: var(--surface-1);
  color: var(--text-primary);
}

input:disabled,
textarea:disabled,
select:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.yaml-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.yaml-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.yaml-editor {
  min-height: 320px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.5;
}

.grafana-replace {
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 0.7rem;
  background: var(--surface-2);
  display: grid;
  gap: 0.55rem;
}

.warning-list {
  margin: 0;
  padding-left: 1.1rem;
  color: #facc15;
  font-size: 0.78rem;
}

.diff-preview {
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 0.7rem;
  background: rgba(148, 163, 184, 0.08);
}

.diff-preview h4 {
  margin: 0 0 0.45rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.diff-preview pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.74rem;
  line-height: 1.45;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.permissions-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.inline-state {
  padding: 0.8rem;
  border: 1px dashed var(--border-primary);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.section-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.7rem;
}

.error-message,
.success-message {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  font-size: 0.82rem;
}

.error-message {
  border: 1px solid rgba(255, 107, 107, 0.3);
  background: rgba(255, 107, 107, 0.1);
  color: var(--accent-danger);
}

.success-message {
  border: 1px solid rgba(78, 205, 196, 0.3);
  background: rgba(78, 205, 196, 0.1);
  color: var(--accent-success);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.58rem 0.9rem;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}

.btn-secondary {
  background: transparent;
  border-color: #F59E0B;
  color: #FCD34D;
}

.btn-primary {
  background: var(--accent-primary);
  color: #1a0f00;
}

.btn-export {
  gap: 0.4rem;
}

@media (max-width: 900px) {
  .dashboard-settings {
    padding: 0.9rem;
  }

  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding: 0.5rem;
    gap: 0.35rem;
  }

  .settings-sidebar-link {
    width: auto;
    min-width: 110px;
    text-align: center;
    white-space: nowrap;
  }

  .section-actions,
  .yaml-section-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
