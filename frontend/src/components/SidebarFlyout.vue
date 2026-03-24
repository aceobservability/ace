<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  section: string
  isPinned: boolean
}>()

const emit = defineEmits<{
  close: []
  navigate: [path: string]
  hover: []
  hoverEnd: []
}>()

const route = useRoute()

interface SubNavItem {
  id: string
  label: string
  path: string
}

interface SectionConfig {
  label: string
  subNav: SubNavItem[]
}

const sectionConfigs: Record<string, SectionConfig> = {
  dashboards: {
    label: 'Dashboards',
    subNav: [
      { id: 'all-dashboards', label: 'All Dashboards', path: '/app/dashboards' },
    ],
  },
  services: {
    label: 'Services',
    subNav: [
      { id: 'all-services', label: 'All Services', path: '/app/services' },
    ],
  },
  alerts: {
    label: 'Alerts',
    subNav: [
      { id: 'active', label: 'Active', path: '/app/alerts' },
      { id: 'silenced', label: 'Silenced', path: '/app/alerts/silenced' },
      { id: 'rules', label: 'Rules', path: '/app/alerts/rules' },
    ],
  },
  explore: {
    label: 'Explore',
    subNav: [
      { id: 'metrics', label: 'Metrics', path: '/app/explore/metrics' },
      { id: 'logs', label: 'Logs', path: '/app/explore/logs' },
      { id: 'traces', label: 'Traces', path: '/app/explore/traces' },
    ],
  },
  settings: {
    label: 'Settings',
    subNav: [
      { id: 'general', label: 'General', path: '/app/settings/general' },
      { id: 'members', label: 'Members', path: '/app/settings/members' },
      { id: 'groups', label: 'Groups & Permissions', path: '/app/settings/groups' },
      { id: 'datasources', label: 'Data Sources', path: '/app/settings/datasources' },
      { id: 'ai', label: 'AI Configuration', path: '/app/settings/ai' },
      { id: 'sso', label: 'SSO / Auth', path: '/app/settings/sso' },
      { id: 'audit-log', label: 'Audit Log', path: '/app/audit-log' },
    ],
  },
}

const config = computed(() => sectionConfigs[props.section] ?? null)

function isSubNavActive(item: SubNavItem): boolean {
  return route.path === item.path || route.path.startsWith(`${item.path}/`)
}

const searchPlaceholder = computed(() => {
  if (!config.value) return ''
  return `Search ${config.value.label.toLowerCase()}...`
})
</script>

<template>
  <div
    v-if="config"
    data-testid="flyout-panel"
    class="fixed top-0 bottom-0 z-40 flex flex-col overflow-hidden animate-fade-in"
    :style="{
      left: 'var(--sidebar-rail-width)',
      width: 'var(--sidebar-flyout-width)',
      backgroundColor: 'var(--color-surface-container-low)',
      borderLeft: '1px solid var(--color-outline-variant)',
      borderRight: '1px solid var(--color-outline-variant)',
      boxShadow: 'var(--shadow-lg)',
    }"
    @mouseenter="$emit('hover')"
    @mouseleave="$emit('hoverEnd')"
  >
    <!-- Header -->
    <div
      data-testid="flyout-header"
      class="flex items-center justify-between px-4 py-3 shrink-0"
    >
      <span
        class="font-semibold"
        :style="{ fontSize: '13px', color: 'var(--color-on-surface)', letterSpacing: '-0.01em' }"
      >{{ config.label }}</span>
      <button
        data-testid="flyout-close"
        class="flex items-center justify-center cursor-pointer border-none bg-transparent"
        :style="{ color: 'var(--color-outline)', width: '20px', height: '20px' }"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>

    <!-- Search -->
    <div class="px-4 pb-3">
      <input
        data-testid="flyout-search"
        type="text"
        :placeholder="searchPlaceholder"
        class="w-full border-none outline-none"
        :style="{
          padding: '7px 10px',
          backgroundColor: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '8px',
          color: 'var(--color-on-surface)',
          fontSize: '12px',
        }"
      />
    </div>

    <!-- Sub-navigation -->
    <div class="flex flex-col gap-0.5 px-3 overflow-y-auto flex-1">
      <button
        v-for="item in config.subNav"
        :key="item.id"
        :data-testid="`flyout-nav-${item.id}`"
        :aria-current="isSubNavActive(item) ? 'page' : undefined"
        class="flex items-center text-left cursor-pointer border-none transition-colors duration-150"
        :style="{
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: isSubNavActive(item) ? '500' : '400',
          color: isSubNavActive(item) ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
          backgroundColor: isSubNavActive(item) ? 'var(--color-primary-muted)' : 'transparent',
          borderLeft: isSubNavActive(item) ? '2px solid var(--color-primary)' : '2px solid transparent',
        }"
        @click="emit('navigate', item.path)"
      >{{ item.label }}</button>
    </div>
  </div>
</template>
