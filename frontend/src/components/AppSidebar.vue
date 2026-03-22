<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  Home,
  LayoutGrid,
  Search,
  Settings,
  Sparkles,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useOrganization } from '../composables/useOrganization'
import { useSidebar } from '../composables/useSidebar'

const route = useRoute()
const router = useRouter()
const { isOpen } = useSidebar()
const { user } = useAuth()
const { currentOrg } = useOrganization()

interface NavItem {
  id: string
  icon: typeof Home
  label: string
  path: string
  colorVar: string
  children?: NavChild[]
}

interface NavChild {
  id: string
  label: string
  path: string
}

const navItems: NavItem[] = [
  { id: 'home', icon: Sparkles, label: 'Home', path: '/app', colorVar: 'var(--color-primary)' },
  { id: 'dashboards', icon: LayoutGrid, label: 'Dashboards', path: '/app/dashboards', colorVar: 'var(--color-on-surface)' },
  { id: 'services', icon: Activity, label: 'Services', path: '/app/services', colorVar: 'var(--color-secondary)' },
  { id: 'alerts', icon: AlertTriangle, label: 'Alerts', path: '/app/alerts', colorVar: 'var(--color-error)' },
  {
    id: 'explore',
    icon: Search,
    label: 'Explore',
    path: '/app/explore/metrics',
    colorVar: 'var(--color-tertiary)',
    children: [
      { id: 'explore-metrics', label: 'Metrics', path: '/app/explore/metrics' },
      { id: 'explore-logs', label: 'Logs', path: '/app/explore/logs' },
      { id: 'explore-traces', label: 'Traces', path: '/app/explore/traces' },
    ],
  },
]

const settingsItem = {
  id: 'settings',
  icon: Settings,
  label: 'Settings',
  colorVar: 'var(--color-on-surface-variant)',
}

function isActive(item: NavItem): boolean {
  const currentPath = route.path
  if (item.children) {
    return item.children.some((child) => currentPath.startsWith(child.path))
  }
  if (item.path === '/app') {
    return currentPath === '/app' || currentPath === '/app/'
  }
  return currentPath.startsWith(item.path)
}

function isExploreActive(): boolean {
  return route.path.startsWith('/app/explore')
}

function isSettingsActive(): boolean {
  return route.path.startsWith('/app/settings')
}

function isChildActive(child: NavChild): boolean {
  return route.path.startsWith(child.path)
}

const settingsPath = computed(() => {
  if (currentOrg.value?.id) {
    return `/app/settings/org/${currentOrg.value.id}/general`
  }
  return '/app/settings'
})

function navigate(path: string) {
  router.push(path)
}

const displayName = computed(() => {
  if (!user.value) return ''
  return user.value.name || user.value.email
})

const sidebarTransform = computed(() => {
  return isOpen.value ? 'translateX(0)' : 'translateX(-100%)'
})
</script>

<template>
  <aside
    data-testid="sidebar"
    class="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden transition-transform duration-200 ease-out"
    :style="{
      width: '240px',
      transform: sidebarTransform,
      backgroundColor: 'var(--color-surface-container-low)',
      borderRight: '1px solid var(--color-outline-variant)',
    }"
  >
    <!-- Header: Org name -->
    <div
      class="flex h-14 items-center px-4 shrink-0"
      :style="{ borderBottom: '1px solid var(--color-outline-variant)' }"
    >
      <span
        class="text-sm font-bold tracking-wide uppercase"
        :style="{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }"
      >{{ currentOrg?.name || 'Ace' }}</span>
    </div>

    <!-- Navigation -->
    <nav aria-label="Main navigation" class="flex flex-1 flex-col py-2 overflow-y-auto overflow-x-hidden">
      <div class="flex flex-col gap-0.5 px-2">
        <!-- Main nav items -->
        <button
          v-for="item in navItems"
          :key="item.id"
          class="group relative flex h-9 items-center gap-3 px-3 rounded-md transition-colors duration-150 cursor-pointer border-none w-full text-left"
          :style="{
            backgroundColor: isActive(item) ? 'var(--color-surface-container-high)' : 'transparent',
            color: isActive(item) ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
          }"
          :data-testid="`nav-${item.id}`"
          :aria-current="isActive(item) ? 'page' : undefined"
          @click="navigate(item.path)"
        >
          <component
            :is="item.icon"
            :size="18"
            class="shrink-0"
            :style="{ color: isActive(item) ? item.colorVar : undefined }"
          />
          <span class="text-sm font-medium">{{ item.label }}</span>
        </button>

        <!-- Explore children (shown when explore is active) -->
        <div
          v-if="isExploreActive()"
          class="flex flex-col gap-px ml-9 mr-1 mb-1"
        >
          <button
            v-for="child in navItems.find(i => i.id === 'explore')?.children"
            :key="child.id"
            class="flex h-7 items-center px-3 rounded-md cursor-pointer transition-colors duration-150 border-none text-left"
            :style="{
              color: isChildActive(child) ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              backgroundColor: isChildActive(child) ? 'var(--color-surface-container-high)' : 'transparent',
            }"
            :data-testid="`nav-${child.id}`"
            @click="navigate(child.path)"
          >
            <span class="text-xs font-medium">{{ child.label }}</span>
          </button>
        </div>
      </div>

      <!-- Divider -->
      <div
        class="mx-4 my-2"
        :style="{ borderTop: '1px solid var(--color-outline-variant)' }"
      />

      <!-- Settings -->
      <div class="flex flex-col gap-0.5 px-2 mt-auto">
        <button
          class="group relative flex h-9 items-center gap-3 px-3 rounded-md transition-colors duration-150 cursor-pointer border-none w-full text-left"
          :style="{
            backgroundColor: isSettingsActive() ? 'var(--color-surface-container-high)' : 'transparent',
            color: isSettingsActive() ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
          }"
          data-testid="nav-settings"
          :aria-current="isSettingsActive() ? 'page' : undefined"
          @click="navigate(settingsPath)"
        >
          <component
            :is="settingsItem.icon"
            :size="18"
            class="shrink-0"
          />
          <span class="text-sm font-medium">{{ settingsItem.label }}</span>
        </button>
      </div>
    </nav>

    <!-- User info at bottom -->
    <div
      v-if="user"
      class="shrink-0 px-4 py-3"
      :style="{ borderTop: '1px solid var(--color-outline-variant)' }"
    >
      <span
        class="block text-xs truncate"
        :style="{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-mono)' }"
      >{{ displayName }}</span>
    </div>
  </aside>
</template>
