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
  <div class="fixed inset-0 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease-out]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h2>Edit Dashboard</h2>
        <button class="btn-close" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <form @submit.prevent="handleSubmit">
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

        <div class="form-group">
          <label for="folder">Folder</label>
          <select id="folder" v-model="folderId" :disabled="loading">
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

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="emit('close')" :disabled="loading">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" :disabled="loading">
            {{ loading ? 'Saving...' : 'Save Changes' }}
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
.form-group textarea,
.form-group select {
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
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.form-group input:disabled,
.form-group textarea:disabled,
.form-group select:disabled {
  background: var(--color-bg-0);
  color: var(--color-text-2);
  cursor: not-allowed;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
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
