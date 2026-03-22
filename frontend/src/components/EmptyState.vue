<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  title: string
  description: string
  actionLabel?: string
  actionRoute?: string
  secondaryActionLabel?: string
  secondaryActionRoute?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <component
      :is="icon"
      :style="{ color: 'var(--color-outline)', width: '40px', height: '40px' }"
    />
    <h3
      class="mt-4 font-display text-lg font-semibold"
      :style="{ color: 'var(--color-on-surface)' }"
    >
      {{ title }}
    </h3>
    <p
      class="mt-2 max-w-sm text-sm"
      :style="{ color: 'var(--color-on-surface-variant)' }"
    >
      {{ description }}
    </p>
    <div v-if="actionLabel" class="mt-6 flex items-center gap-3">
      <router-link
        v-if="actionRoute"
        :to="actionRoute"
        class="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        :style="{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
        }"
      >
        {{ actionLabel }}
      </router-link>
      <button
        v-else
        class="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        :style="{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
        }"
      >
        {{ actionLabel }}
      </button>

      <router-link
        v-if="secondaryActionLabel && secondaryActionRoute"
        :to="secondaryActionRoute"
        class="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
        :style="{
          borderColor: 'var(--color-outline-variant)',
          color: 'var(--color-on-surface-variant)',
        }"
      >
        {{ secondaryActionLabel }}
      </router-link>
      <button
        v-else-if="secondaryActionLabel"
        class="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
        :style="{
          borderColor: 'var(--color-outline-variant)',
          color: 'var(--color-on-surface-variant)',
        }"
      >
        {{ secondaryActionLabel }}
      </button>
    </div>
  </div>
</template>
