<script setup lang="ts">
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
let reactRoot: { unmount: () => void } | null = null

async function mountExcalidraw() {
  if (!containerRef.value) return

  try {
    const React = await import('react')
    const ReactDOM = await import('react-dom/client')
    const { Excalidraw } = await import('@excalidraw/excalidraw')

    const root = ReactDOM.createRoot(containerRef.value)

    const ExcalidrawWrapper = () => {
      return React.createElement(Excalidraw, {
        initialData: {
          elements: props.data?.elements ?? [],
          appState: props.data?.appState ?? {},
        },
        viewModeEnabled: props.readOnly,
        onChange: (elements: unknown[], appState: unknown) => {
          emit('change', { elements, appState })
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

// Re-mount if readOnly changes
watch(
  () => [props.readOnly, props.data] as const,
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
    ref="containerRef"
    data-testid="canvas-container"
    :style="{
      width: '100%',
      height: '100%',
      minHeight: '300px',
      backgroundColor: 'transparent',
    }"
  />
</template>
