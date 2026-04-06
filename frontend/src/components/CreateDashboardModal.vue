<script setup lang="ts">
import { Globe, Loader2, Upload, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { convertGrafanaDashboard } from '../api/converter'
import { connectToGrafana, listGrafanaDashboards, getGrafanaDashboard } from '../api/grafanaDiscovery'
import type { GrafanaDashboardSummary } from '../api/grafanaDiscovery'
import { createDashboard, importDashboardYaml } from '../api/dashboards'
import { bulkCreateVariables } from '../api/variables'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import type { ConversionReport } from '../types/converter'

type CreationMode = 'create' | 'import' | 'grafana'
type ModalStep = 'choice' | 'form'
type GrafanaSubTab = 'upload' | 'connect'

const props = withDefaults(
  defineProps<{
    initialMode?: CreationMode
  }>(),
  {
    initialMode: 'create',
  },
)

const emit = defineEmits<{
  close: []
  created: []
}>()

const router = useRouter()
const { currentOrgId } = useOrganization()

const step = ref<ModalStep>('choice')
const title = ref('')
const description = ref('')
const mode = ref<CreationMode>(props.initialMode)
const loading = ref(false)
const error = ref<string | null>(null)
const yamlFileName = ref('')
const yamlContent = ref('')
const grafanaFileName = ref('')
const grafanaSource = ref('')
const grafanaWarnings = ref<string[]>([])
const convertingGrafana = ref(false)
const grafanaSubTab = ref<GrafanaSubTab>('upload')
const conversionReport = ref<ConversionReport | null>(null)

// Grafana auto-discovery state
const grafanaUrl = ref('')
const grafanaApiKey = ref('')
const grafanaConnecting = ref(false)
const grafanaConnected = ref(false)
const grafanaVersion = ref('')
const remoteDashboards = ref<GrafanaDashboardSummary[]>([])
const loadingRemoteDashboard = ref(false)

// Datasource mapping state
const { datasources: aceDatasources } = useDatasource()
const grafanaDatasourceNames = ref<string[]>([])
const datasourceMapping = ref<Record<string, string>>({})
const convertedVariables = ref<Array<{ name: string; type: string; label?: string; query?: string; multi: boolean; include_all: boolean }>>([])

interface ImportPreview {
  title: string
  description: string
  panelCount: number
}

const importPreview = ref<ImportPreview | null>(null)
const submitLabel = computed(() => {
  if (loading.value) {
    return mode.value === 'create' ? 'Creating...' : 'Importing...'
  }
  return mode.value === 'create' ? 'Create Dashboard' : 'Import Dashboard'
})

const canConvertGrafana = computed(
  () => grafanaSource.value.trim().length > 0 && !convertingGrafana.value && !loading.value,
)

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

function setMode(nextMode: CreationMode) {
  mode.value = nextMode
  error.value = null
}

function setImportPreviewFromDocument(document: {
  title: string
  description?: string
  panels: unknown[]
}) {
  importPreview.value = {
    title: document.title,
    description: document.description ?? '',
    panelCount: document.panels.length,
  }
}

function clearImportState() {
  yamlContent.value = ''
  yamlFileName.value = ''
  importPreview.value = null
  grafanaWarnings.value = []
}

function chooseBlank() {
  step.value = 'form'
  mode.value = 'create'
}

function chooseAI() {
  emit('close')
  router.push('/app/dashboards/new/ai')
}

async function handleYamlFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  clearImportState()
  error.value = null

  if (!file) {
    return
  }

  const lowerName = file.name.toLowerCase()
  if (!lowerName.endsWith('.yaml') && !lowerName.endsWith('.yml')) {
    error.value = 'Please upload a .yaml or .yml file'
    return
  }

  try {
    const content = await file.text()
    if (!content.trim()) {
      error.value = 'YAML file is empty'
      return
    }

    importPreview.value = buildYamlPreview(content)
    yamlContent.value = content
    yamlFileName.value = file.name
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Expected dashboard document format'
    error.value = `Invalid YAML file. ${reason}`
  }
}

async function handleGrafanaFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  grafanaSource.value = ''
  grafanaFileName.value = ''
  clearImportState()
  error.value = null

  if (!file) {
    return
  }

  const lowerName = file.name.toLowerCase()
  if (!lowerName.endsWith('.json')) {
    error.value = 'Please upload a .json file'
    return
  }

  try {
    const content = await file.text()
    if (!content.trim()) {
      error.value = 'Grafana JSON file is empty'
      return
    }
    grafanaSource.value = content
    grafanaFileName.value = file.name
  } catch {
    error.value = 'Failed to read selected Grafana file'
  }
}

async function handleGrafanaConnect() {
  if (!grafanaUrl.value.trim()) {
    error.value = 'Grafana URL is required'
    return
  }
  grafanaConnecting.value = true
  error.value = null
  try {
    const resp = await connectToGrafana(grafanaUrl.value, grafanaApiKey.value)
    if (!resp.ok) {
      error.value = resp.error || 'Failed to connect to Grafana'
      return
    }
    grafanaConnected.value = true
    grafanaVersion.value = resp.version || ''
    remoteDashboards.value = await listGrafanaDashboards(grafanaUrl.value, grafanaApiKey.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Connection failed'
  } finally {
    grafanaConnecting.value = false
  }
}

async function importRemoteDashboard(uid: string) {
  loadingRemoteDashboard.value = true
  error.value = null
  try {
    const dashJson = await getGrafanaDashboard(uid, grafanaUrl.value, grafanaApiKey.value)
    grafanaSource.value = dashJson
    grafanaFileName.value = `${uid}.json`
    await convertGrafana()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch dashboard'
  } finally {
    loadingRemoteDashboard.value = false
  }
}

function extractGrafanaDatasources(jsonContent: string) {
  try {
    const parsed = JSON.parse(jsonContent)
    const panels = parsed.dashboard?.panels ?? parsed.panels ?? []
    const names = new Set<string>()
    for (const panel of panels) {
      if (panel.datasource) {
        const name = typeof panel.datasource === 'string'
          ? panel.datasource
          : panel.datasource?.uid || panel.datasource?.type || ''
        if (name && name !== '-- Mixed --') names.add(name)
      }
    }
    grafanaDatasourceNames.value = Array.from(names)
  } catch {
    grafanaDatasourceNames.value = []
  }
}

async function convertGrafana() {
  if (!currentOrgId.value) {
    error.value = 'No organization selected'
    return
  }

  if (!grafanaSource.value.trim()) {
    error.value = 'Paste or upload Grafana JSON before converting'
    return
  }

  convertingGrafana.value = true
  error.value = null
  clearImportState()

  try {
    const response = await convertGrafanaDashboard(grafanaSource.value, 'yaml')
    yamlContent.value = response.content
    grafanaWarnings.value = response.warnings
    conversionReport.value = response.report ?? null
    setImportPreviewFromDocument(response.document)
    extractGrafanaDatasources(grafanaSource.value)

    // Variables are not included in v2 export format (counted in report only)
    convertedVariables.value = []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to convert Grafana dashboard'
  } finally {
    convertingGrafana.value = false
  }
}

async function handleSubmit() {
  if (!currentOrgId.value) {
    error.value = 'No organization selected'
    return
  }

  if (mode.value === 'create' && !title.value.trim()) {
    error.value = 'Title is required'
    return
  }

  if ((mode.value === 'import' || mode.value === 'grafana') && !importPreview.value) {
    error.value =
      mode.value === 'grafana'
        ? 'Convert Grafana JSON before importing'
        : 'Upload a valid YAML file before importing'
    return
  }

  loading.value = true
  error.value = null

  try {
    if (mode.value === 'create') {
      await createDashboard(currentOrgId.value, {
        title: title.value.trim(),
        description: description.value.trim() || undefined,
      })
    } else {
      const result = await importDashboardYaml(currentOrgId.value, yamlContent.value)

      // Persist variables if this was a Grafana import with variables
      if (mode.value === 'grafana' && convertedVariables.value.length > 0 && result?.id) {
        try {
          await bulkCreateVariables(result.id, convertedVariables.value.map((v, i) => ({
            name: v.name,
            type: v.type,
            label: v.label,
            query: v.query,
            multi: v.multi,
            include_all: v.include_all,
            sort_order: i,
          })))
        } catch {
          // Non-fatal: dashboard was created, variables failed
          console.warn('Failed to persist imported variables')
        }
      }
    }
    emit('created')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create dashboard'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    data-testid="create-dashboard-modal"
    :style="{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-lg rounded-xl shadow-2xl"
      :style="{
        backgroundColor: 'color-mix(in srgb, var(--color-surface-container-highest) 85%, transparent)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--color-outline-variant)',
      }"
    >
      <header class="flex items-center justify-between px-6 py-4" :style="{ borderBottom: '1px solid var(--color-outline-variant)' }">
        <h2
          class="font-display text-lg font-semibold"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Create Dashboard
        </h2>
        <button
          class="flex items-center justify-center h-8 w-8 rounded-md transition cursor-pointer"
          :style="{ color: 'var(--color-on-surface-variant)' }"
          data-testid="create-dashboard-close-btn"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>

      <!-- Step 1: Choice -->
      <div v-if="step === 'choice'" class="px-6 py-6">
        <p class="mb-5 text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">
          Choose how to create your dashboard.
        </p>
        <div class="flex flex-col gap-3">
          <button
            class="flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors cursor-pointer"
            :style="{
              borderColor: 'var(--color-outline-variant)',
              color: 'var(--color-on-surface)',
              backgroundColor: 'var(--color-surface-container-low)',
            }"
            @click="chooseBlank"
          >
            Blank Dashboard
          </button>
          <button
            class="flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }"
            @click="chooseAI"
          >
            Generate with AI
          </button>
        </div>
      </div>

      <!-- Step 2: Form -->
      <form v-else @submit.prevent="handleSubmit" class="px-6 py-4">
        <div class="flex gap-1 rounded-lg p-1 mb-4" :style="{ backgroundColor: 'var(--color-surface-container)' }" role="tablist" aria-label="Creation mode">
          <button
            type="button"
            class="rounded-md px-4 py-2 text-sm font-medium transition cursor-pointer"
            :style="{
              backgroundColor: mode === 'create' ? 'var(--color-surface-container-highest)' : 'transparent',
              color: mode === 'create' ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
            }"
            data-testid="create-mode-create-btn"
            :disabled="loading"
            @click="setMode('create')"
          >
            Create New
          </button>
          <button
            type="button"
            class="rounded-md px-4 py-2 text-sm font-medium transition cursor-pointer"
            :style="{
              backgroundColor: mode === 'import' ? 'var(--color-surface-container-highest)' : 'transparent',
              color: mode === 'import' ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
            }"
            data-testid="create-mode-import-btn"
            :disabled="loading"
            @click="setMode('import')"
          >
            Import YAML
          </button>
          <button
            type="button"
            class="rounded-md px-4 py-2 text-sm font-medium transition cursor-pointer"
            :style="{
              backgroundColor: mode === 'grafana' ? 'var(--color-surface-container-highest)' : 'transparent',
              color: mode === 'grafana' ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
            }"
            data-testid="create-mode-grafana-btn"
            :disabled="loading"
            @click="setMode('grafana')"
          >
            Import Grafana
          </button>
        </div>

        <div v-if="mode === 'create'">
          <div class="mb-5">
            <label for="title" class="block mb-2 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">
              Title <span :style="{ color: 'var(--color-error)' }">*</span>
            </label>
            <input
              id="title"
              data-testid="create-dashboard-title-input"
              v-model="title"
              type="text"
              placeholder="My Dashboard"
              :disabled="loading"
              autocomplete="off"
              class="w-full rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2"
              :style="{
                borderColor: 'var(--color-outline-variant)',
                backgroundColor: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
              }"
            />
          </div>

          <div class="mb-5">
            <label for="description" class="block mb-2 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">Description</label>
            <textarea
              id="description"
              data-testid="create-dashboard-description-input"
              v-model="description"
              placeholder="Dashboard description (optional)"
              rows="3"
              :disabled="loading"
              class="w-full rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 resize-vertical min-h-[80px]"
              :style="{
                borderColor: 'var(--color-outline-variant)',
                backgroundColor: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
              }"
            ></textarea>
          </div>
        </div>

        <div v-else-if="mode === 'import'">
          <div class="mb-5">
            <label for="yaml-file" class="block mb-2 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">
              YAML file <span :style="{ color: 'var(--color-error)' }">*</span>
            </label>
            <input
              id="yaml-file"
              type="file"
              accept=".yaml,.yml"
              :disabled="loading"
              @change="handleYamlFileChange"
              class="w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:cursor-pointer file:transition"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            />
            <p class="mt-2 text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">
              Upload an exported dashboard YAML to import it into this organization.
            </p>
          </div>

          <div
            v-if="importPreview"
            class="mb-5 rounded-lg p-3"
            data-testid="yaml-preview"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
          >
            <p class="text-[0.8125rem]" :style="{ color: 'var(--color-on-surface-variant)' }">
              <strong>Preview:</strong> {{ importPreview.title }}
            </p>
            <p v-if="importPreview.description" class="mt-1 text-[0.8125rem]" :style="{ color: 'var(--color-on-surface-variant)' }">
              {{ importPreview.description }}
            </p>
            <p class="mt-1 text-[0.8125rem]" :style="{ color: 'var(--color-on-surface-variant)' }">
              {{ importPreview.panelCount }} panel{{ importPreview.panelCount === 1 ? '' : 's' }}
            </p>
            <p v-if="yamlFileName" class="mt-1 text-[0.8125rem]" :style="{ color: 'var(--color-outline)' }">
              File: {{ yamlFileName }}
            </p>
          </div>
        </div>

        <div v-else>
          <!-- Grafana sub-tabs: Upload JSON vs Connect to Grafana -->
          <div class="flex gap-1 rounded-lg p-1 mb-4" :style="{ backgroundColor: 'var(--color-surface-container)' }">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer"
              :style="{
                backgroundColor: grafanaSubTab === 'upload' ? 'var(--color-surface-container-highest)' : 'transparent',
                color: grafanaSubTab === 'upload' ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
              }"
              @click="grafanaSubTab = 'upload'"
            >
              <Upload :size="14" /> Upload JSON
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer"
              :style="{
                backgroundColor: grafanaSubTab === 'connect' ? 'var(--color-surface-container-highest)' : 'transparent',
                color: grafanaSubTab === 'connect' ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
              }"
              @click="grafanaSubTab = 'connect'"
            >
              <Globe :size="14" /> Connect to Grafana
            </button>
          </div>

          <!-- Sub-tab: Upload JSON -->
          <div v-if="grafanaSubTab === 'upload'">
            <div class="mb-5">
              <label for="grafana-file" class="block mb-2 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">Grafana JSON file</label>
              <input
                id="grafana-file"
                type="file"
                accept=".json,application/json"
                :disabled="loading || convertingGrafana"
                @change="handleGrafanaFileChange"
                class="w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:cursor-pointer file:transition"
                :style="{ color: 'var(--color-on-surface-variant)' }"
              />
            </div>

            <div class="mb-5">
              <label for="grafana-source" class="block mb-2 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">
                Grafana JSON <span :style="{ color: 'var(--color-error)' }">*</span>
              </label>
              <textarea
                id="grafana-source"
                v-model="grafanaSource"
                rows="5"
                :disabled="loading || convertingGrafana"
                placeholder="Paste Grafana dashboard JSON here"
                data-testid="grafana-source"
                class="w-full rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 resize-vertical min-h-[80px]"
                :style="{
                  borderColor: 'var(--color-outline-variant)',
                  backgroundColor: 'var(--color-surface-container-low)',
                  color: 'var(--color-on-surface)',
                }"
              ></textarea>
              <p v-if="grafanaFileName" class="mt-2 text-xs" :style="{ color: 'var(--color-outline)' }">
                File: {{ grafanaFileName }}
              </p>
            </div>

            <button
              type="button"
              class="mb-3 rounded-lg border px-5 py-2.5 text-sm font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              :style="{
                borderColor: 'var(--color-outline-variant)',
                color: 'var(--color-on-surface)',
              }"
              :disabled="!canConvertGrafana"
              data-testid="grafana-convert"
              @click="convertGrafana"
            >
              {{ convertingGrafana ? 'Converting...' : 'Convert to Ace' }}
            </button>
          </div>

          <!-- Sub-tab: Connect to Grafana -->
          <div v-else>
            <div v-if="!grafanaConnected" class="space-y-4 mb-4">
              <div>
                <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">
                  Grafana URL <span :style="{ color: 'var(--color-error)' }">*</span>
                </label>
                <input
                  v-model="grafanaUrl"
                  type="url"
                  placeholder="https://grafana.example.com"
                  :disabled="grafanaConnecting"
                  class="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  :style="{
                    borderColor: 'var(--color-outline-variant)',
                    backgroundColor: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                  }"
                />
              </div>
              <div>
                <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">
                  API Key <span class="text-xs font-normal" :style="{ color: 'var(--color-on-surface-variant)' }">(optional)</span>
                </label>
                <input
                  v-model="grafanaApiKey"
                  type="password"
                  placeholder="glsa_..."
                  :disabled="grafanaConnecting"
                  class="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  :style="{
                    borderColor: 'var(--color-outline-variant)',
                    backgroundColor: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                  }"
                />
              </div>
              <button
                type="button"
                class="flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold transition cursor-pointer disabled:opacity-50"
                :style="{
                  borderColor: 'var(--color-outline-variant)',
                  color: 'var(--color-on-surface)',
                }"
                :disabled="grafanaConnecting || !grafanaUrl.trim()"
                @click="handleGrafanaConnect"
              >
                <Loader2 v-if="grafanaConnecting" :size="14" class="animate-spin" />
                {{ grafanaConnecting ? 'Connecting...' : 'Connect' }}
              </button>
            </div>

            <!-- Connected: show dashboard list -->
            <div v-else class="mb-4">
              <div class="flex items-center gap-2 mb-3 text-xs" :style="{ color: 'var(--color-secondary)' }">
                Connected to Grafana {{ grafanaVersion }}
              </div>
              <div
                v-if="remoteDashboards.length === 0"
                class="text-sm py-4 text-center"
                :style="{ color: 'var(--color-on-surface-variant)' }"
              >
                No dashboards found
              </div>
              <div v-else class="max-h-48 overflow-y-auto space-y-1">
                <button
                  v-for="dash in remoteDashboards"
                  :key="dash.uid"
                  type="button"
                  class="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition cursor-pointer"
                  :style="{
                    backgroundColor: 'var(--color-surface-container)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }"
                  :disabled="loadingRemoteDashboard"
                  @click="importRemoteDashboard(dash.uid)"
                >
                  <span class="flex-1 truncate">{{ dash.title }}</span>
                  <span v-if="dash.tags?.length" class="text-[10px] shrink-0" :style="{ color: 'var(--color-on-surface-variant)' }">
                    {{ dash.tags.slice(0, 2).join(', ') }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Fidelity report -->
          <div
            v-if="conversionReport"
            class="mb-4 rounded-lg p-3"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
          >
            <div class="flex items-center gap-3 mb-2">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :style="{
                  backgroundColor: conversionReport.fidelity_percent >= 80
                    ? 'rgba(79,175,120,0.12)'
                    : conversionReport.fidelity_percent >= 50
                      ? 'rgba(212,161,30,0.12)'
                      : 'rgba(217,92,84,0.12)',
                  color: conversionReport.fidelity_percent >= 80
                    ? 'var(--color-secondary)'
                    : conversionReport.fidelity_percent >= 50
                      ? 'var(--color-tertiary)'
                      : 'var(--color-error)',
                }"
              >
                {{ conversionReport.fidelity_percent }}% fidelity
              </span>
              <span class="text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">
                {{ conversionReport.mapped_panels }}/{{ conversionReport.total_panels }} panels mapped
              </span>
              <span v-if="conversionReport.variables_found > 0" class="text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">
                {{ conversionReport.variables_found }} variables
              </span>
            </div>
            <div v-if="conversionReport.unsupported_panels > 0" class="text-xs" :style="{ color: 'var(--color-tertiary)' }">
              {{ conversionReport.unsupported_panels }} unsupported panel{{ conversionReport.unsupported_panels > 1 ? 's' : '' }} mapped to line chart
            </div>
          </div>

          <!-- Warnings -->
          <ul
            v-if="grafanaWarnings.length && !conversionReport"
            class="mb-4 pl-5 text-[0.8rem] list-disc"
            data-testid="grafana-warnings"
            :style="{ color: 'var(--color-warning)' }"
          >
            <li v-for="warning in grafanaWarnings" :key="warning">{{ warning }}</li>
          </ul>

          <!-- Datasource mapping -->
          <div
            v-if="grafanaDatasourceNames.length > 0 && importPreview"
            class="mb-4 rounded-lg p-3"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
          >
            <p class="text-xs font-semibold mb-2" :style="{ color: 'var(--color-on-surface)' }">
              Datasource Mapping
            </p>
            <div class="space-y-2">
              <div v-for="dsName in grafanaDatasourceNames" :key="dsName" class="flex items-center gap-2">
                <span class="text-xs truncate w-1/3" :style="{ color: 'var(--color-on-surface-variant)' }">{{ dsName }}</span>
                <span class="text-xs" :style="{ color: 'var(--color-outline)' }">→</span>
                <select
                  v-model="datasourceMapping[dsName]"
                  class="flex-1 rounded border px-2 py-1 text-xs focus:outline-none"
                  :style="{
                    borderColor: 'var(--color-outline-variant)',
                    backgroundColor: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                  }"
                >
                  <option value="">Auto-detect</option>
                  <option v-for="ds in aceDatasources" :key="ds.id" :value="ds.id">
                    {{ ds.name }} ({{ ds.type }})
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Import preview -->
          <div
            v-if="importPreview"
            class="mb-5 rounded-lg p-3"
            data-testid="yaml-preview"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
          >
            <p class="text-[0.8125rem]" :style="{ color: 'var(--color-on-surface-variant)' }">
              <strong>Preview:</strong> {{ importPreview.title }}
            </p>
            <p v-if="importPreview.description" class="mt-1 text-[0.8125rem]" :style="{ color: 'var(--color-on-surface-variant)' }">
              {{ importPreview.description }}
            </p>
            <p class="mt-1 text-[0.8125rem]" :style="{ color: 'var(--color-on-surface-variant)' }">
              {{ importPreview.panelCount }} panel{{ importPreview.panelCount === 1 ? '' : 's' }}
            </p>
          </div>
        </div>

        <div v-if="error" class="mb-5 rounded-lg px-4 py-3 text-sm" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">
          {{ error }}
        </div>

        <div class="flex justify-end gap-3 pt-4" :style="{ borderTop: '1px solid var(--color-outline-variant)' }">
          <button
            type="button"
            data-testid="create-dashboard-cancel-btn"
            class="rounded-lg border px-5 py-2.5 text-sm font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            :style="{
              borderColor: 'var(--color-outline-variant)',
              color: 'var(--color-on-surface)',
            }"
            @click="emit('close')"
            :disabled="loading"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="create-dashboard-submit-btn"
            class="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }"
            :disabled="loading"
          >
            {{ submitLabel }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
