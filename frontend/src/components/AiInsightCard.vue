<script setup lang="ts">
defineProps<{
  title: string
  description: string
  timestamp: string
}>()
</script>

<template>
  <div
    data-testid="ai-insight-card"
    class="rounded-lg p-4"
    :style="{
      backgroundColor: 'color-mix(in srgb, var(--color-surface-container-highest) 80%, transparent)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '2px solid transparent',
      borderImage: 'linear-gradient(to right, var(--color-primary), var(--color-primary-dim)) 1',
      borderImageSlice: '1',
      position: 'relative',
      overflow: 'hidden',
    }"
  >
    <!-- Background tint -->
    <div
      class="absolute inset-0 pointer-events-none"
      :style="{
        backgroundColor: 'var(--color-primary)',
        opacity: 0.05,
        borderRadius: '0.5rem',
      }"
    />

    <div class="relative">
      <div class="flex items-center gap-2">
        <!-- AI gradient icon -->
        <span
          class="inline-block shrink-0"
          :style="{
            width: '16px',
            height: '16px',
            borderRadius: '3px',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
          }"
        />
        <h4
          class="font-display text-sm font-semibold"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          {{ title }}
        </h4>
      </div>
      <p
        class="mt-2 text-sm"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        {{ description }}
      </p>
      <time
        class="mt-2 block text-xs"
        :style="{ color: 'var(--color-outline)' }"
      >
        {{ timestamp }}
      </time>
    </div>
  </div>
</template>
