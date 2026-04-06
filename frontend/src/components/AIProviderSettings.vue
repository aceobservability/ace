<script setup lang="ts">
import {
  Check,
  Loader2,
  MoreVertical,
  Plus,
  Settings2,
  TestTube2,
  Trash2,
  X,
} from 'lucide-vue-next'
import { onMounted, ref, watch } from 'vue'
import {
  type AIProviderInfo,
  type CreateProviderRequest,
  createAIProvider,
  deleteAIProvider,
  listAIModels,
  listAIProviders,
  testAIProvider,
  type UpdateProviderRequest,
  updateAIProvider,
} from '../api/aiProviders'

const props = defineProps<{ orgId: string; isAdmin: boolean }>()
const emit = defineEmits<{ 'provider-count': [count: number] }>()

// --- State ---

const providers = ref<AIProviderInfo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Model counts fetched from the API
const modelCounts = ref<Record<string, number>>({})

// Form state
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formType = ref('openai')
const formDisplayName = ref('')
const formBaseUrl = ref('')
const formApiKey = ref('')
const formEnabled = ref(true)
const formRateLimitPerUser = ref(0)
const formRateLimitWindowSeconds = ref(3600)
const formLoading = ref(false)
const formError = ref<string | null>(null)

// Overflow menu
const openMenuId = ref<string | null>(null)

// Test connection
const testingId = ref<string | null>(null)
const testResult = ref<{ success: boolean; models_count?: number; error?: string } | null>(null)

// Delete confirm
const deletingProvider = ref<AIProviderInfo | null>(null)

// --- URL hints per provider type ---

const urlHints: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
  custom: '',
}

// --- Helpers ---

function truncateUrl(url: string | undefined, max = 40): string {
  if (!url) return ''
  if (url.length <= max) return url
  return `${url.slice(0, max)}...`
}

function modelCount(provider: AIProviderInfo): number {
  return modelCounts.value[provider.id] ?? provider.models_override?.length ?? 0
}

// --- Data loading ---

async function loadProviders() {
  if (!props.orgId) return
  loading.value = true
  error.value = null
  try {
    providers.value = await listAIProviders(props.orgId)
    emit('provider-count', providers.value.length)

    // Fetch actual model counts per provider in parallel
    const counts: Record<string, number> = {}
    await Promise.all(
      providers.value.map(async (p) => {
        try {
          const models = await listAIModels(props.orgId, p.id)
          counts[p.id] = models.length
        } catch {
          // Fall back to models_override count
        }
      }),
    )
    modelCounts.value = counts
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load providers'
  } finally {
    loading.value = false
  }
}

onMounted(loadProviders)

watch(() => props.orgId, loadProviders)

// --- Form ---

function openAddForm() {
  editingId.value = null
  formType.value = 'openai'
  formDisplayName.value = ''
  formBaseUrl.value = urlHints.openai
  formApiKey.value = ''
  formEnabled.value = true
  formRateLimitPerUser.value = 0
  formRateLimitWindowSeconds.value = 3600
  formError.value = null
  showForm.value = true
}

function openEditForm(provider: AIProviderInfo) {
  editingId.value = provider.id
  formType.value = provider.provider_type
  formDisplayName.value = provider.display_name
  formBaseUrl.value = provider.base_url
  formApiKey.value = ''
  formEnabled.value = provider.enabled
  formRateLimitPerUser.value = provider.rate_limit_per_user ?? 0
  formRateLimitWindowSeconds.value = provider.rate_limit_window_seconds ?? 3600
  formError.value = null
  showForm.value = true
  openMenuId.value = null
}

function cancelForm() {
  showForm.value = false
  editingId.value = null
  formError.value = null
}

function onTypeChange() {
  // Only pre-fill if not editing
  if (!editingId.value) {
    formBaseUrl.value = urlHints[formType.value] ?? ''
  }
}

async function submitForm() {
  formLoading.value = true
  formError.value = null
  try {
    if (editingId.value) {
      const data: UpdateProviderRequest = {
        display_name: formDisplayName.value,
        base_url: formBaseUrl.value,
        enabled: formEnabled.value,
        rate_limit_per_user: formRateLimitPerUser.value,
        rate_limit_window_seconds: formRateLimitWindowSeconds.value,
      }
      if (formApiKey.value) data.api_key = formApiKey.value
      await updateAIProvider(props.orgId, editingId.value, data)
    } else {
      const data: CreateProviderRequest = {
        provider_type: formType.value,
        display_name: formDisplayName.value,
        base_url: formBaseUrl.value,
        enabled: formEnabled.value,
        rate_limit_per_user: formRateLimitPerUser.value,
        rate_limit_window_seconds: formRateLimitWindowSeconds.value,
      }
      if (formApiKey.value) data.api_key = formApiKey.value
      await createAIProvider(props.orgId, data)
    }
    showForm.value = false
    editingId.value = null
    await loadProviders()
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Operation failed'
  } finally {
    formLoading.value = false
  }
}

// --- Overflow menu ---

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

// --- Test connection ---

async function runTest(provider: AIProviderInfo) {
  openMenuId.value = null
  testingId.value = provider.id
  testResult.value = null
  try {
    testResult.value = await testAIProvider(props.orgId, provider.id)
  } catch (e) {
    testResult.value = { success: false, error: e instanceof Error ? e.message : 'Test failed' }
  } finally {
    testingId.value = null
  }
}

// --- Delete ---

function promptDelete(provider: AIProviderInfo) {
  openMenuId.value = null
  deletingProvider.value = provider
}

async function confirmDelete() {
  if (!deletingProvider.value) return
  try {
    await deleteAIProvider(props.orgId, deletingProvider.value.id)
    deletingProvider.value = null
    await loadProviders()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Delete failed'
    deletingProvider.value = null
  }
}

function cancelDelete() {
  deletingProvider.value = null
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Loading -->
    <div v-if="loading" class="flex flex-col gap-3">
      <div v-for="i in 2" :key="i" class="h-14 rounded-sm animate-pulse"
        :style="{ backgroundColor: 'var(--color-surface-container-high)' }" />
    </div>

    <template v-else>
      <!-- Header with Add button -->
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">
          {{ providers.length }} provider{{ providers.length !== 1 ? 's' : '' }}
        </span>
        <button
          v-if="isAdmin"
          data-testid="add-provider-btn"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 border-none rounded-sm text-sm font-medium cursor-pointer transition"
          :style="{ backgroundColor: 'var(--color-primary)', color: '#fff' }"
          @click="openAddForm"
        >
          <Plus :size="16" /> Add Provider
        </button>
      </div>

      <!-- Empty state -->
      <div
        v-if="providers.length === 0 && !showForm"
        class="flex flex-col items-center justify-center px-8 py-12 text-center gap-3 rounded-lg"
        :style="{ backgroundColor: 'var(--color-surface-container-low)' }"
      >
        <Settings2 :size="40" :style="{ color: 'var(--color-outline)' }" />
        <p class="m-0 text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">
          No providers configured. Add one to enable AI chat for your team.
        </p>
      </div>

      <!-- Provider list -->
      <div v-if="providers.length > 0" role="list" class="flex flex-col gap-2">
        <div
          v-for="provider in providers"
          :key="provider.id"
          role="listitem"
          class="flex items-center justify-between gap-4 px-4 py-3 rounded-lg transition-colors"
          :style="{ backgroundColor: 'var(--color-surface-container-low)' }"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">
                {{ provider.display_name }}
              </span>
              <span class="text-xs truncate" :style="{ color: 'var(--color-outline)' }">
                {{ truncateUrl(provider.base_url) }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <!-- Model count badge -->
            <span
              class="inline-flex px-2 py-0.5 rounded-sm text-xs font-medium"
              :style="{
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                color: 'var(--color-primary)',
              }"
            >
              {{ modelCount(provider) }} models
            </span>

            <!-- Rate limit badge -->
            <span
              v-if="provider.rate_limit_per_user > 0"
              class="inline-flex px-2 py-0.5 rounded-sm text-xs font-medium font-mono"
              :style="{
                backgroundColor: 'color-mix(in srgb, var(--color-tertiary) 10%, transparent)',
                color: 'var(--color-tertiary)',
              }"
            >
              {{ provider.rate_limit_per_user }}/{{ provider.rate_limit_window_seconds >= 3600 ? `${provider.rate_limit_window_seconds / 3600}hr` : `${provider.rate_limit_window_seconds / 60}min` }}
            </span>

            <!-- Enabled/Disabled badge -->
            <span
              data-testid="status-badge"
              class="inline-flex px-2 py-0.5 rounded-sm text-xs font-medium"
              :aria-label="provider.enabled ? 'Provider is enabled' : 'Provider is disabled'"
              :style="{
                backgroundColor: provider.enabled
                  ? 'color-mix(in srgb, var(--color-secondary) 15%, transparent)'
                  : 'color-mix(in srgb, var(--color-outline) 15%, transparent)',
                color: provider.enabled ? 'var(--color-secondary)' : 'var(--color-outline)',
              }"
            >
              {{ provider.enabled ? 'Enabled' : 'Disabled' }}
            </span>

            <!-- Overflow menu -->
            <div v-if="isAdmin" class="relative">
              <button
                data-testid="provider-menu-btn"
                class="inline-flex items-center justify-center w-[30px] h-[30px] p-0 bg-transparent border-none rounded-sm cursor-pointer transition"
                :style="{ color: 'var(--color-on-surface-variant)' }"
                @click="toggleMenu(provider.id)"
              >
                <MoreVertical :size="16" />
              </button>

              <div
                v-if="openMenuId === provider.id"
                class="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded-lg shadow-lg py-1"
                :style="{ backgroundColor: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline-variant)' }"
              >
                <button
                  class="flex items-center gap-2 w-full px-3 py-2 text-sm bg-transparent border-none cursor-pointer transition text-left"
                  :style="{ color: 'var(--color-on-surface)' }"
                  @click="openEditForm(provider)"
                >
                  <Settings2 :size="14" /> Edit
                </button>
                <button
                  :data-testid="`test-provider-${provider.id}`"
                  :aria-label="`Test connection for ${provider.display_name}`"
                  class="flex items-center gap-2 w-full px-3 py-2 text-sm bg-transparent border-none cursor-pointer transition text-left"
                  :style="{ color: 'var(--color-on-surface)' }"
                  @click="runTest(provider)"
                >
                  <TestTube2 :size="14" /> Test
                </button>
                <button
                  :data-testid="`delete-provider-${provider.id}`"
                  class="flex items-center gap-2 w-full px-3 py-2 text-sm bg-transparent border-none cursor-pointer transition text-left"
                  :style="{ color: 'var(--color-error)' }"
                  @click="promptDelete(provider)"
                >
                  <Trash2 :size="14" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Test result inline -->
      <div v-if="testingId" class="flex items-center gap-2 px-4 py-2 rounded-sm text-sm" data-testid="test-spinner"
        :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }">
        <Loader2 :size="16" class="animate-spin" /> Testing connection...
      </div>
      <div v-if="testResult && !testingId" class="flex items-center gap-2 px-4 py-2 rounded-sm text-sm"
        :style="{
          backgroundColor: testResult.success
            ? 'color-mix(in srgb, var(--color-secondary) 10%, transparent)'
            : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
          color: testResult.success ? 'var(--color-secondary)' : 'var(--color-error)',
        }">
        <Check v-if="testResult.success" :size="16" />
        <X v-else :size="16" />
        <span v-if="testResult.success">Connected, {{ testResult.models_count }} models found</span>
        <span v-else>Connection failed: {{ testResult.error }}</span>
      </div>

      <!-- Error -->
      <div v-if="error" class="px-4 py-2 rounded-sm text-sm"
        :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">
        {{ error }}
      </div>

      <!-- Add/Edit form -->
      <form
        v-if="showForm"
        data-testid="provider-form"
        class="flex flex-col gap-3 rounded-lg p-4"
        :style="{ backgroundColor: 'var(--color-surface-container-low)', border: '1px solid var(--color-outline-variant)' }"
        @submit.prevent="submitForm"
      >
        <h3 class="m-0 text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">
          {{ editingId ? 'Edit Provider' : 'Add Provider' }}
        </h3>

        <!-- Provider type -->
        <label class="flex flex-col gap-1 text-xs font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">
          Provider Type
          <select
            v-model="formType"
            data-testid="form-provider-type"
            class="px-3 py-2 rounded-sm text-sm focus:outline-none"
            :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
            :disabled="!!editingId"
            @change="onTypeChange"
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <!-- Display name -->
        <label class="flex flex-col gap-1 text-xs font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">
          Display Name
          <input
            v-model="formDisplayName"
            data-testid="form-display-name"
            type="text"
            required
            class="px-3 py-2 rounded-sm text-sm focus:outline-none"
            :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
            placeholder="e.g. Production OpenAI"
          />
        </label>

        <!-- Base URL -->
        <label class="flex flex-col gap-1 text-xs font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">
          Base URL
          <input
            v-model="formBaseUrl"
            data-testid="form-base-url"
            type="text"
            required
            class="px-3 py-2 rounded-sm text-sm font-mono focus:outline-none"
            :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
            placeholder="https://api.example.com/v1"
          />
        </label>

        <!-- API key -->
        <label class="flex flex-col gap-1 text-xs font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">
          API Key
          <input
            v-model="formApiKey"
            data-testid="form-api-key"
            type="password"
            class="px-3 py-2 rounded-sm text-sm font-mono focus:outline-none"
            :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
            :placeholder="editingId ? 'Leave blank to keep current' : 'Optional'"
          />
        </label>

        <!-- Enabled toggle -->
        <label class="flex items-center gap-2 text-xs font-medium cursor-pointer" :style="{ color: 'var(--color-on-surface-variant)' }">
          <input v-model="formEnabled" type="checkbox" class="w-auto m-0" />
          Enabled
        </label>

        <!-- Rate limit -->
        <div class="flex gap-3">
          <label class="flex flex-col gap-1 text-xs font-medium flex-1" :style="{ color: 'var(--color-on-surface-variant)' }">
            Rate limit per user (0 = unlimited)
            <input
              v-model.number="formRateLimitPerUser"
              type="number"
              min="0"
              class="px-3 py-2 rounded-sm text-sm focus:outline-none"
              :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium flex-1" :style="{ color: 'var(--color-on-surface-variant)' }">
            Window (seconds)
            <input
              v-model.number="formRateLimitWindowSeconds"
              type="number"
              min="60"
              class="px-3 py-2 rounded-sm text-sm focus:outline-none"
              :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
            />
          </label>
        </div>

        <!-- Form error -->
        <div v-if="formError" class="text-xs" :style="{ color: 'var(--color-error)' }">{{ formError }}</div>

        <!-- Form actions -->
        <div class="flex items-center gap-2 justify-end">
          <button
            type="button"
            class="px-3 py-1.5 rounded-sm text-sm font-medium cursor-pointer transition border"
            :style="{ backgroundColor: 'transparent', color: 'var(--color-on-surface)', borderColor: 'var(--color-outline-variant)' }"
            @click="cancelForm"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-3 py-1.5 rounded-sm text-sm font-medium cursor-pointer transition border-none"
            :style="{ backgroundColor: 'var(--color-primary)', color: '#fff' }"
            :disabled="formLoading"
          >
            <Loader2 v-if="formLoading" :size="14" class="animate-spin inline mr-1" />
            {{ editingId ? 'Save' : 'Create' }}
          </button>
        </div>
      </form>

      <!-- Delete confirmation dialog -->
      <div
        v-if="deletingProvider"
        data-testid="delete-confirm"
        class="rounded-lg p-4 flex flex-col gap-3"
        :style="{ backgroundColor: 'var(--color-surface-container-low)', border: '1px solid var(--color-error)' }"
      >
        <p class="m-0 text-sm" :style="{ color: 'var(--color-on-surface)' }">
          Are you sure you want to delete <strong>{{ deletingProvider.display_name }}</strong>? This action cannot be undone.
        </p>
        <div class="flex items-center gap-2 justify-end">
          <button
            data-testid="delete-confirm-no"
            type="button"
            class="px-3 py-1.5 rounded-sm text-sm font-medium cursor-pointer transition border"
            :style="{ backgroundColor: 'transparent', color: 'var(--color-on-surface)', borderColor: 'var(--color-outline-variant)' }"
            @click="cancelDelete"
          >
            Cancel
          </button>
          <button
            data-testid="delete-confirm-yes"
            type="button"
            class="px-3 py-1.5 rounded-sm text-sm font-medium cursor-pointer transition border-none"
            :style="{ backgroundColor: 'var(--color-error)', color: '#fff' }"
            @click="confirmDelete"
          >
            <Trash2 :size="14" class="inline mr-1" /> Delete
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
