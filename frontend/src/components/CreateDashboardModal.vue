<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { convertGrafanaDashboard } from '../api/converter'
import { createDashboard, importDashboardYaml } from '../api/dashboards'
import { useOrganization } from '../composables/useOrganization'

type CreationMode = 'create' | 'import' | 'grafana'
type ModalStep = 'choice' | 'form'

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
  const schemaVersionMatch = rawYaml.match(/(?:^|\n)schema_version:\s*(.+)/)
  if (!schemaVersionMatch) {
    throw new Error('Missing schema_version')
  }

  const dashboardSectionMatch = rawYaml.match(/(?:^|\n)dashboard:\s*\n([\s\S]*)/)
  if (!dashboardSectionMatch) {
    throw new Error('Missing dashboard section')
  }

  const dashboardSection = dashboardSectionMatch[1]
  const titleMatch = dashboardSection.match(/(?:^|\n)\s{2}title:\s*(.+)/)
  if (!titleMatch) {
    throw new Error('Missing dashboard title')
  }

  const extractedTitle = normalizeYamlValue(titleMatch[1] ?? '')
  if (!extractedTitle) {
    throw new Error('Dashboard title is empty')
  }

  const descriptionMatch = dashboardSection.match(/(?:^|\n)\s{2}description:\s*(.+)/)
  const panelsSectionMatch = dashboardSection.match(
    /(?:^|\n)\s{2}panels:\s*\n([\s\S]*?)(?=\n\s{2}[a-zA-Z_][\w-]*:\s*|\s*$)/,
  )
  const panelCount = (panelsSectionMatch?.[1]?.match(/(?:^|\n)\s{4}-\s+/g) ?? []).length

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
  dashboard: {
    title: string
    description?: string
    panels: unknown[]
  }
}) {
  importPreview.value = {
    title: document.dashboard.title,
    description: document.dashboard.description ?? '',
    panelCount: document.dashboard.panels.length,
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
    setImportPreviewFromDocument(response.document)
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
      await importDashboardYaml(currentOrgId.value, yamlContent.value)
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
            <p class="mt-2 text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">
              Upload a Grafana dashboard JSON file or paste JSON below.
            </p>
          </div>

          <div class="mb-5">
            <label for="grafana-source" class="block mb-2 text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">
              Grafana JSON <span :style="{ color: 'var(--color-error)' }">*</span>
            </label>
            <textarea
              id="grafana-source"
              v-model="grafanaSource"
              rows="6"
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
            {{ convertingGrafana ? 'Converting...' : 'Convert to Ace YAML' }}
          </button>

          <ul
            v-if="grafanaWarnings.length"
            class="mb-4 pl-5 text-[0.8rem] list-disc"
            data-testid="grafana-warnings"
            :style="{ color: 'var(--color-warning)' }"
          >
            <li v-for="warning in grafanaWarnings" :key="warning">{{ warning }}</li>
          </ul>

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
            <p class="mt-1 text-[0.8125rem]" :style="{ color: 'var(--color-outline)' }">
              Converted from Grafana JSON
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
