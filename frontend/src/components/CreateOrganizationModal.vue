<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X } from 'lucide-vue-next'
import { createOrganization } from '../api/organizations'

const emit = defineEmits<{
  close: []
  created: []
}>()

const name = ref('')
const slug = ref('')
const autoSlug = ref(true)
const loading = ref(false)
const error = ref<string | null>(null)
const modalRef = ref<HTMLDivElement | null>(null)
const firstInputRef = ref<HTMLInputElement | null>(null)

const slugPreview = computed(() => {
  if (!autoSlug.value) return slug.value
  return name.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
})

watch(name, () => {
  if (autoSlug.value) {
    slug.value = slugPreview.value
  }
})

function handleSlugInput() {
  autoSlug.value = false
}

function focusFirstInput() {
  nextTick(() => {
    firstInputRef.value?.focus()
  })
}

function closeModal() {
  emit('close')
}

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !modalRef.value) {
    return
  }

  const focusableElements = modalRef.value.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )

  if (focusableElements.length === 0) {
    return
  }

  const first = focusableElements[0]
  const last = focusableElements[focusableElements.length - 1]
  const active = document.activeElement

  if (event.shiftKey && active === first) {
    event.preventDefault()
    last!.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first!.focus()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeModal()
    return
  }

  trapFocus(event)
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  focusFirstInput()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

async function handleSubmit() {
  if (!name.value.trim()) {
    error.value = 'Name is required'
    return
  }

  if (!slug.value.trim()) {
    error.value = 'Slug is required'
    return
  }

  const slugRegex = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/
  if (!slugRegex.test(slug.value)) {
    error.value = 'Slug must be 3-100 lowercase alphanumeric characters with hyphens'
    return
  }

  loading.value = true
  error.value = null

  try {
    await createOrganization({
      name: name.value.trim(),
      slug: slug.value.trim(),
    })
    emit('created')
  } catch (e) {
    if (e instanceof Error) {
      error.value = e.message
    } else {
      error.value = 'Failed to create organization'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease-out]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="closeModal">
      <div
        ref="modalRef"
        class="modal modal--centered"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-org-modal-title"
      >
        <header class="modal-header">
          <h2 id="create-org-modal-title">Create Organization</h2>
          <button class="btn-close" @click="closeModal">
            <X :size="20" />
          </button>
        </header>

        <form @submit.prevent="handleSubmit">
          <div class="form-group">
            <label for="name">Organization Name <span class="required">*</span></label>
            <input
              id="name"
              ref="firstInputRef"
              v-model="name"
              type="text"
              placeholder="My Organization"
              :disabled="loading"
              autocomplete="off"
            />
          </div>

          <div class="form-group">
            <label for="slug">URL Slug <span class="required">*</span></label>
            <div class="slug-input-wrapper">
              <span class="slug-prefix">org/</span>
              <input
                id="slug"
                v-model="slug"
                type="text"
                placeholder="my-organization"
                :disabled="loading"
                autocomplete="off"
                @input="handleSlugInput"
              />
            </div>
            <span class="form-hint">Used in URLs and for SSO login</span>
          </div>

          <div v-if="error" class="error-message">{{ error }}</div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal" :disabled="loading">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="loading">
              {{ loading ? 'Creating...' : 'Create Organization' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
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
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal {
  background: var(--color-bg-1);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  animation: slideUp 0.3s ease-out;
}

.modal--centered {
  margin: 1rem;
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

.form-group input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--color-text-0);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input::placeholder {
  color: var(--color-text-2);
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.form-group input:disabled {
  background: var(--color-bg-0);
  color: var(--color-text-2);
  cursor: not-allowed;
}

.slug-input-wrapper {
  display: flex;
  align-items: center;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.slug-input-wrapper:focus-within {
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.slug-prefix {
  padding: 0.75rem 0 0.75rem 1rem;
  color: var(--color-text-1);
  font-size: 0.875rem;
  user-select: none;
}

.slug-input-wrapper input {
  border: none;
  background: transparent;
  padding-left: 0;
}

.slug-input-wrapper input:focus {
  outline: none;
  box-shadow: none;
}

.form-hint {
  display: block;
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-1);
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

@media (max-width: 640px) {
  .modal {
    max-width: none;
    width: 100%;
    height: 100%;
    margin: 0;
    border-radius: 0;
  }

  form {
    padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  }
}
</style>
