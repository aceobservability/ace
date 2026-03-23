<script setup lang="ts">
import { ArrowLeft, Download, Settings } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { convertGrafanaDashboard } from '../api/converter'
import { exportDashboardYaml, getDashboard, updateDashboard } from '../api/dashboards'
import DashboardPermissionsEditor from '../components/DashboardPermissionsEditor.vue'
import { useOrganization } from '../composables/useOrganization'
import type { Dashboard } from '../types/dashboard'

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
const canManagePermissions = computed(() =>
  Boolean(currentOrg.value && (currentOrg.value.role === 'admin' || currentOrg.value.role === 'editor')),
)
const canEdit = computed(() =>
  Boolean(
    currentOrg.value && (currentOrg.value.role === 'admin' || currentOrg.value.role === 'editor'),
  ),
)
const permissionsOrgId = computed(
  () => currentOrgId.value || dashboard.value?.organization_id || null,
)

const settingsSections = computed(() => {
  if (canManagePermissions.value) {
    return ALL_SECTIONS
  }

  return ALL_SECTIONS.filter((section) => section.key !== 'permissions')
})

const parsedVariables = computed(() => {
  return variablesInput.value
    .split(',')
    .map((variable) => variable.trim())
    .filter((variable) => variable.length > 0)
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
  return `/dashboards/${dashboardId.value}/settings/${section}`
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
    .map((match) => normalizeYamlValue(match[1] ?? ''))
    .filter((name) => name.length > 0)
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
  return REFRESH_OPTIONS.some((option) => option.value === value) ? value : fallback
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

  const { title: nextTitle, description: nextDescription } = extractTitleAndDescription(
    yamlContent.value,
  )
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
  router.push(`/dashboards/${dashboardId.value}`)
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
  <div class="px-8 py-6 max-w-5xl mx-auto">
    <!-- Page header -->
    <button
      class="flex items-center gap-1 text-sm text-[var(--color-outline)] hover:text-[var(--color-on-surface)] transition mb-4"
      data-testid="dashboard-settings-back-btn"
      @click="goBack"
      title="Back to Dashboard"
    >
      <ArrowLeft :size="16" />
      <span>Back to dashboard</span>
    </button>
    <h1 class="text-2xl font-bold font-display text-[var(--color-on-surface)]">
      Dashboard Settings
    </h1>
    <p v-if="dashboard" class="mt-1 text-sm text-[var(--color-outline)]">{{ dashboard.title }}</p>

    <div v-if="loading" class="text-center py-8 text-[var(--color-outline)]">Loading...</div>
    <div v-else-if="error" class="text-center py-8 text-[var(--color-error)]">{{ error }}</div>
    <div v-else-if="dashboard">
      <!-- Underline tab bar -->
      <nav class="flex gap-1 border-b border-[color-mix(in_srgb,var(--color-outline-variant)_15%,transparent)] mt-6 mb-6" data-testid="dashboard-settings-sidebar">
        <button
          v-for="section in settingsSections"
          :key="section.key"
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer border-b-2"
          :class="activeSection === section.key
            ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
            : 'text-[var(--color-outline)] hover:text-[var(--color-on-surface)] border-transparent'"
          :data-testid="`settings-section-${section.key}`"
          @click="navigateToSection(section.key)"
        >
          {{ section.label }}
        </button>
      </nav>

      <div class="flex flex-col gap-4">
        <p
          v-if="!canEdit && activeSection !== 'permissions'"
          class="m-0 px-4 py-3 rounded-sm bg-[var(--color-tertiary)]/10 text-sm text-[var(--color-tertiary)]"
        >
          You have view-only access. Settings are visible, but only editors and admins can save changes.
        </p>

        <!-- General tab -->
        <section v-if="activeSection === 'general'" class="rounded-lg bg-[var(--color-surface-container-low)] p-6">
          <h2 class="flex items-center gap-2 m-0 text-base font-semibold font-display text-[var(--color-on-surface)] mb-4">
            <Settings :size="18" /> General
          </h2>

          <div class="grid gap-4">
            <div class="grid gap-1.5">
              <label for="dashboard-name" class="text-sm font-medium text-[var(--color-on-surface-variant)]">Name</label>
              <input
                id="dashboard-name"
                data-testid="dashboard-name-input"
                v-model="title"
                type="text"
                class="w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed border-none"
                :disabled="!canEdit || isSaving"
                autocomplete="off"
              />
            </div>

            <div class="grid gap-1.5">
              <label for="dashboard-description" class="text-sm font-medium text-[var(--color-on-surface-variant)]">Description</label>
              <textarea
                id="dashboard-description"
                data-testid="dashboard-description-input"
                v-model="description"
                rows="3"
                class="w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition min-h-[100px] resize-y disabled:opacity-60 disabled:cursor-not-allowed border-none"
                :disabled="!canEdit || isSaving"
                placeholder="Optional dashboard description"
              ></textarea>
            </div>

            <div class="grid gap-1.5">
              <label for="dashboard-time-range" class="text-sm font-medium text-[var(--color-on-surface-variant)]">Default time range</label>
              <select
                id="dashboard-time-range"
                data-testid="dashboard-time-range-select"
                v-model="timeRangePreset"
                class="w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed border-none"
                :disabled="!canEdit || isSaving"
              >
                <option v-for="option in TIME_RANGE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="grid gap-1.5">
              <label for="dashboard-refresh" class="text-sm font-medium text-[var(--color-on-surface-variant)]">Refresh interval</label>
              <select
                id="dashboard-refresh"
                data-testid="dashboard-refresh-select"
                v-model="refreshInterval"
                class="w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed border-none"
                :disabled="!canEdit || isSaving"
              >
                <option v-for="option in REFRESH_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="grid gap-1.5">
              <label for="dashboard-variables" class="text-sm font-medium text-[var(--color-on-surface-variant)]">Variable names (comma-separated)</label>
              <input
                id="dashboard-variables"
                v-model="variablesInput"
                type="text"
                class="w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed border-none"
                :disabled="!canEdit || isSaving"
                placeholder="env, cluster, instance"
              />
            </div>
          </div>

          <div class="flex justify-between items-center gap-3 mt-6">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-surface-container-high)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)]"
              data-testid="dashboard-export-yaml-btn"
              :disabled="isExporting"
              @click="exportSettings"
            >
              <Download :size="14" />
              <span>{{ isExporting ? 'Exporting...' : 'Export YAML' }}</span>
            </button>
            <button
              type="button"
              class="rounded-sm px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
              style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)"
              data-testid="save-dashboard-settings"
              :disabled="!canEdit || isSaving"
              @click="saveGeneralSettings"
            >
              {{ isSaving ? 'Saving...' : 'Save settings' }}
            </button>
          </div>
        </section>

        <!-- YAML tab -->
        <section v-else-if="activeSection === 'yaml'" class="rounded-lg bg-[var(--color-surface-container-low)] p-6">
          <div class="flex items-center justify-between gap-3 mb-2">
            <h2 class="m-0 text-base font-semibold font-display text-[var(--color-on-surface)]">Dashboard YAML</h2>
            <button
              type="button"
              class="rounded-sm bg-[var(--color-surface-container-high)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)]"
              :disabled="isConvertingGrafana || isYamlSaving"
              data-testid="grafana-replace-toggle"
              @click="showGrafanaReplace = !showGrafanaReplace"
            >
              {{ showGrafanaReplace ? 'Hide Grafana replace' : 'Replace with Grafana' }}
            </button>
          </div>

          <p class="m-0 text-sm text-[var(--color-outline)] mb-4">
            Edit dashboard YAML directly. Validation runs as you type and shows required schema fields.
          </p>

          <p v-if="isYamlLoading" class="m-0 text-sm text-[var(--color-outline)]">Loading current dashboard YAML...</p>

          <div v-else class="rounded-lg overflow-hidden mb-4 bg-[var(--color-surface-container-high)]">
            <textarea
              v-model="yamlContent"
              class="w-full min-h-[320px] px-3 py-2.5 text-xs leading-relaxed font-mono bg-transparent text-[var(--color-on-surface)] border-none focus:outline-none resize-y"
              data-testid="yaml-editor-input"
              spellcheck="false"
              :readonly="!canEdit || isYamlSaving"
              @input="yamlValidationError = validateYamlContent(yamlContent)"
            ></textarea>
          </div>

          <div
            v-if="showGrafanaReplace"
            class="rounded-lg bg-[var(--color-surface-container-high)] p-4 grid gap-3 mb-4"
            data-testid="grafana-replace-panel"
          >
            <label for="grafana-replace-source" class="text-sm font-medium text-[var(--color-on-surface-variant)]">Grafana JSON</label>
            <textarea
              id="grafana-replace-source"
              v-model="grafanaSource"
              rows="5"
              placeholder="Paste Grafana dashboard JSON"
              class="w-full rounded-sm bg-[var(--color-surface-bright)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition min-h-[100px] resize-y disabled:opacity-60 disabled:cursor-not-allowed border-none"
              data-testid="grafana-source"
              :disabled="isConvertingGrafana || isYamlSaving"
            ></textarea>
            <button
              type="button"
              class="rounded-sm bg-[var(--color-surface-bright)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-container-highest)] justify-self-start"
              :disabled="!grafanaSource.trim() || isConvertingGrafana || isYamlSaving"
              data-testid="grafana-replace-convert"
              @click="replaceWithGrafana"
            >
              {{ isConvertingGrafana ? 'Converting...' : 'Convert to YAML' }}
            </button>
            <ul
              v-if="grafanaWarnings.length"
              class="m-0 pl-5 text-xs text-[var(--color-tertiary)]"
              data-testid="grafana-warnings"
            >
              <li v-for="warning in grafanaWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>

          <div
            v-if="yamlDiffPreview.length"
            class="rounded-lg bg-[var(--color-surface-container-high)] p-4 mb-4"
            data-testid="yaml-diff-preview"
          >
            <h4 class="m-0 mb-2 text-xs font-mono uppercase tracking-[0.07em] text-[var(--color-outline)]">Diff preview</h4>
            <pre class="m-0 whitespace-pre-wrap break-words text-xs leading-snug font-mono text-[var(--color-on-surface)]">{{ yamlDiffPreview.join('\n') }}</pre>
          </div>

          <div class="flex justify-between items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-surface-container-high)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-bright)]"
              :disabled="isExporting"
              @click="exportSettings"
            >
              <Download :size="14" />
              <span>{{ isExporting ? 'Exporting...' : 'Export YAML' }}</span>
            </button>
            <button
              type="button"
              class="rounded-sm px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
              style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)"
              data-testid="save-dashboard-yaml"
              :disabled="!canEdit || isYamlSaving"
              @click="saveYamlSettings"
            >
              {{ isYamlSaving ? 'Saving YAML...' : 'Save YAML' }}
            </button>
          </div>
        </section>

        <!-- Permissions tab -->
        <section v-else class="rounded-lg bg-[var(--color-surface-container-low)] p-6" data-testid="permissions-settings-panel">
          <h2 class="m-0 text-base font-semibold font-display text-[var(--color-on-surface)] mb-2">Permissions</h2>
          <p class="m-0 text-sm text-[var(--color-outline)] mb-4">Manage who can view, edit, or administer this dashboard.</p>
          <DashboardPermissionsEditor
            v-if="permissionsOrgId"
            data-testid="dashboard-permissions-editor"
            :dashboard="dashboard"
            :org-id="permissionsOrgId"
          />
          <p
            v-else
            class="py-3 px-4 rounded-sm text-sm text-[var(--color-outline)]"
          >
            Permissions are unavailable until organization context is loaded.
          </p>
        </section>

        <p
          v-if="actionError"
          class="m-0 px-4 py-3 rounded-sm bg-[var(--color-error)]/10 text-sm text-[var(--color-error)]"
        >
          {{ actionError }}
        </p>
        <p
          v-if="yamlValidationError"
          class="m-0 px-4 py-3 rounded-sm bg-[var(--color-error)]/10 text-sm text-[var(--color-error)]"
          data-testid="yaml-validation-error"
        >
          {{ yamlValidationError }}
        </p>
        <p
          v-if="successMessage"
          class="m-0 px-4 py-3 rounded-sm bg-[var(--color-secondary)]/10 text-sm text-[var(--color-secondary)]"
        >
          {{ successMessage }}
        </p>
      </div>
    </div>
  </div>
</template>
