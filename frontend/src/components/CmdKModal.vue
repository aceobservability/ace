<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useCommandContext } from '../composables/useCommandContext'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { currentContext } = useCommandContext()
const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')

// Focus input when modal opens
watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      await nextTick()
      inputRef.value?.focus()
    }
  },
  { immediate: true },
)

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

function handleScrimClick() {
  emit('close')
}
</script>

<template>
  <div v-if="isOpen">
    <!-- Scrim / backdrop -->
    <div
      data-testid="cmdk-scrim"
      class="fixed inset-0 z-50"
      :style="{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }"
      @click="handleScrimClick"
    />

    <!-- Dialog -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Command"
      class="fixed left-1/2 top-1/4 z-50 w-full -translate-x-1/2 rounded-xl overflow-hidden shadow-2xl"
      :style="{
        maxWidth: '640px',
        backgroundColor: 'color-mix(in srgb, var(--color-surface-container-highest) 80%, transparent)',
        backdropFilter: 'blur(20px)',
        borderTop: '2px solid var(--color-primary)',
        border: '1px solid var(--color-outline-variant)',
        borderTopColor: 'var(--color-primary)',
      }"
    >
      <!-- Input area -->
      <div class="flex items-center gap-3 p-4">
        <!-- Context pill -->
        <div
          v-if="currentContext"
          data-testid="context-pill"
          class="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface-variant)',
          }"
        >
          {{ currentContext.viewName }}
        </div>

        <input
          ref="inputRef"
          v-model="query"
          type="text"
          class="flex-1 bg-transparent border-none outline-none"
          :style="{
            fontSize: '16px',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
          }"
          placeholder="Ask AI or search..."
          @keydown="handleKeydown"
        />
      </div>

      <!-- Future: results area, AI chat will go here -->
    </div>
  </div>
</template>
