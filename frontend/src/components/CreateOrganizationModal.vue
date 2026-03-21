<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
    last.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
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
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_0.2s_ease-out]"
      @click.self="closeModal"
    >
      <div
        ref="modalRef"
        data-testid="create-org-modal"
        class="w-full max-w-md m-4 rounded border border-border bg-surface-raised shadow-lg animate-[slideUp_0.3s_ease-out] max-sm:max-w-none max-sm:m-0 max-sm:h-full max-sm:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-org-modal-title"
      >
        <header class="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="create-org-modal-title" class="text-lg font-semibold text-text-primary">Create Organization</h2>
          <button
            class="flex items-center justify-center h-8 w-8 rounded-sm text-text-muted hover:bg-surface-overlay hover:text-text-secondary transition cursor-pointer"
            data-testid="create-org-close-btn"
            @click="closeModal"
          >
            <X :size="20" />
          </button>
        </header>

        <form class="px-6 py-4 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]" data-testid="create-org-form" @submit.prevent="handleSubmit">
          <div class="mb-5">
            <label for="name" class="block mb-2 text-sm font-medium text-text-primary">
              Organization Name <span class="text-red-500">*</span>
            </label>
            <input
              id="name"
              ref="firstInputRef"
              v-model="name"
              type="text"
              placeholder="My Organization"
              :disabled="loading"
              autocomplete="off"
              data-testid="create-org-name-input"
              class="w-full rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
            />
          </div>

          <div class="mb-5">
            <label for="slug" class="block mb-2 text-sm font-medium text-text-primary">
              URL Slug <span class="text-red-500">*</span>
            </label>
            <div class="flex items-center rounded-sm border border-border bg-surface-overlay transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <span class="py-2 pl-3 text-sm text-text-muted select-none">org/</span>
              <input
                id="slug"
                v-model="slug"
                type="text"
                placeholder="my-organization"
                :disabled="loading"
                autocomplete="off"
                data-testid="create-org-slug-input"
                class="w-full bg-transparent border-none pl-0 py-2 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0 disabled:text-text-muted disabled:cursor-not-allowed"
                @input="handleSlugInput"
              />
            </div>
            <span class="block mt-1.5 text-xs text-text-muted">Used in URLs and for SSO login</span>
          </div>

          <div
            v-if="error"
            data-testid="create-org-error"
            class="mb-5 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
          >
            {{ error }}
          </div>

          <div class="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-sm border border-border px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              data-testid="create-org-cancel-btn"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="inline-flex items-center justify-center rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              data-testid="create-org-submit-btn"
            >
              {{ loading ? 'Creating...' : 'Create Organization' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
