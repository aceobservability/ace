<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import type { Dashboard } from '../types/dashboard'
import type { Folder } from '../types/folder'
import { updateDashboard } from '../api/dashboards'

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
    <div class="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-lg">
      <header class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 class="text-lg font-semibold text-slate-900">Edit Dashboard</h2>
        <button class="flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <form @submit.prevent="handleSubmit" class="px-6 py-4">
        <div class="mb-5">
          <label for="title" class="block mb-2 text-sm font-medium text-slate-700">Title <span class="text-red-500">*</span></label>
          <input
            id="title"
            v-model="title"
            type="text"
            placeholder="My Dashboard"
            :disabled="loading"
            autocomplete="off"
            class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          />
        </div>

        <div class="mb-5">
          <label for="description" class="block mb-2 text-sm font-medium text-slate-700">Description</label>
          <textarea
            id="description"
            v-model="description"
            placeholder="Dashboard description (optional)"
            rows="3"
            :disabled="loading"
            class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed resize-vertical min-h-[80px]"
          ></textarea>
        </div>

        <div class="mb-5">
          <label for="folder" class="block mb-2 text-sm font-medium text-slate-700">Folder</label>
          <select
            id="folder"
            v-model="folderId"
            :disabled="loading"
            class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
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

        <div v-if="error" class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</div>

        <div class="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" class="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" @click="emit('close')" :disabled="loading">
            Cancel
          </button>
          <button type="submit" class="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" :disabled="loading">
            {{ loading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
