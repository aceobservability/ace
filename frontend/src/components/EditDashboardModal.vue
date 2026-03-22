<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import { updateDashboard } from '../api/dashboards'
import type { Dashboard } from '../types/dashboard'
import type { Folder } from '../types/folder'

const props = defineProps<{
  dashboard: Dashboard
  folders: Folder[]
}>()

const emit = defineEmits<{
  close: []
  updated: []
}>()

const title = ref(props.dashboard.title)
const description = ref(props.dashboard.description || '')
const folderId = ref(props.dashboard.folder_id || '')
const loading = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  if (!title.value.trim()) {
    error.value = 'Title is required'
    return
  }

  loading.value = true
  error.value = null

  try {
    await updateDashboard(props.dashboard.id, {
      title: title.value.trim(),
      description: description.value.trim() || undefined,
      folder_id: folderId.value || null,
    })
    emit('updated')
  } catch (e) {
    error.value = 'Failed to update dashboard'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="w-full max-w-lg rounded bg-[var(--color-surface-container-low)] shadow-lg" data-testid="edit-dashboard-modal">
      <header class="flex items-center justify-between px-6 py-4">
        <h2 class="text-lg font-semibold text-[var(--color-on-surface)]">Edit Dashboard</h2>
        <button class="flex items-center justify-center h-8 w-8 rounded-sm text-[var(--color-outline)] hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface-variant)] transition cursor-pointer" data-testid="edit-dashboard-close-btn" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <form @submit.prevent="handleSubmit" class="px-6 py-4">
        <div class="mb-5">
          <label for="title" class="block mb-2 text-sm font-medium text-[var(--color-on-surface)]">Title <span class="text-red-500">*</span></label>
          <input
            id="title"
            v-model="title"
            type="text"
            placeholder="My Dashboard"
            :disabled="loading"
            autocomplete="off"
            data-testid="edit-dashboard-title-input"
            class="w-full rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] transition focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)] disabled:cursor-not-allowed"
          />
        </div>

        <div class="mb-5">
          <label for="description" class="block mb-2 text-sm font-medium text-[var(--color-on-surface)]">Description</label>
          <textarea
            id="description"
            v-model="description"
            placeholder="Dashboard description (optional)"
            rows="3"
            :disabled="loading"
            data-testid="edit-dashboard-description-input"
            class="w-full rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] transition focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)] disabled:cursor-not-allowed resize-vertical min-h-[80px]"
          ></textarea>
        </div>

        <div class="mb-5">
          <label for="folder" class="block mb-2 text-sm font-medium text-[var(--color-on-surface)]">Folder</label>
          <select
            id="folder"
            v-model="folderId"
            :disabled="loading"
            data-testid="edit-dashboard-folder-select"
            class="w-full rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] transition focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)] disabled:cursor-not-allowed"
          >
            <option value="">Unfiled (Root)</option>
            <option
              v-for="folder in props.folders"
              :key="folder.id"
              :value="folder.id"
            >
              {{ folder.name }}
            </option>
          </select>
        </div>

        <div v-if="error" class="mb-5 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</div>

        <div class="flex justify-end gap-3 pt-4">
          <button type="button" class="rounded-sm px-5 py-2.5 text-sm font-semibold text-[var(--color-on-surface)] transition hover:-strong disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" data-testid="edit-dashboard-cancel-btn" @click="emit('close')" :disabled="loading">
            Cancel
          </button>
          <button type="submit" class="rounded-sm bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-primary)]-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" data-testid="edit-dashboard-save-btn" :disabled="loading">
            {{ loading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
