<script setup lang="ts">
import { computed } from 'vue'
import { chartPalette, thresholdColors } from '../../utils/chartTheme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertItem {
  id: string
  name: string
  severity: 'critical' | 'warning' | 'info'
  state: 'firing' | 'resolved' | 'pending'
  timestamp: string // ISO timestamp
  message?: string
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  alerts: AlertItem[]
}>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityColor(severity: AlertItem['severity']): string {
  if (severity === 'critical') return thresholdColors.critical
  if (severity === 'warning') return thresholdColors.warning
  return chartPalette[0] // info → Steel Blue
}

function stateBadgeStyle(state: AlertItem['state']): Record<string, string> {
  if (state === 'firing') {
    return {
      backgroundColor: `${thresholdColors.critical}22`,
      color: thresholdColors.critical,
      border: `1px solid ${thresholdColors.critical}55`,
    }
  }
  if (state === 'resolved') {
    return {
      backgroundColor: `${thresholdColors.good}22`,
      color: thresholdColors.good,
      border: `1px solid ${thresholdColors.good}55`,
    }
  }
  // pending
  return {
    backgroundColor: `${thresholdColors.warning}22`,
    color: thresholdColors.warning,
    border: `1px solid ${thresholdColors.warning}55`,
  }
}

function formatTimestamp(iso: string): string {
  const now = Date.now()
  const ts = new Date(iso).getTime()
  const diffMs = now - ts
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

const nameStyle = {
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

const badgeBaseStyle = {
  fontSize: '0.6875rem',
  fontWeight: '600',
  padding: '0.125rem 0.4rem',
  borderRadius: '9999px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  flexShrink: '0',
}

const messageStyle = {
  fontSize: '0.75rem',
  color: 'var(--color-on-surface-variant)',
  paddingLeft: '1.25rem', // align under name (past the dot)
}
</script>

<template>
  <div
    data-testid="alert-list-container"
    :style="containerStyle"
  >
    <!-- Empty state -->
    <div
      v-if="props.alerts.length === 0"
      :style="emptyStyle"
    >
      No alerts
    </div>

    <!-- Alert rows -->
    <div
      v-for="alert in props.alerts"
      v-else
      :key="alert.id"
      data-testid="alert-item"
      :style="rowStyle"
    >
      <!-- Top row: dot + name + badge + timestamp -->
      <div :style="rowTopStyle">
        <!-- Severity dot -->
        <span
          data-testid="severity-dot"
          :style="{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            flexShrink: '0',
            backgroundColor: severityColor(alert.severity),
          }"
        />

        <!-- Alert name -->
        <span
          data-testid="alert-name"
          :style="nameStyle"
        >
          {{ alert.name }}
        </span>

        <!-- State badge -->
        <span
          data-testid="state-badge"
          :style="{ ...badgeBaseStyle, ...stateBadgeStyle(alert.state) }"
        >
          {{ alert.state }}
        </span>

        <!-- Timestamp -->
        <span
          data-testid="alert-timestamp"
          :style="timestampStyle"
        >
          {{ formatTimestamp(alert.timestamp) }}
        </span>
      </div>

      <!-- Optional message -->
      <div
        v-if="alert.message"
        data-testid="alert-message"
        :style="messageStyle"
      >
        {{ alert.message }}
      </div>
    </div>
  </div>
</template>
