<script setup lang="ts">
import { Activity, AlertTriangle, LayoutGrid, Search, Settings, Sparkles } from 'lucide-vue-next'
import { computed } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useOrganization } from '../composables/useOrganization'

const props = defineProps<{
  activeSection: string | null
}>()

const emit = defineEmits<{
  hover: [sectionId: string]
  hoverEnd: []
  select: [sectionId: string]
  avatarClick: []
  orgClick: []
}>()

const { user } = useAuth()
const { currentOrg } = useOrganization()

const orgInitial = computed(() => {
  if (!currentOrg.value?.name) return '?'
  return currentOrg.value.name.charAt(0).toUpperCase()
})

interface RailItem {
  id: string
  icon: typeof Sparkles
  colorVar: string
}

const navItems: RailItem[] = [
  { id: 'home', icon: Sparkles, colorVar: 'var(--color-primary)' },
  { id: 'dashboards', icon: LayoutGrid, colorVar: 'var(--color-on-surface)' },
  { id: 'services', icon: Activity, colorVar: 'var(--color-secondary)' },
  { id: 'alerts', icon: AlertTriangle, colorVar: 'var(--color-error)' },
  { id: 'explore', icon: Search, colorVar: 'var(--color-tertiary)' },
]

const userInitials = computed(() => {
  if (!user.value) return '?'
  if (user.value.name) {
    return user.value.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return user.value.email.charAt(0).toUpperCase()
})

function isActive(id: string): boolean {
  return props.activeSection === id
}
</script>

<template>
  <div
    data-testid="sidebar-rail"
    class="fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center py-3 gap-1"
    :style="{
      width: '52px',
      backgroundColor: 'var(--color-surface)',
    }"
  >
    <!-- Logo -->
    <div
      data-testid="rail-logo"
      class="flex items-center justify-center shrink-0 mb-4"
      :style="{
        width: '32px',
        height: '32px',
        background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
        borderRadius: '8px',
        color: '#0C0D0F',
        fontWeight: '700',
        fontSize: '14px',
        fontFamily: 'var(--font-display)',
      }"
    >A</div>

    <!-- Org selector -->
    <button
      data-testid="rail-org-selector"
      class="flex items-center justify-center shrink-0 cursor-pointer mb-2 transition-colors duration-150"
      :style="{
        width: '32px',
        height: '32px',
        borderRadius: '6px',
        backgroundColor: 'var(--color-surface-container-high)',
        border: '1px solid var(--color-outline-variant)',
        color: 'var(--color-on-surface-variant)',
        fontSize: '12px',
        fontWeight: '600',
        fontFamily: 'var(--font-display)',
      }"
      :title="currentOrg?.name || 'Select organization'"
      @click="emit('orgClick')"
    >{{ orgInitial }}</button>

    <!-- Nav icons -->
    <button
      v-for="item in navItems"
      :key="item.id"
      :data-testid="`rail-${item.id}`"
      class="relative flex items-center justify-center shrink-0 cursor-pointer border-none transition-colors duration-150"
      :style="{
        width: '44px',
        height: '40px',
        borderRadius: '8px',
        backgroundColor: isActive(item.id) ? 'var(--color-primary-muted)' : 'transparent',
        color: isActive(item.id) ? item.colorVar : 'var(--color-outline)',
      }"
      @mouseenter="emit('hover', item.id)"
      @mouseleave="emit('hoverEnd')"
      @click="emit('select', item.id)"
    >
      <!-- Accent bar -->
      <div
        v-if="isActive(item.id)"
        data-testid="rail-accent-bar"
        class="absolute top-2 bottom-2"
        :style="{
          left: '-6px',
          width: '3px',
          backgroundColor: 'var(--color-primary)',
          borderRadius: '2px',
        }"
      />
      <component :is="item.icon" :size="18" />
    </button>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Settings -->
    <button
      data-testid="rail-settings"
      class="relative flex items-center justify-center shrink-0 cursor-pointer border-none transition-colors duration-150"
      :style="{
        width: '44px',
        height: '40px',
        borderRadius: '8px',
        backgroundColor: isActive('settings') ? 'var(--color-primary-muted)' : 'transparent',
        color: isActive('settings') ? 'var(--color-on-surface-variant)' : 'var(--color-outline)',
      }"
      @mouseenter="emit('hover', 'settings')"
      @mouseleave="emit('hoverEnd')"
      @click="emit('select', 'settings')"
    >
      <div
        v-if="isActive('settings')"
        data-testid="rail-accent-bar"
        class="absolute top-2 bottom-2"
        :style="{
          left: '-6px',
          width: '3px',
          backgroundColor: 'var(--color-primary)',
          borderRadius: '2px',
        }"
      />
      <Settings :size="18" />
    </button>

    <!-- User avatar -->
    <button
      data-testid="rail-user-avatar"
      class="flex items-center justify-center shrink-0 cursor-pointer border-none mt-1"
      :style="{
        width: '30px',
        height: '30px',
        borderRadius: '50%',
        backgroundColor: 'var(--color-surface-container-high)',
        border: '1px solid var(--color-outline-variant)',
        color: 'var(--color-on-surface-variant)',
        fontSize: '11px',
        fontWeight: '600',
      }"
      @click="emit('avatarClick')"
    >{{ userInitials }}</button>
  </div>
</template>
