<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { toasts, dismiss } = useToast()

const borderColorMap: Record<string, string> = {
  success: 'var(--color-secondary)',
  error: 'var(--color-error)',
  info: 'var(--color-primary)',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed top-4 right-4 z-60 flex flex-col gap-3 pointer-events-none"
      style="z-index: 60"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto animate-fade-in max-w-sm rounded-lg px-4 py-3 shadow-lg"
        :style="{
          backgroundColor: 'var(--color-surface-bright)',
          borderLeft: `4px solid ${borderColorMap[toast.type] || 'var(--color-primary)'}`,
          color: 'var(--color-on-surface)',
        }"
        role="alert"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm">{{ toast.message }}</span>
          <button
            class="shrink-0 text-xs opacity-60 hover:opacity-100 transition-opacity"
            :style="{ color: 'var(--color-on-surface-variant)' }"
            @click="dismiss(toast.id)"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
