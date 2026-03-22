<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: string
    height?: string
    rounded?: string
  }>(),
  {
    width: '100%',
    height: '1rem',
    rounded: '0.5rem',
  },
)

const shimmerStyle = computed(() => ({
  width: props.width,
  height: props.height,
  borderRadius: props.rounded,
  animation: 'shimmer 1.5s ease-in-out infinite',
  backgroundColor: 'var(--color-surface-container-low)',
}))
</script>

<template>
  <div :style="shimmerStyle" aria-hidden="true" />
</template>

<style scoped>
@keyframes shimmer {
  0%, 100% {
    background-color: var(--color-surface-container-low);
  }
  50% {
    background-color: var(--color-surface-container-high);
  }
}
</style>
