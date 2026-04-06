<script setup lang="ts">
import '@excalidraw/excalidraw/index.css'
import { Lock, Unlock } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref, watch } from 'vue'

export interface CanvasData {
  elements: unknown[]
  appState?: unknown
}

const props = withDefaults(
  defineProps<{
    data?: CanvasData
    readOnly?: boolean
  }>(),
  {
    data: () => ({ elements: [] }),
    readOnly: false,
  },
)

const emit = defineEmits<{
  change: [data: CanvasData]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const editing = ref(false)
let reactRoot: { unmount: () => void } | null = null
let mounted = false

function toggleEditing() {
  editing.value = !editing.value
}

async function mountExcalidraw() {
  if (!containerRef.value) return
  mounted = false

  try {
    const React = await import('react')
    const ReactDOM = await import('react-dom/client')
    const { Excalidraw } = await import('@excalidraw/excalidraw')

    const root = ReactDOM.createRoot(containerRef.value)

    // Only pass safe, serializable appState keys to Excalidraw.
    // Excalidraw manages internal state like `collaborators` (a Map) itself;
    // passing stale plain-object versions of those causes crashes.
    const safeAppState: Record<string, unknown> = {}
    const savedAppState = (props.data?.appState ?? {}) as Record<string, unknown>
    for (const key of ['viewBackgroundColor', 'gridSize', 'gridStep', 'gridModeEnabled'] as const) {
      if (savedAppState[key] !== undefined) {
        safeAppState[key] = savedAppState[key]
      }
    }

    const ExcalidrawWrapper = () => {
      return React.createElement(Excalidraw, {
        initialData: {
          elements: (props.data?.elements ?? []) as any,
          appState: safeAppState,
        },
        viewModeEnabled: props.readOnly || !editing.value,
        onChange: (elements: readonly unknown[], appState: unknown) => {
          // Skip the initial onChange fired on mount to avoid overwriting saved data
          if (!mounted) {
            mounted = true
            return
          }
          // Only persist drawing-relevant appState, not transient UI state
          const persistedAppState = {
            viewBackgroundColor: (appState as Record<string, unknown>)?.viewBackgroundColor,
            gridSize: (appState as Record<string, unknown>)?.gridSize,
          }
          emit('change', { elements: [...elements], appState: persistedAppState })
        },
        theme: 'dark',
      })
    }

    root.render(React.createElement(ExcalidrawWrapper))
    reactRoot = root
  } catch (_error) {
    // Excalidraw failed to load — show fallback
    if (containerRef.value) {
      containerRef.value.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-on-surface-variant)">
          <p>Canvas editor failed to load</p>
        </div>
      `
    }
  }
}

onMounted(() => {
  mountExcalidraw()
})

onUnmounted(() => {
  if (reactRoot) {
    reactRoot.unmount()
    reactRoot = null
  }
})

// Re-mount when readOnly or editing changes so Excalidraw picks up viewModeEnabled
watch(
  () => [props.readOnly, props.data, editing.value] as const,
  () => {
    if (reactRoot) {
      reactRoot.unmount()
      reactRoot = null
    }
    mountExcalidraw()
  },
)
</script>

<template>
  <div
    :style="{
      position: 'relative',
      width: '100%',
      height: '100%',
      minHeight: '300px',
    }"
  >
    <!-- Excalidraw container -->
    <div
      ref="containerRef"
      data-testid="canvas-container"
      :style="{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'transparent',
      }"
    />

    <!-- When locked, block all pointer events so scroll/click pass through to the page -->
    <div
      v-if="!editing"
      data-testid="canvas-lock-overlay"
      :style="{
        position: 'absolute',
        inset: '0',
        zIndex: 10,
        cursor: 'default',
      }"
    />

    <!-- Edit / Lock toggle button -->
    <button
      v-if="!readOnly"
      data-testid="canvas-edit-toggle"
      :title="editing ? 'Lock canvas' : 'Edit canvas'"
      :style="{
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '6px',
        border: 'none',
        fontSize: '12px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        backgroundColor: editing ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
        color: editing ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
        opacity: editing ? 1 : 0.7,
      }"
      @click.stop="toggleEditing"
    >
      <component :is="editing ? Unlock : Lock" :size="14" />
      {{ editing ? 'Lock' : 'Edit' }}
    </button>
  </div>
</template>
