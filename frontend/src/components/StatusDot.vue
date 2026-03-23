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

const glowAnimationMap: Record<string, string> = {
  critical: 'pulse-critical 2s ease-in-out infinite',
  warning: 'pulse-warning 2s ease-in-out infinite',
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const dotStyle = computed(() => {
  const animations: string[] = []
  if (!prefersReducedMotion) {
    if (props.pulse) {
      animations.push('statusDotPulse 2s ease-in-out infinite')
    }
    if (glowAnimationMap[props.status]) {
      animations.push(glowAnimationMap[props.status])
    }
  }

  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    backgroundColor: colorMap[props.status],
    borderRadius: '9999px',
    display: 'inline-block',
    flexShrink: 0,
    ...(animations.length > 0 ? { animation: animations.join(', ') } : {}),
  }
})
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

@keyframes pulse-critical {
  0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.4); }
  50% { box-shadow: 0 0 10px rgba(239,68,68,0.7); }
}

@keyframes pulse-warning {
  0%, 100% { box-shadow: 0 0 4px rgba(249,115,22,0.4); }
  50% { box-shadow: 0 0 10px rgba(249,115,22,0.7); }
}
</style>
