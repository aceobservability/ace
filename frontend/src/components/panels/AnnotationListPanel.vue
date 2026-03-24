<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { chartPalette, thresholdColors } from '../../utils/chartTheme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnotationItem {
  id: string
  title: string
  description?: string
  timestamp: string // ISO timestamp
  type: 'deploy' | 'incident' | 'config_change' | 'other'
  tags?: string[]
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  annotations: AnnotationItem[]
}>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeColor(type: AnnotationItem['type']): string {
  if (type === 'deploy') return chartPalette[0]       // Steel Blue
  if (type === 'incident') return thresholdColors.critical
  if (type === 'config_change') return thresholdColors.warning
  return chartPalette[7]                               // Alloy Silver — other
}

// Reactive clock for relative timestamps — refreshes every 60s
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

function formatTimestamp(iso: string): string {
  const ts = new Date(iso).getTime()
  const diffMs = now.value - ts
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

// ---------------------------------------------------------------------------
// Computed styles
// ---------------------------------------------------------------------------

const containerStyle = computed(() => ({
  'overflow-y': 'auto',
  height: '100%',
  width: '100%',
  fontFamily: "'DM Sans', sans-serif",
  backgroundColor: 'transparent',
}))

const emptyStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--color-on-surface-variant)',
  fontSize: '0.875rem',
}

const rowStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.25rem',
  padding: '0.625rem 0.75rem',
  borderBottom: '1px solid var(--color-surface-container-high)',
}

const rowTopStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const titleStyle = {
  flex: '1',
  fontSize: '0.875rem',
  fontWeight: '500',
  color: 'var(--color-on-surface)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
}

const timestampStyle = {
  fontSize: '0.75rem',
  color: 'var(--color-on-surface-variant)',
  flexShrink: '0',
}

const descriptionStyle = {
  fontSize: '0.75rem',
  color: 'var(--color-on-surface-variant)',
  paddingLeft: '1.25rem', // align under title (past the dot)
}

const tagsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '0.25rem',
  paddingLeft: '1.25rem',
}

const tagStyle = {
  fontSize: '0.6875rem',
  fontWeight: '500',
  padding: '0.125rem 0.375rem',
  borderRadius: '9999px',
  backgroundColor: 'var(--color-surface-container-high)',
  color: 'var(--color-on-surface-variant)',
  border: '1px solid var(--color-surface-container-high)',
}
</script>

<template>
  <div
    data-testid="annotation-list-container"
    :style="containerStyle"
  >
    <!-- Empty state -->
    <div
      v-if="props.annotations.length === 0"
      :style="emptyStyle"
    >
      No annotations
    </div>

    <!-- Annotation rows -->
    <div
      v-for="annotation in props.annotations"
      v-else
      :key="annotation.id"
      data-testid="annotation-item"
      :style="rowStyle"
    >
      <!-- Top row: dot + title + timestamp -->
      <div :style="rowTopStyle">
        <!-- Type dot -->
        <span
          data-testid="type-dot"
          :style="{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            flexShrink: '0',
            backgroundColor: typeColor(annotation.type),
          }"
        />

        <!-- Annotation title -->
        <span
          data-testid="annotation-title"
          :style="titleStyle"
        >
          {{ annotation.title }}
        </span>

        <!-- Timestamp -->
        <span
          data-testid="annotation-timestamp"
          :style="timestampStyle"
        >
          {{ formatTimestamp(annotation.timestamp) }}
        </span>
      </div>

      <!-- Optional description -->
      <div
        v-if="annotation.description"
        data-testid="annotation-description"
        :style="descriptionStyle"
      >
        {{ annotation.description }}
      </div>

      <!-- Optional tags -->
      <div
        v-if="annotation.tags && annotation.tags.length > 0"
        :style="tagsRowStyle"
      >
        <span
          v-for="tag in annotation.tags"
          :key="tag"
          data-testid="annotation-tag"
          :style="tagStyle"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </div>
</template>
