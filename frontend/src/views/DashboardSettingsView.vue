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
  if (canManagePermissions.value) return ALL_SECTIONS
  return ALL_SECTIONS.filter((section) => section.key !== 'permissions')
})

const parsedVariables = computed(() => {
  return variablesInput.value.split(',').map(v => v.trim()).filter(v => v.length > 0)
})

const yamlDirty = computed(() => yamlContent.value !== originalYamlContent.value)

const yamlDiffPreview = computed(() => {
  if (!yamlDirty.value) return [] as string[]
  const originalLines = originalYamlContent.value.split('\n')
  const updatedLines = yamlContent.value.split('\n')
  const maxLength = Math.max(originalLines.length, updatedLines.length)
  const preview: string[] = []
  for (let index = 0; index < maxLength; index += 1) {
    const originalLine = originalLines[index]
    const updatedLine = updatedLines[index]
    if (originalLine === updatedLine) continue
    if (typeof originalLine === 'string') preview.push(`- ${originalLine}`)
    if (typeof updatedLine === 'string') preview.push(`+ ${updatedLine}`)
    if (preview.length >= 16) break
  }
  return preview
})

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return value === 'general' || value === 'yaml' || value === 'permissions'
}

function isSectionAllowed(value: string | undefined): value is SettingsSection {
  if (!isSettingsSection(value)) return false
  if (value === 'permissions' && currentOrg.value && !canManagePermissions.value) return false
  return true
}

const activeSection = computed<SettingsSection>(() => {
  const section = route.params.section as string | undefined
  return isSectionAllowed(section) ? section : 'general'
})

function dashboardLoadErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message === 'Not a member of this organization') return 'You do not have permission to view this dashboard'
  return 'Dashboard not found'
}

function sectionPath(section: SettingsSection): string {
  return `/app/dashboards/${dashboardId.value}/settings/${section}`
}

function navigateToSection(section: SettingsSection) {
  if (section === activeSection.value) return
  successMessage.value = null
  actionError.value = null
  router.push(sectionPath(section))
}

function readStoredDashboardSettings(): Record<string, DashboardViewSettings> {
  const rawSettings = localStorage.getItem(DASHBOARD_VIEW_SETTINGS_KEY)
  if (!rawSettings) return {}
  try { return JSON.parse(rawSettings) as Record<string, DashboardViewSettings> } catch { return {} }
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
  if (!dashboard.value) return
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
    if (!currentOrg.value) await fetchOrganizations()
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
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).trim()
  return trimmed
}

function extractDashboardSection(rawYaml: string): string {
  const dashboardSectionMatch = rawYaml.match(/(?:^|\n)dashboard:\s*\n([\s\S]*)/)
  return dashboardSectionMatch?.[1] ?? ''
}

function validateYamlContent(rawYaml: string): string | null {
  if (!rawYaml.trim()) return 'YAML content is required'
  const schemaVersionMatch = rawYaml.match(/(?:^|\n)schema_version:\s*(\d+)/)
  if (!schemaVersionMatch) return 'Missing schema_version'
  if (schemaVersionMatch[1] !== '1') return `Unsupported schema_version ${schemaVersionMatch[1]}`
  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) return 'Missing dashboard section'
  const titleMatch = dashboardSection.match(/(?:^|\n)\s{2}title:\s*(.+)/)
  if (!titleMatch || !normalizeYamlValue(titleMatch[1] ?? '')) return 'Missing dashboard title'
  const panelsMatch = dashboardSection.match(/(?:^|\n)\s{2}panels:\s*(?:\n|\[])/)
  if (!panelsMatch) return 'Missing dashboard panels section'
  return null
}

function extractVariables(rawYaml: string): string[] {
  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) return []
  const variablesSectionMatch = dashboardSection.match(/(?:^|\n)\s{2}variables:\s*\n([\s\S]*?)(?=\n\s{2}[a-zA-Z_][\w-]*:\s*|\s*$)/)
  const section = variablesSectionMatch?.[1] ?? ''
  return [...section.matchAll(/(?:^|\n)\s{4}-\s*name:\s*(.+)/g)].map(match => normalizeYamlValue(match[1] ?? '')).filter(name => name.length > 0)
}

function extractTimeRangePreset(rawYaml: string, fallback: string): string {
  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) return fallback
  const fromMatch = dashboardSection.match(/(?:^|\n)\s{4}from:\s*(.+)/)
  const toMatch = dashboardSection.match(/(?:^|\n)\s{4}to:\s*(.+)/)
  const fromValue = normalizeYamlValue(fromMatch?.[1] ?? '')
  const toValue = normalizeYamlValue(toMatch?.[1] ?? '')
  if (!fromValue || !toValue) return fallback
  return TIME_RANGE_LOOKUP[`${fromValue}|${toValue}`] ?? fallback
}

function extractRefreshInterval(rawYaml: string, fallback: string): string {
  const dashboardSection = extractDashboardSection(rawYaml)
  if (!dashboardSection) return fallback
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
  if (!dashboard.value || !canEdit.value || isSaving.value) return
  if (!title.value.trim()) { actionError.value = 'Dashboard name is required'; return }
  isSaving.value = true
  resetFormState()
  try {
    await updateDashboard(dashboard.value.id, { title: title.value.trim(), description: description.value.trim() || undefined })
    dashboard.value = { ...dashboard.value, title: title.value.trim(), description: description.value.trim() || undefined }
    persistDashboardViewSettings({ timeRangePreset: timeRangePreset.value, refreshInterval: refreshInterval.value, variables: parsedVariables.value })
    successMessage.value = 'Dashboard settings saved'
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Failed to save dashboard settings'
  } finally {
    isSaving.value = false
  }
}

async function saveYamlSettings() {
  if (!dashboard.value || !canEdit.value || isYamlSaving.value) return
  yamlValidationError.value = validateYamlContent(yamlContent.value)
  if (yamlValidationError.value) return
  const { title: nextTitle, description: nextDescription } = extractTitleAndDescription(yamlContent.value)
  if (!nextTitle.trim()) { yamlValidationError.value = 'Dashboard title is required'; return }
  isYamlSaving.value = true
  resetFormState()
  try {
    await updateDashboard(dashboard.value.id, { title: nextTitle, description: nextDescription || undefined })
    const yamlSettings = {
      timeRangePreset: extractTimeRangePreset(yamlContent.value, timeRangePreset.value),
      refreshInterval: extractRefreshInterval(yamlContent.value, refreshInterval.value),
      variables: extractVariables(yamlContent.value),
    }
    dashboard.value = { ...dashboard.value, title: nextTitle, description: nextDescription || undefined }
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
  if (!grafanaSource.value.trim() || isConvertingGrafana.value) return
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
  const normalized = titleValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${normalized || 'dashboard'}.yaml`
}

async function exportSettings() {
  if (!dashboard.value || isExporting.value) return
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

function goBack() { router.push(`/app/dashboards/${dashboardId.value}`) }

watch(() => route.params.id, async () => { await loadData() })
watch([() => route.params.section, canManagePermissions, () => currentOrg.value?.id], () => {
  const section = route.params.section as string | undefined
  if (!isSectionAllowed(section)) router.replace(sectionPath('general'))
}, { immediate: true })
onMounted(async () => { await loadData() })
</script>

<template>
  <div class="py-[1.35rem] px-6 max-w-[1080px] mx-auto max-md:p-[0.9rem]">
    <header class="flex items-center gap-4 mb-[1.2rem] p-4 border border-border rounded-[14px] bg-surface-1 shadow-sm">
      <button class="flex items-center justify-center w-10 h-10 bg-surface-2 border border-border rounded-[10px] text-text-1 cursor-pointer transition-all duration-200 hover:bg-bg-hover hover:text-text-0" @click="goBack" title="Back to Dashboard">
        <ArrowLeft :size="20" />
      </button>
      <div>
        <h1 class="mb-1 text-[1.03rem] font-bold font-mono uppercase tracking-[0.04em]">Dashboard Settings</h1>
        <p v-if="dashboard" class="text-text-1 text-sm">{{ dashboard.title }}</p>
      </div>
    </header>

    <div v-if="loading" class="text-center p-8 text-text-1">Loading...</div>
    <div v-else-if="error" class="text-center p-8 text-danger">{{ error }}</div>
    <div v-else-if="dashboard" class="grid grid-cols-[220px_minmax(0,1fr)] gap-4 items-start max-md:grid-cols-1">
      <aside class="flex flex-col gap-[0.45rem] bg-surface-1 border border-border rounded-[14px] p-3 shadow-sm sticky top-4 max-md:static max-md:flex-row max-md:overflow-x-auto max-md:p-2 max-md:gap-[0.35rem]" data-testid="dashboard-settings-sidebar">
        <button
          v-for="section in settingsSections"
          :key="section.key"
          class="w-full text-left border border-transparent rounded-[10px] text-text-1 py-[0.65rem] px-3 text-[0.85rem] font-semibold cursor-pointer transition-all duration-200 hover:text-text-0 hover:border-[rgba(252,211,77,0.22)] max-md:w-auto max-md:min-w-[110px] max-md:text-center max-md:whitespace-nowrap"
          :class="activeSection === section.key ? 'text-text-accent! border-[rgba(245,158,11,0.34)]!' : 'bg-transparent'"
          :style="activeSection === section.key ? 'background: linear-gradient(90deg, rgba(245, 158, 11, 0.18), rgba(99, 102, 241, 0.1))' : ''"
          :data-testid="`settings-section-${section.key}`"
          @click="navigateToSection(section.key)"
        >
          {{ section.label }}
        </button>
      </aside>

      <div class="flex flex-col gap-4">
        <p v-if="!canEdit && activeSection !== 'permissions'" class="py-3 px-4 border border-[rgba(252,211,77,0.3)] rounded-[10px] text-text-1 text-[0.84rem]" style="background: rgba(252, 211, 77, 0.08)">
          You have view-only access. Settings are visible, but only editors and admins can save changes.
        </p>

        <section v-if="activeSection === 'general'" class="bg-surface-1 border border-border rounded-[14px] p-[1.2rem] shadow-sm grid gap-[0.7rem]">
          <h2 class="flex items-center gap-2 text-base font-semibold"><Settings :size="18" /> General</h2>

          <div class="grid gap-3">
            <div class="grid gap-[0.35rem]">
              <label for="dashboard-name" class="text-[0.82rem] text-text-0">Name</label>
              <input id="dashboard-name" v-model="title" type="text" :disabled="!canEdit || isSaving" autocomplete="off" class="w-full py-[0.6rem] px-3 rounded-[8px] border border-border bg-surface-1 text-text-0 disabled:opacity-70 disabled:cursor-not-allowed" />
            </div>
            <div class="grid gap-[0.35rem]">
              <label for="dashboard-description" class="text-[0.82rem] text-text-0">Description</label>
              <textarea id="dashboard-description" v-model="description" rows="3" :disabled="!canEdit || isSaving" placeholder="Optional dashboard description" class="w-full py-[0.6rem] px-3 rounded-[8px] border border-border bg-surface-1 text-text-0 disabled:opacity-70 disabled:cursor-not-allowed"></textarea>
            </div>
            <div class="grid gap-[0.35rem]">
              <label for="dashboard-time-range" class="text-[0.82rem] text-text-0">Default time range</label>
              <select id="dashboard-time-range" v-model="timeRangePreset" :disabled="!canEdit || isSaving" class="w-full py-[0.6rem] px-3 rounded-[8px] border border-border bg-surface-1 text-text-0 disabled:opacity-70 disabled:cursor-not-allowed">
                <option v-for="option in TIME_RANGE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
            <div class="grid gap-[0.35rem]">
              <label for="dashboard-refresh" class="text-[0.82rem] text-text-0">Refresh interval</label>
              <select id="dashboard-refresh" v-model="refreshInterval" :disabled="!canEdit || isSaving" class="w-full py-[0.6rem] px-3 rounded-[8px] border border-border bg-surface-1 text-text-0 disabled:opacity-70 disabled:cursor-not-allowed">
                <option v-for="option in REFRESH_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
            <div class="grid gap-[0.35rem]">
              <label for="dashboard-variables" class="text-[0.82rem] text-text-0">Variable names (comma-separated)</label>
              <input id="dashboard-variables" v-model="variablesInput" type="text" :disabled="!canEdit || isSaving" placeholder="env, cluster, instance" class="w-full py-[0.6rem] px-3 rounded-[8px] border border-border bg-surface-1 text-text-0 disabled:opacity-70 disabled:cursor-not-allowed" />
            </div>
          </div>

          <div class="flex justify-between items-center gap-[0.7rem] max-md:flex-col max-md:items-start">
            <button type="button" class="inline-flex items-center gap-[0.4rem] py-[0.58rem] px-[0.9rem] rounded-[8px] border border-accent bg-transparent text-text-accent cursor-pointer" :disabled="isExporting" @click="exportSettings">
              <Download :size="14" />
              <span>{{ isExporting ? 'Exporting...' : 'Export YAML' }}</span>
            </button>
            <button type="button" class="inline-flex items-center py-[0.58rem] px-[0.9rem] rounded-[8px] border-none bg-accent text-[#1a0f00] cursor-pointer" data-testid="save-dashboard-settings" :disabled="!canEdit || isSaving" @click="saveGeneralSettings">
              {{ isSaving ? 'Saving...' : 'Save settings' }}
            </button>
          </div>
        </section>

        <section v-else-if="activeSection === 'yaml'" class="bg-surface-1 border border-border rounded-[14px] p-[1.2rem] shadow-sm grid gap-[0.7rem]">
          <div class="flex items-center justify-between gap-[0.7rem] max-md:flex-col max-md:items-start">
            <h2 class="text-base font-semibold">Dashboard YAML</h2>
            <button type="button" class="inline-flex items-center py-[0.58rem] px-[0.9rem] rounded-[8px] border border-accent bg-transparent text-text-accent cursor-pointer" :disabled="isConvertingGrafana || isYamlSaving" data-testid="grafana-replace-toggle" @click="showGrafanaReplace = !showGrafanaReplace">
              {{ showGrafanaReplace ? 'Hide Grafana replace' : 'Replace with Grafana' }}
            </button>
          </div>
          <p class="text-text-1 text-[0.82rem]">Edit dashboard YAML directly. Validation runs as you type and shows required schema fields.</p>
          <p v-if="isYamlLoading" class="text-text-1 text-[0.82rem]">Loading current dashboard YAML...</p>
          <textarea v-else v-model="yamlContent" class="w-full py-[0.6rem] px-3 rounded-[8px] border border-border bg-surface-1 text-text-0 min-h-[320px] font-mono text-[0.78rem] leading-relaxed" data-testid="yaml-editor-input" spellcheck="false" :readonly="!canEdit || isYamlSaving" @input="yamlValidationError = validateYamlContent(yamlContent)"></textarea>

          <div v-if="showGrafanaReplace" class="border border-border rounded-[8px] p-[0.7rem] bg-surface-2 grid gap-[0.55rem]" data-testid="grafana-replace-panel">
            <label for="grafana-replace-source" class="text-[0.82rem] text-text-0">Grafana JSON</label>
            <textarea id="grafana-replace-source" v-model="grafanaSource" rows="5" placeholder="Paste Grafana dashboard JSON" data-testid="grafana-source" :disabled="isConvertingGrafana || isYamlSaving" class="w-full py-[0.6rem] px-3 rounded-[8px] border border-border bg-surface-1 text-text-0"></textarea>
            <button type="button" class="inline-flex items-center py-[0.58rem] px-[0.9rem] rounded-[8px] border border-accent bg-transparent text-text-accent cursor-pointer" :disabled="!grafanaSource.trim() || isConvertingGrafana || isYamlSaving" data-testid="grafana-replace-convert" @click="replaceWithGrafana">
              {{ isConvertingGrafana ? 'Converting...' : 'Convert to YAML' }}
            </button>
            <ul v-if="grafanaWarnings.length" class="m-0 pl-[1.1rem] text-[#facc15] text-[0.78rem]" data-testid="grafana-warnings">
              <li v-for="warning in grafanaWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>

          <div v-if="yamlDiffPreview.length" class="border border-border rounded-[8px] p-[0.7rem]" style="background: rgba(148, 163, 184, 0.08)" data-testid="yaml-diff-preview">
            <h4 class="mb-[0.45rem] text-[0.75rem] uppercase tracking-[0.04em] text-text-1">Diff preview</h4>
            <pre class="whitespace-pre-wrap break-words text-[0.74rem] leading-[1.45] font-mono">{{ yamlDiffPreview.join('\n') }}</pre>
          </div>

          <div class="flex justify-between items-center gap-[0.7rem] max-md:flex-col max-md:items-start">
            <button type="button" class="inline-flex items-center gap-[0.4rem] py-[0.58rem] px-[0.9rem] rounded-[8px] border border-accent bg-transparent text-text-accent cursor-pointer" :disabled="isExporting" @click="exportSettings">
              <Download :size="14" />
              <span>{{ isExporting ? 'Exporting...' : 'Export YAML' }}</span>
            </button>
            <button type="button" class="inline-flex items-center py-[0.58rem] px-[0.9rem] rounded-[8px] border-none bg-accent text-[#1a0f00] cursor-pointer" data-testid="save-dashboard-yaml" :disabled="!canEdit || isYamlSaving" @click="saveYamlSettings">
              {{ isYamlSaving ? 'Saving YAML...' : 'Save YAML' }}
            </button>
          </div>
        </section>

        <section v-else class="bg-surface-1 border border-border rounded-[14px] p-[1.2rem] shadow-sm grid gap-[0.7rem]" data-testid="permissions-settings-panel">
          <h2 class="text-base font-semibold">Permissions</h2>
          <p class="text-text-1 text-[0.84rem]">Manage who can view, edit, or administer this dashboard.</p>
          <DashboardPermissionsEditor v-if="permissionsOrgId" data-testid="dashboard-permissions-editor" :dashboard="dashboard" :org-id="permissionsOrgId" />
          <p v-else class="p-[0.8rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8rem]">Permissions are unavailable until organization context is loaded.</p>
        </section>

        <p v-if="actionError" class="py-[0.65rem] px-3 rounded-[8px] text-[0.82rem] text-danger" style="border: 1px solid rgba(255, 107, 107, 0.3); background: rgba(255, 107, 107, 0.1)">{{ actionError }}</p>
        <p v-if="yamlValidationError" class="py-[0.65rem] px-3 rounded-[8px] text-[0.82rem] text-danger" style="border: 1px solid rgba(255, 107, 107, 0.3); background: rgba(255, 107, 107, 0.1)" data-testid="yaml-validation-error">{{ yamlValidationError }}</p>
        <p v-if="successMessage" class="py-[0.65rem] px-3 rounded-[8px] text-[0.82rem] text-success" style="border: 1px solid rgba(78, 205, 196, 0.3); background: rgba(78, 205, 196, 0.1)">{{ successMessage }}</p>
      </div>
    </div>
  </div>
</template>
