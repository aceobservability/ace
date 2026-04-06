<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import { chartPalette } from '../../utils/chartTheme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardLink {
  id: string
  title: string
  url: string
  tags?: string[]
  starred?: boolean
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  dashboards: DashboardLink[]
}>()

// ---------------------------------------------------------------------------
// Computed styles
// ---------------------------------------------------------------------------

const containerStyle = computed(() => ({
  overflowY: 'auto' as const,
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

const linkStyle = {
  flex: '1',
  fontSize: '0.875rem',
  fontWeight: '500',
  color: 'var(--color-on-surface)',
  textDecoration: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
}

const tagsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '0.25rem',
  paddingLeft: '1.5rem', // align under title (past the star icon)
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

function starStyle(starred?: boolean) {
  if (starred) {
    return {
      color: chartPalette[4], // Signal Brass
      fill: chartPalette[4],
      flexShrink: '0',
    }
  }
  return {
    color: 'var(--color-on-surface-variant)',
    flexShrink: '0',
  }
}
</script>

<template>
  <div
    data-testid="dashboard-list-container"
    :style="containerStyle"
  >
    <!-- Empty state -->
    <div
      v-if="props.dashboards.length === 0"
      :style="emptyStyle"
    >
      No dashboards
    </div>

    <!-- Dashboard rows -->
    <div
      v-for="dashboard in props.dashboards"
      v-else
      :key="dashboard.id"
      data-testid="dashboard-item"
      :style="rowStyle"
    >
      <!-- Top row: star + link -->
      <div :style="rowTopStyle">
        <!-- Star icon -->
        <span
          data-testid="star-icon"
          :style="starStyle(dashboard.starred)"
        >
          <Star :size="14" :fill="dashboard.starred ? chartPalette[4] : 'none'" />
        </span>

        <!-- Dashboard title as link -->
        <a
          data-testid="dashboard-link"
          :href="dashboard.url"
          :style="linkStyle"
        >
          {{ dashboard.title }}
        </a>
      </div>

      <!-- Optional tags -->
      <div
        v-if="dashboard.tags && dashboard.tags.length > 0"
        :style="tagsRowStyle"
      >
        <span
          v-for="tag in dashboard.tags"
          :key="tag"
          data-testid="dashboard-tag"
          :style="tagStyle"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </div>
</template>
