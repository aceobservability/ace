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
        class="w-full max-w-md m-4 rounded-xl border border-slate-200 bg-white shadow-lg animate-[slideUp_0.3s_ease-out] max-sm:max-w-none max-sm:m-0 max-sm:h-full max-sm:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-org-modal-title"
      >
        <header class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="create-org-modal-title" class="text-lg font-semibold text-slate-900">Create Organization</h2>
          <button
            class="flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
            @click="closeModal"
          >
            <X :size="20" />
          </button>
        </header>

        <form class="px-6 py-4 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]" @submit.prevent="handleSubmit">
          <div class="mb-5">
            <label for="name" class="block mb-2 text-sm font-medium text-slate-700">
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
              class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
          </div>

          <div class="mb-5">
            <label for="slug" class="block mb-2 text-sm font-medium text-slate-700">
              URL Slug <span class="text-red-500">*</span>
            </label>
            <div class="flex items-center rounded-lg border border-slate-200 bg-slate-50 transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
              <span class="py-2 pl-3 text-sm text-slate-500 select-none">org/</span>
              <input
                id="slug"
                v-model="slug"
                type="text"
                placeholder="my-organization"
                :disabled="loading"
                autocomplete="off"
                class="w-full bg-transparent border-none pl-0 py-2 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:text-slate-400 disabled:cursor-not-allowed"
                @input="handleSlugInput"
              />
            </div>
            <span class="block mt-1.5 text-xs text-slate-500">Used in URLs and for SSO login</span>
          </div>

          <div
            v-if="error"
            class="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
          >
            {{ error }}
          </div>

          <div class="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
            >
              {{ loading ? 'Creating...' : 'Create Organization' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
