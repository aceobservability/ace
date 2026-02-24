<script setup lang="ts">
import { computed, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { createDashboard, importDashboardYaml } from '../api/dashboards'
import { convertGrafanaDashboard } from '../api/converter'
import { useOrganization } from '../composables/useOrganization'

type CreationMode = 'create' | 'import' | 'grafana'

const props = withDefaults(defineProps<{
  initialMode?: CreationMode
}>(), {
  initialMode: 'create',
})

const emit = defineEmits<{
  close: []
  created: []
}>()

const { currentOrgId } = useOrganization()

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

const canConvertGrafana = computed(() => grafanaSource.value.trim().length > 0 && !convertingGrafana.value && !loading.value)

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

  const dashboardSection = dashboardSectionMatch[1]!
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
    error.value = mode.value === 'grafana'
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
  <div class="fixed inset-0 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease-out]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h2>Create Dashboard</h2>
        <button class="btn-close" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <form @submit.prevent="handleSubmit">
        <div class="mode-toggle" role="tablist" aria-label="Creation mode">
          <button
            type="button"
            class="mode-option"
            :class="{ active: mode === 'create' }"
            :disabled="loading"
            @click="setMode('create')"
          >
            Create New
          </button>
          <button
            type="button"
            class="mode-option"
            :class="{ active: mode === 'import' }"
            :disabled="loading"
            @click="setMode('import')"
          >
            Import YAML
          </button>
          <button
            type="button"
            class="mode-option"
            :class="{ active: mode === 'grafana' }"
            :disabled="loading"
            @click="setMode('grafana')"
          >
            Import Grafana
          </button>
        </div>

        <div v-if="mode === 'create'">
          <div class="form-group">
            <label for="title">Title <span class="required">*</span></label>
            <input
              id="title"
              v-model="title"
              type="text"
              placeholder="My Dashboard"
              :disabled="loading"
              autocomplete="off"
            />
          </div>

          <div class="form-group">
            <label for="description">Description</label>
            <textarea
              id="description"
              v-model="description"
              placeholder="Dashboard description (optional)"
              rows="3"
              :disabled="loading"
            ></textarea>
          </div>
        </div>

        <div v-else-if="mode === 'import'">
          <div class="form-group">
            <label for="yaml-file">YAML file <span class="required">*</span></label>
            <input
              id="yaml-file"
              type="file"
              accept=".yaml,.yml"
              :disabled="loading"
              @change="handleYamlFileChange"
            />
            <p class="field-hint">Upload an exported dashboard YAML to import it into this organization.</p>
          </div>

          <div v-if="importPreview" class="import-preview" data-testid="yaml-preview">
            <p><strong>Preview:</strong> {{ importPreview.title }}</p>
            <p v-if="importPreview.description">{{ importPreview.description }}</p>
            <p>{{ importPreview.panelCount }} panel{{ importPreview.panelCount === 1 ? '' : 's' }}</p>
            <p v-if="yamlFileName" class="file-name">File: {{ yamlFileName }}</p>
          </div>
        </div>

        <div v-else>
          <div class="form-group">
            <label for="grafana-file">Grafana JSON file</label>
            <input
              id="grafana-file"
              type="file"
              accept=".json,application/json"
              :disabled="loading || convertingGrafana"
              @change="handleGrafanaFileChange"
            />
            <p class="field-hint">Upload a Grafana dashboard JSON file or paste JSON below.</p>
          </div>

          <div class="form-group">
            <label for="grafana-source">Grafana JSON <span class="required">*</span></label>
            <textarea
              id="grafana-source"
              v-model="grafanaSource"
              rows="6"
              :disabled="loading || convertingGrafana"
              placeholder="Paste Grafana dashboard JSON here"
              data-testid="grafana-source"
            ></textarea>
            <p v-if="grafanaFileName" class="field-hint">File: {{ grafanaFileName }}</p>
          </div>

          <button
            type="button"
            class="btn btn-secondary btn-convert"
            :disabled="!canConvertGrafana"
            data-testid="grafana-convert"
            @click="convertGrafana"
          >
            {{ convertingGrafana ? 'Converting...' : 'Convert to Ace YAML' }}
          </button>

          <ul v-if="grafanaWarnings.length" class="warning-list" data-testid="grafana-warnings">
            <li v-for="warning in grafanaWarnings" :key="warning">{{ warning }}</li>
          </ul>

          <div v-if="importPreview" class="import-preview" data-testid="yaml-preview">
            <p><strong>Preview:</strong> {{ importPreview.title }}</p>
            <p v-if="importPreview.description">{{ importPreview.description }}</p>
            <p>{{ importPreview.panelCount }} panel{{ importPreview.panelCount === 1 ? '' : 's' }}</p>
            <p class="file-name">Converted from Grafana JSON</p>
          </div>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="emit('close')" :disabled="loading">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" :disabled="loading">
            {{ submitLabel }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--color-bg-1);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-0);
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--color-text-1);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-0);
}

form {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.25rem;
}

.mode-toggle {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.mode-option {
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-option.active {
  border-color: var(--color-accent);
  background: rgba(245, 158, 11, 0.12);
  color: var(--color-text-0);
}

.mode-option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-0);
}

.required {
  color: var(--color-danger);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--color-text-0);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--color-text-2);
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.form-group input:disabled,
.form-group textarea:disabled {
  background: var(--color-bg-0);
  color: var(--color-text-2);
  cursor: not-allowed;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.field-hint {
  margin-top: 0.5rem;
  color: var(--color-text-2);
  font-size: 0.75rem;
}

.import-preview {
  margin-bottom: 1.25rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-2);
}

.import-preview p {
  margin: 0;
  color: var(--color-text-1);
  font-size: 0.8125rem;
}

.import-preview p + p {
  margin-top: 0.35rem;
}

.file-name {
  color: var(--color-text-2);
}

.btn-convert {
  margin-bottom: 0.75rem;
}

.warning-list {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  color: #facc15;
  font-size: 0.8rem;
}

.error-message {
  padding: 0.75rem 1rem;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 6px;
  color: var(--color-danger);
  font-size: 0.875rem;
  margin-bottom: 1.25rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  border-color: #F59E0B;
  color: #FCD34D;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-strong);
}

.btn-primary {
  background: var(--color-accent);
  color: #1a0f00;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}
</style>
