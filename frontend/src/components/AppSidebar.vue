<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  LayoutGrid,
  Pin,
  PinOff,
  Search,
  Settings,
  Sparkles,
  Star,
} from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAiSidebar } from '../composables/useAiSidebar'
import { useAuth } from '../composables/useAuth'
import { useFavorites } from '../composables/useFavorites'
import { useOrganization } from '../composables/useOrganization'
import { useSidebar } from '../composables/useSidebar'
import SidebarUserMenu from './SidebarUserMenu.vue'

const router = useRouter()
const route = useRoute()
const { user } = useAuth()
const { organizations, currentOrg, selectOrganization } = useOrganization()
const { expandedSection, isPinned, currentRouteSection, toggleSection, togglePin } = useSidebar()
const { favorites, recentDashboards, favoriteRoute, favoritesForType } = useFavorites()
const { isOpen: aiSidebarOpen, toggle: toggleAiSidebar } = useAiSidebar()

const userMenuOpen = ref(false)
const orgMenuOpen = ref(false)
const orgMenuRef = ref<HTMLDivElement | null>(null)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const highlightedIndex = ref(-1)

const isExpanded = computed(() => expandedSection.value !== null && expandedSection.value !== 'home')

// --- Nav items ---
interface NavItem {
  id: string
  label: string
  icon: typeof Sparkles
  colorVar: string
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Sparkles, colorVar: 'var(--color-primary)' },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutGrid, colorVar: 'var(--color-on-surface)' },
  { id: 'services', label: 'Services', icon: Activity, colorVar: 'var(--color-secondary)' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, colorVar: 'var(--color-error)' },
  { id: 'explore', label: 'Explore', icon: Search, colorVar: 'var(--color-tertiary)' },
]

// --- Section sub-nav configs ---
interface SubNavItem {
  id: string
  label: string
  path: string
}

const sectionSubNav: Record<string, SubNavItem[]> = {
  dashboards: [],
  services: [
    { id: 'all-services', label: 'All Services', path: '/app/services' },
  ],
  alerts: [
    { id: 'active', label: 'Active', path: '/app/alerts' },
    { id: 'silenced', label: 'Silenced', path: '/app/alerts/silenced' },
    { id: 'rules', label: 'Rules', path: '/app/alerts/rules' },
  ],
  explore: [
    { id: 'metrics', label: 'Metrics', path: '/app/explore/metrics' },
    { id: 'logs', label: 'Logs', path: '/app/explore/logs' },
    { id: 'traces', label: 'Traces', path: '/app/explore/traces' },
  ],
  settings: [
    { id: 'general', label: 'General', path: '/app/settings/general' },
    { id: 'members', label: 'Members', path: '/app/settings/members' },
    { id: 'groups', label: 'Groups & Permissions', path: '/app/settings/groups' },
    { id: 'datasources', label: 'Data Sources', path: '/app/settings/datasources' },
    { id: 'ai', label: 'AI Configuration', path: '/app/settings/ai' },
    { id: 'sso', label: 'SSO / Auth', path: '/app/settings/sso' },
    { id: 'audit-log', label: 'Audit Log', path: '/app/audit-log' },
  ],
}

const sectionRoutes: Record<string, string> = {
  home: '/app',
  dashboards: '/app/dashboards',
  services: '/app/services',
  alerts: '/app/alerts',
  explore: '/app/explore/metrics',
  settings: '/app/settings',
}

// --- Computed ---
const orgInitial = computed(() => {
  if (!currentOrg.value?.name) return '?'
  return currentOrg.value.name.charAt(0).toUpperCase()
})

const userInitials = computed(() => {
  if (!user.value) return '?'
  if (user.value.name) {
    return user.value.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }
  return user.value.email.charAt(0).toUpperCase()
})

const activeSection = computed<string | null>(
  () => expandedSection.value || currentRouteSection.value,
)

const currentSubNav = computed(() => {
  if (!expandedSection.value) return []
  return sectionSubNav[expandedSection.value] || []
})

// Dashboard dynamic content
const dashboardFavorites = computed(() => {
  if (expandedSection.value !== 'dashboards') return []
  return favorites.value
    .filter((f) => typeof f === 'object' && f.type === 'dashboard')
    .slice(0, 5)
})

const dashboardRecents = computed(() => {
  if (expandedSection.value !== 'dashboards') return []
  return recentDashboards.value.slice(0, 5)
})

const sectionTypeMap: Record<string, 'dashboard' | 'service' | 'alert' | 'explore'> = {
  services: 'service',
  alerts: 'alert',
  explore: 'explore',
}

const sectionFavorites = computed(() => {
  const section = expandedSection.value
  if (!section || !sectionTypeMap[section]) return []
  return favoritesForType(sectionTypeMap[section]!).slice(0, 5)
})

// Search filtering
const filteredSubNav = computed(() => {
  if (!searchQuery.value.trim()) return currentSubNav.value
  const q = searchQuery.value.toLowerCase()
  return currentSubNav.value.filter((item) => item.label.toLowerCase().includes(q))
})

const filteredFavorites = computed(() => {
  if (!searchQuery.value.trim()) return dashboardFavorites.value
  const q = searchQuery.value.toLowerCase()
  return dashboardFavorites.value.filter((f) =>
    typeof f === 'object' && f.title.toLowerCase().includes(q),
  )
})

const filteredSectionFavorites = computed(() => {
  if (!searchQuery.value.trim()) return sectionFavorites.value
  const q = searchQuery.value.toLowerCase()
  return sectionFavorites.value.filter((f) => f.title.toLowerCase().includes(q))
})

const filteredRecents = computed(() => {
  if (!searchQuery.value.trim()) return dashboardRecents.value
  const q = searchQuery.value.toLowerCase()
  return dashboardRecents.value.filter((r) => r.title.toLowerCase().includes(q))
})

const hasAnyResults = computed(() => {
  if (expandedSection.value === 'dashboards') {
    return filteredFavorites.value.length > 0 || filteredRecents.value.length > 0 || !searchQuery.value.trim()
  }
  return filteredSubNav.value.length > 0 || filteredSectionFavorites.value.length > 0
})

const allNavigableItems = computed<{ path: string }[]>(() => {
  const items: { path: string }[] = []
  if (expandedSection.value === 'dashboards') {
    for (const f of filteredFavorites.value) {
      if (typeof f === 'object') items.push({ path: `/app/dashboards/${f.id}` })
    }
    for (const r of filteredRecents.value) {
      items.push({ path: `/app/dashboards/${r.id}` })
    }
    items.push({ path: '/app/dashboards' })
  } else {
    for (const f of filteredSectionFavorites.value) {
      items.push({ path: favoriteRoute(f) })
    }
    for (const item of filteredSubNav.value) {
      items.push({ path: item.path })
    }
  }
  return items
})

// --- Handlers ---
function isActive(id: string): boolean {
  return activeSection.value === id
}

function isSubNavActive(item: SubNavItem): boolean {
  return route.path === item.path || route.path.startsWith(`${item.path}/`)
}

function handleNavSelect(sectionId: string) {
  if (sectionId !== currentRouteSection.value) {
    router.push(sectionRoutes[sectionId] || '/app')
  }
  toggleSection(sectionId)
  searchQuery.value = ''
  highlightedIndex.value = -1
}

function handleSubNavNavigate(path: string) {
  router.push(path)
}

function handleOrgClick() {
  orgMenuOpen.value = !orgMenuOpen.value
  userMenuOpen.value = false
}

function handleSelectOrg(orgId: string) {
  const previousOrgId = currentOrg.value?.id
  selectOrganization(orgId)
  orgMenuOpen.value = false
  if (orgId !== previousOrgId) {
    router.push('/app')
  }
}

function handleAvatarClick() {
  userMenuOpen.value = !userMenuOpen.value
  orgMenuOpen.value = false
}

function closeUserMenu() {
  userMenuOpen.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (!isExpanded.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (allNavigableItems.value.length > 0) {
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, allNavigableItems.value.length - 1)
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1)
  } else if (e.key === 'Enter' && highlightedIndex.value >= 0) {
    e.preventDefault()
    const item = allNavigableItems.value[highlightedIndex.value]
    if (item) handleSubNavNavigate(item.path)
  }
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// Auto-focus search when expanding
watch(expandedSection, (section) => {
  if (section && section !== 'home') {
    nextTick(() => searchInput.value?.focus())
  } else {
    searchQuery.value = ''
    highlightedIndex.value = -1
  }
})

// Click-outside for org menu
function handleOrgMenuClickOutside(event: MouseEvent) {
  if (orgMenuRef.value && !orgMenuRef.value.contains(event.target as Node)) {
    orgMenuOpen.value = false
  }
}

import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  document.addEventListener('click', handleOrgMenuClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOrgMenuClickOutside)
})
</script>

<template>
  <nav
    aria-label="Main navigation"
    data-testid="sidebar"
    class="fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-[width] duration-200"
    :style="{
      width: isExpanded ? 'var(--sidebar-flyout-width)' : 'var(--sidebar-rail-width)',
      backgroundColor: 'var(--color-surface)',
      borderRight: isExpanded ? '1px solid var(--color-stroke-subtle)' : 'none',
    }"
    @keydown="handleKeydown"
  >
    <!-- Top: Logo + Org -->
    <div class="flex flex-col items-center py-3 gap-1 shrink-0" :class="{ 'items-start px-3': isExpanded }">
      <!-- Logo row -->
      <div class="flex items-center gap-3 mb-2" :class="{ 'w-full': isExpanded }">
        <div
          data-testid="sidebar-logo"
          class="flex items-center justify-center shrink-0"
          :style="{
            width: '32px',
            height: '32px',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            borderRadius: '8px',
            color: '#0B0D0F',
            fontWeight: '700',
            fontSize: '14px',
            fontFamily: 'var(--font-display)',
          }"
        >A</div>
        <span
          v-if="isExpanded"
          class="font-display font-semibold text-sm flex-1"
          :style="{ color: 'var(--color-on-surface)', letterSpacing: '-0.01em' }"
        >Ace</span>
        <button
          v-if="isExpanded"
          data-testid="sidebar-pin-toggle"
          class="flex items-center justify-center shrink-0 cursor-pointer border-none bg-transparent transition-colors duration-150"
          :style="{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            color: isPinned ? 'var(--color-primary)' : 'var(--color-outline)',
            backgroundColor: isPinned ? 'var(--color-primary-muted)' : 'transparent',
          }"
          :title="isPinned ? 'Unpin sidebar (⌘B)' : 'Pin sidebar open (⌘B)'"
          @click="togglePin"
        >
          <component :is="isPinned ? PinOff : Pin" :size="14" />
        </button>
      </div>

      <!-- Org selector -->
      <button
        data-testid="sidebar-org-selector"
        class="flex items-center shrink-0 cursor-pointer transition-colors duration-150"
        :class="isExpanded ? 'gap-2 w-full rounded-lg px-2 py-1.5' : 'justify-center rounded-md'"
        :style="{
          width: isExpanded ? '100%' : '32px',
          height: isExpanded ? 'auto' : '32px',
          backgroundColor: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-stroke-subtle)',
          color: 'var(--color-on-surface-variant)',
          fontSize: '12px',
          fontWeight: '600',
          fontFamily: 'var(--font-display)',
        }"
        :title="currentOrg?.name || 'Select organization'"
        @click.stop="handleOrgClick"
      >
        <span class="shrink-0">{{ orgInitial }}</span>
        <span v-if="isExpanded" class="flex-1 truncate text-left text-xs" :style="{ color: 'var(--color-on-surface)' }">
          {{ currentOrg?.name || 'Select org' }}
        </span>
      </button>
    </div>

    <!-- Nav items -->
    <div class="flex flex-col gap-0.5 px-1" :class="{ 'px-2': isExpanded }">
      <button
        v-for="item in navItems"
        :key="item.id"
        :data-testid="`sidebar-nav-${item.id}`"
        class="relative flex items-center shrink-0 cursor-pointer border-none transition-all duration-150"
        :class="isExpanded ? 'gap-3 px-3 rounded-lg' : 'justify-center rounded-lg'"
        :style="{
          width: isExpanded ? '100%' : '44px',
          height: '40px',
          margin: isExpanded ? '0' : '0 auto',
          borderRadius: '8px',
          backgroundColor: isActive(item.id) ? 'var(--color-primary-muted)' : 'transparent',
          color: isActive(item.id) ? item.colorVar : 'var(--color-outline)',
        }"
        @click="handleNavSelect(item.id)"
      >
        <!-- Accent bar -->
        <div
          v-if="isActive(item.id)"
          data-testid="sidebar-accent-bar"
          class="absolute top-2 bottom-2"
          :style="{
            left: isExpanded ? '0px' : '-2px',
            width: '3px',
            backgroundColor: 'var(--color-primary)',
            borderRadius: '2px',
          }"
        />
        <component :is="item.icon" :size="18" class="shrink-0" />
        <span
          v-if="isExpanded"
          class="text-sm truncate"
          :style="{ fontWeight: isActive(item.id) ? '500' : '400' }"
        >{{ item.label }}</span>
      </button>
    </div>

    <!-- Expanded content: search + sub-nav -->
    <template v-if="isExpanded">
      <!-- Divider -->
      <div :style="{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '8px 12px' }" />

      <!-- Search -->
      <div class="px-3 pb-2">
        <input
          ref="searchInput"
          v-model="searchQuery"
          data-testid="sidebar-search"
          type="text"
          :placeholder="`Filter...`"
          aria-label="Filter navigation items"
          class="w-full border-none outline-none"
          :style="{
            padding: '7px 10px',
            backgroundColor: 'var(--color-surface-container-high)',
            border: '1px solid var(--color-stroke-subtle)',
            borderRadius: '8px',
            color: 'var(--color-on-surface)',
            fontSize: '12px',
          }"
        />
      </div>

      <!-- Sub-nav content (scrollable) -->
      <div class="flex flex-col overflow-y-auto flex-1 px-2 pb-3">
        <!-- Dashboard section: dynamic favorites + recents -->
        <template v-if="expandedSection === 'dashboards'">
          <!-- Favorites -->
          <div role="group" aria-labelledby="sidebar-favorites-label">
            <div
              id="sidebar-favorites-label"
              :style="{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-outline)',
                padding: '6px 10px 4px',
              }"
            >Favorites</div>

            <template v-if="filteredFavorites.length > 0">
              <button
                v-for="(fav, idx) in filteredFavorites"
                :key="typeof fav === 'object' ? fav.id : fav"
                :data-testid="`sidebar-fav-${typeof fav === 'object' ? fav.id : fav}`"
                class="sidebar-subnav-item"
                :class="{ highlighted: highlightedIndex === idx }"
                @click="handleSubNavNavigate(`/app/dashboards/${typeof fav === 'object' ? fav.id : fav}`)"
              >
                <Star :size="14" fill="currentColor" :style="{ color: 'var(--color-primary)', flexShrink: 0 }" />
                <span class="flex-1 truncate">{{ typeof fav === 'object' ? fav.title : fav }}</span>
              </button>
            </template>
            <div v-else-if="!searchQuery.trim()" data-testid="sidebar-empty-favorites" class="sidebar-empty-hint">
              <Star :size="18" :style="{ opacity: 0.3, color: 'var(--color-outline)' }" />
              <span>Star dashboards to pin them here</span>
            </div>
          </div>

          <!-- Divider -->
          <div :style="{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }" />

          <!-- Recents -->
          <div role="group" aria-labelledby="sidebar-recents-label">
            <div
              id="sidebar-recents-label"
              :style="{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-outline)',
                padding: '6px 10px 4px',
              }"
            >Recents</div>

            <template v-if="filteredRecents.length > 0">
              <button
                v-for="(recent, rIdx) in filteredRecents"
                :key="recent.id"
                :data-testid="`sidebar-recent-${recent.id}`"
                class="sidebar-subnav-item"
                :class="{ highlighted: highlightedIndex === filteredFavorites.length + rIdx }"
                @click="handleSubNavNavigate(`/app/dashboards/${recent.id}`)"
              >
                <Clock :size="14" :style="{ color: 'var(--color-outline)', flexShrink: 0 }" />
                <span class="flex-1 truncate">{{ recent.title }}</span>
                <span :style="{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-outline)', flexShrink: 0 }">
                  {{ formatTimeAgo(recent.visitedAt) }}
                </span>
              </button>
            </template>
            <div v-else-if="!searchQuery.trim()" data-testid="sidebar-empty-recents" class="sidebar-empty-hint">
              <Clock :size="18" :style="{ opacity: 0.3, color: 'var(--color-outline)' }" />
              <span>Recently visited dashboards appear here</span>
            </div>
          </div>

          <!-- Divider -->
          <div :style="{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }" />

          <!-- All Dashboards link -->
          <button
            data-testid="sidebar-nav-all-dashboards"
            class="sidebar-subnav-item"
            :class="{ highlighted: highlightedIndex === filteredFavorites.length + filteredRecents.length }"
            :aria-current="route.path === '/app/dashboards' ? 'page' : undefined"
            @click="handleSubNavNavigate('/app/dashboards')"
          >
            <span class="flex-1">All Dashboards</span>
            <ArrowRight :size="14" :style="{ color: 'var(--color-outline)' }" />
          </button>

          <!-- No search results -->
          <div v-if="searchQuery.trim() && !hasAnyResults" data-testid="sidebar-no-results" class="sidebar-empty-hint">
            <span>No matches</span>
          </div>
        </template>

        <!-- Non-dashboard sections: favorites + static sub-nav -->
        <template v-else>
          <!-- Section favorites -->
          <template v-if="sectionTypeMap[expandedSection!]">
            <div v-if="filteredSectionFavorites.length > 0" role="group" aria-labelledby="sidebar-section-favorites-label">
              <div
                id="sidebar-section-favorites-label"
                :style="{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-outline)',
                  padding: '6px 10px 4px',
                }"
              >Favorites</div>
              <button
                v-for="(fav, idx) in filteredSectionFavorites"
                :key="fav.id"
                :data-testid="`sidebar-fav-${fav.id}`"
                class="sidebar-subnav-item"
                :class="{ highlighted: highlightedIndex === idx }"
                @click="handleSubNavNavigate(favoriteRoute(fav))"
              >
                <Star :size="14" fill="currentColor" :style="{ color: 'var(--color-primary)', flexShrink: 0 }" />
                <span class="flex-1 truncate">{{ fav.title }}</span>
              </button>
              <div :style="{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }" />
            </div>
          </template>

          <button
            v-for="(item, idx) in filteredSubNav"
            :key="item.id"
            :data-testid="`sidebar-subnav-${item.id}`"
            :aria-current="isSubNavActive(item) ? 'page' : undefined"
            class="sidebar-subnav-item"
            :class="{ highlighted: highlightedIndex === filteredSectionFavorites.length + idx }"
            :style="{
              fontWeight: isSubNavActive(item) ? '500' : '400',
              color: isSubNavActive(item) ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              backgroundColor: isSubNavActive(item) ? 'var(--color-primary-muted)' : 'transparent',
              borderLeft: isSubNavActive(item) ? '2px solid var(--color-primary)' : '2px solid transparent',
            }"
            @click="handleSubNavNavigate(item.path)"
          >{{ item.label }}</button>

          <!-- No search results -->
          <div v-if="searchQuery.trim() && !hasAnyResults" data-testid="sidebar-no-results" class="sidebar-empty-hint">
            <span>No matches</span>
          </div>
        </template>
      </div>
    </template>

    <!-- Spacer (collapsed mode) -->
    <div v-if="!isExpanded" class="flex-1" />

    <!-- AI Copilot toggle -->
    <div class="flex flex-col items-center shrink-0" :class="{ 'items-start px-2': isExpanded }">
      <button
        data-testid="sidebar-ai-toggle"
        class="relative flex items-center shrink-0 cursor-pointer border-none transition-all duration-150"
        :class="isExpanded ? 'gap-3 px-3 w-full rounded-lg' : 'justify-center rounded-lg'"
        :style="{
          width: isExpanded ? '100%' : '44px',
          height: '40px',
          margin: isExpanded ? '0' : '0 auto',
          borderRadius: '8px',
          backgroundColor: aiSidebarOpen ? 'var(--color-primary-muted)' : 'transparent',
          color: aiSidebarOpen ? 'var(--color-primary)' : 'var(--color-outline)',
        }"
        title="AI Copilot"
        @click="toggleAiSidebar"
      >
        <Sparkles :size="18" class="shrink-0" />
        <span v-if="isExpanded" class="text-sm" :style="{ fontWeight: aiSidebarOpen ? '500' : '400' }">Copilot</span>
        <!-- Active indicator dot -->
        <span
          v-if="!isExpanded && aiSidebarOpen"
          class="absolute"
          :style="{
            top: '6px',
            right: '6px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
          }"
        />
      </button>
    </div>

    <!-- Bottom: Settings + Avatar -->
    <div class="flex flex-col items-center gap-1 pb-3 shrink-0" :class="{ 'items-start px-2': isExpanded }">
      <!-- Settings divider -->
      <div
        :style="{
          width: isExpanded ? 'calc(100% - 20px)' : '28px',
          height: '1px',
          backgroundColor: 'var(--color-stroke-subtle)',
          margin: isExpanded ? '0 10px 4px' : '0 auto 4px',
        }"
      />

      <!-- Settings -->
      <button
        data-testid="sidebar-settings"
        class="relative flex items-center shrink-0 cursor-pointer border-none transition-all duration-150"
        :class="isExpanded ? 'gap-3 px-3 w-full rounded-lg' : 'justify-center rounded-lg'"
        :style="{
          width: isExpanded ? '100%' : '44px',
          height: '40px',
          margin: isExpanded ? '0' : '0 auto',
          borderRadius: '8px',
          backgroundColor: isActive('settings') ? 'var(--color-primary-muted)' : 'transparent',
          color: isActive('settings') ? 'var(--color-on-surface-variant)' : 'var(--color-outline)',
        }"
        @click="handleNavSelect('settings')"
      >
        <div
          v-if="isActive('settings')"
          data-testid="sidebar-accent-bar"
          class="absolute top-2 bottom-2"
          :style="{
            left: isExpanded ? '0px' : '-2px',
            width: '3px',
            backgroundColor: 'var(--color-primary)',
            borderRadius: '2px',
          }"
        />
        <Settings :size="18" class="shrink-0" />
        <span v-if="isExpanded" class="text-sm">Settings</span>
      </button>

      <!-- User avatar -->
      <button
        data-testid="sidebar-user-avatar"
        class="flex items-center shrink-0 cursor-pointer border-none mt-1"
        :class="isExpanded ? 'gap-3 px-3 w-full rounded-lg py-2' : 'justify-center'"
        :style="{
          width: isExpanded ? '100%' : '30px',
          height: isExpanded ? 'auto' : '30px',
          borderRadius: isExpanded ? '8px' : '50%',
          backgroundColor: isExpanded ? 'transparent' : 'var(--color-surface-container-high)',
          border: isExpanded ? 'none' : '1px solid var(--color-stroke-subtle)',
          color: 'var(--color-on-surface-variant)',
          fontSize: '11px',
          fontWeight: '600',
        }"
        @click="handleAvatarClick"
      >
        <div
          v-if="isExpanded"
          class="flex items-center justify-center shrink-0"
          :style="{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-surface-container-high)',
            border: '1px solid var(--color-stroke-subtle)',
            fontSize: '11px',
            fontWeight: '600',
          }"
        >{{ userInitials }}</div>
        <template v-if="isExpanded">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium truncate" :style="{ color: 'var(--color-on-surface)' }">
              {{ user?.name || user?.email }}
            </div>
          </div>
        </template>
        <template v-else>{{ userInitials }}</template>
      </button>
    </div>

    <!-- User menu -->
    <SidebarUserMenu
      :is-open="userMenuOpen"
      @close="closeUserMenu"
    />

    <!-- Org switcher popup -->
    <div
      v-if="orgMenuOpen"
      ref="orgMenuRef"
      data-testid="org-switcher-popup"
      class="fixed z-[60] overflow-hidden animate-fade-in"
      :style="{
        left: isExpanded ? '248px' : 'calc(52px + 4px)',
        top: 'calc(12px + 32px + 4px)',
        width: '220px',
        backgroundColor: 'var(--color-surface-bright)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid var(--color-stroke-subtle)',
      }"
    >
      <div
        class="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        :style="{ color: 'var(--color-outline)', fontSize: '10px', borderBottom: '1px solid var(--color-stroke-subtle)' }"
      >Organizations</div>
      <div class="py-1 max-h-[240px] overflow-y-auto">
        <button
          v-for="org in organizations"
          :key="org.id"
          :data-testid="`org-switcher-${org.id}`"
          class="flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer border-none bg-transparent transition-colors org-item"
          :style="{
            color: currentOrg?.id === org.id ? 'var(--color-primary)' : 'var(--color-on-surface)',
          }"
          @click="handleSelectOrg(org.id)"
        >
          <div
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
            :style="{
              backgroundColor: currentOrg?.id === org.id ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
              color: currentOrg?.id === org.id ? '#0C0D0F' : 'var(--color-on-surface-variant)',
            }"
          >{{ org.name.charAt(0).toUpperCase() }}</div>
          <span class="flex-1 truncate text-left">{{ org.name }}</span>
          <Check v-if="currentOrg?.id === org.id" :size="14" />
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.sidebar-subnav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  border: none;
  background-color: transparent;
  width: 100%;
  text-align: left;
  transition: background-color 120ms;
}

.sidebar-subnav-item:hover:not([aria-current="page"]),
.sidebar-subnav-item.highlighted:not([aria-current="page"]) {
  background-color: var(--color-surface-hover, #283038);
}

.sidebar-subnav-item.highlighted {
  box-shadow: 0 0 0 1px rgba(201, 150, 15, 0.55), 0 0 0 4px rgba(201, 150, 15, 0.16);
}

.sidebar-empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 10px;
  font-size: 12px;
  color: var(--color-outline);
  text-align: center;
}

.org-item:hover {
  background-color: var(--color-surface-hover, #283038);
}
</style>
