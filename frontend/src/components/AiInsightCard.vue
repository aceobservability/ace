<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  description: string
  timestamp: string
  type: 'anomaly' | 'optimization' | 'forecast'
}>()

const colorMap = {
  anomaly: { border: '#E5A00D', bg: 'rgba(229,160,13,0.05)' },
  optimization: { border: '#60A5FA', bg: 'rgba(96,165,250,0.05)' },
  forecast: { border: '#F97316', bg: 'rgba(249,115,22,0.05)' },
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
