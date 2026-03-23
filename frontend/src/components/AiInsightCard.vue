<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  description: string
  timestamp: string
  type: 'anomaly' | 'optimization' | 'forecast'
}>()

const colorMap = {
  anomaly: { border: '#C9960F', bg: 'rgba(201,150,15,0.05)' },
  optimization: { border: '#4D8BBD', bg: 'rgba(77,139,189,0.05)' },
  forecast: { border: '#D4A11E', bg: 'rgba(212,161,30,0.05)' },
}

const cardStyle = computed(() => {
  const colors = colorMap[props.type]
  return {
    borderLeft: `2px solid ${colors.border}`,
    backgroundColor: colors.bg,
    borderRadius: '0 8px 8px 0',
    padding: '10px 12px',
  }
})
</script>

<template>
  <div
    data-testid="ai-insight-card"
    :style="cardStyle"
  >
    <h4
      class="text-sm font-semibold"
      :style="{ color: 'var(--color-on-surface)' }"
    >
      {{ title }}
    </h4>
    <p
      class="mt-1 text-sm"
      :style="{ color: 'var(--color-on-surface-variant)' }"
    >
      {{ description }}
    </p>
    <time
      class="mt-1 block text-xs"
      :style="{ color: 'var(--color-outline)' }"
      :datetime="timestamp"
    >
      {{ timestamp }}
    </time>
  </div>
</template>
