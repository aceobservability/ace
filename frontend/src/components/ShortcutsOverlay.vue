<script setup lang="ts">
import { computed } from 'vue'
import { useKeyboardShortcuts, type ShortcutEntry } from '../composables/useKeyboardShortcuts'

const { shortcuts, showHelp } = useKeyboardShortcuts()

const groupedShortcuts = computed(() => {
  const groups: Record<string, ShortcutEntry[]> = {}
  for (const s of shortcuts.value) {
    if (!groups[s.category]) {
      groups[s.category] = []
    }
    groups[s.category].push(s)
  }
  return groups
})

function close() {
  showHelp.value = false
}

function handleScrimClick() {
  close()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <div v-if="showHelp" @keydown="handleKeydown">
    <!-- Scrim -->
    <div
      class="fixed inset-0 z-50"
      :style="{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }"
      @click="handleScrimClick"
    />

    <!-- Panel -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      class="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full rounded-xl overflow-hidden shadow-2xl p-6"
      :style="{
        maxWidth: '480px',
        backgroundColor: 'color-mix(in srgb, var(--color-surface-container-highest) 85%, transparent)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--color-outline-variant)',
      }"
    >
      <div class="flex items-center justify-between mb-4">
        <h2
          class="text-lg font-semibold m-0"
          :style="{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }"
        >
          Keyboard Shortcuts
        </h2>
        <button
          class="p-1 rounded-md border-none cursor-pointer text-sm"
          :style="{ color: 'var(--color-on-surface-variant)', backgroundColor: 'transparent' }"
          @click="close"
        >
          &times;
        </button>
      </div>

      <div class="flex flex-col gap-4">
        <div v-for="(items, category) in groupedShortcuts" :key="category">
          <h3
            class="text-xs font-semibold uppercase tracking-wider mb-2 mt-0"
            :style="{ color: 'var(--color-on-surface-variant)' }"
          >
            {{ category }}
          </h3>
          <div class="flex flex-col gap-1">
            <div
              v-for="shortcut in items"
              :key="shortcut.keys"
              class="flex items-center justify-between py-1.5 px-2 rounded-md"
            >
              <span
                class="text-sm"
                :style="{ color: 'var(--color-on-surface)' }"
              >{{ shortcut.label }}</span>
              <kbd
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono"
                :style="{
                  backgroundColor: 'var(--color-surface-container)',
                  color: 'var(--color-on-surface-variant)',
                  border: '1px solid var(--color-outline-variant)',
                }"
              >{{ shortcut.keys }}</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
