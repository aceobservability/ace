<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: 'healthy' | 'warning' | 'critical' | 'info'
    pulse?: boolean
    size?: number
  }>(),
  {
    pulse: false,
    size: 4,
  },
)

const colorMap: Record<string, string> = {
  healthy: 'var(--color-secondary)',
  warning: 'var(--color-tertiary)',
  critical: 'var(--color-error)',
  info: 'var(--color-primary)',
}

const labelMap: Record<string, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  info: 'Info',
}

const dotStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  backgroundColor: colorMap[props.status],
  borderRadius: '9999px',
  display: 'inline-block',
  flexShrink: 0,
  ...(props.pulse
    ? { animation: 'statusDotPulse 2s ease-in-out infinite' }
    : {}),
}))
</script>

<template>
  <span
    role="status"
    :aria-label="labelMap[status]"
    :style="dotStyle"
  />
</template>

<style scoped>
@keyframes statusDotPulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
