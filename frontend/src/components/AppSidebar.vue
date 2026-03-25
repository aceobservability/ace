<script setup lang="ts">
import { Activity, AlertTriangle, Check, ChevronDown, ChevronRight, LayoutGrid, PanelLeft, PanelLeftClose, Search, Settings, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useOrganization } from '../composables/useOrganization'
import { useSidebar } from '../composables/useSidebar'
import SidebarUserMenu from './SidebarUserMenu.vue'

const route = useRoute()
const router = useRouter()
const { isExpanded, sidebarWidth, expandedSections, currentRouteSection, toggleSidebar, toggleSection, expandSection } = useSidebar()
const { user } = useAuth()
const { organizations, currentOrg, selectOrganization } = useOrganization()

// ─── Local UI state ───
const userMenuOpen = ref(false)
const orgMenuOpen = ref(false)
const orgMenuRef = ref<HTMLDivElement | null>(null)
const hoveredNavId = ref<string | null>(null)

// ─── Nav items ───
interface NavItem {
  id: string
  icon: typeof Sparkles
  label: string
  colorVar: string
  route: string
}

const navItems: NavItem[] = [
  { id: 'home', icon: Sparkles, label: 'Home', colorVar: 'var(--color-primary)', route: '/app' },
  { id: 'dashboards', icon: LayoutGrid, label: 'Dashboards', colorVar: 'var(--color-on-surface)', route: '/app/dashboards' },
  { id: 'services', icon: Activity, label: 'Services', colorVar: 'var(--color-secondary)', route: '/app/services' },
  { id: 'alerts', icon: AlertTriangle, label: 'Alerts', colorVar: 'var(--color-error)', route: '/app/alerts' },
  { id: 'explore', icon: Search, label: 'Explore', colorVar: 'var(--color-tertiary)', route: '/app/explore/metrics' },
]

// ─── Section configs (sub-nav) — alerts excluded (dead routes) ───
const sectionConfigs: Record<string, { label: string; subNav: Array<{ id: string; label: string; path: string }> }> = {
  dashboards: { label: 'Dashboards', subNav: [{ id: 'all-dashboards', label: 'All Dashboards', path: '/app/dashboards' }] },
  services: { label: 'Services', subNav: [{ id: 'all-services', label: 'All Services', path: '/app/services' }] },
  explore: { label: 'Explore', subNav: [
    { id: 'metrics', label: 'Metrics', path: '/app/explore/metrics' },
    { id: 'logs', label: 'Logs', path: '/app/explore/logs' },
    { id: 'traces', label: 'Traces', path: '/app/explore/traces' },
  ]},
  settings: { label: 'Settings', subNav: [
    { id: 'general', label: 'General', path: '/app/settings/general' },
    { id: 'members', label: 'Members', path: '/app/settings/members' },
    { id: 'groups', label: 'Groups & Permissions', path: '/app/settings/groups' },
    { id: 'datasources', label: 'Data Sources', path: '/app/settings/datasources' },
    { id: 'ai', label: 'AI Configuration', path: '/app/settings/ai' },
    { id: 'sso', label: 'SSO / Auth', path: '/app/settings/sso' },
    { id: 'audit-log', label: 'Audit Log', path: '/app/audit-log' },
  ]},
}

// ─── Computed helpers ───
const orgInitial = computed(() => {
  if (!currentOrg.value?.name) return '?'
  return currentOrg.value.name.charAt(0).toUpperCase()
})

const userInitials = computed(() => {
  if (!user.value) return '?'
  if (user.value.name) {
    return user.value.name
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return user.value.email.charAt(0).toUpperCase()
})

function hasSubNav(itemId: string): boolean {
  return itemId in sectionConfigs
}

function isSectionOpen(sectionId: string): boolean {
  return isExpanded.value && expandedSections.value.has(sectionId)
}

function isActive(itemId: string): boolean {
  return currentRouteSection.value === itemId
}

function isSubNavActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`)
}

// ─── Click handlers ───
function handleNavClick(item: NavItem) {
  if (!hasSubNav(item.id)) {
    // No sub-nav (home, alerts): just navigate
    router.push(item.route)
    return
  }
  if (currentRouteSection.value === item.id) {
    // Already on this section: toggle accordion
    toggleSection(item.id)
  } else {
    // Navigate + expand
    router.push(item.route)
    expandSection(item.id)
  }
}

function handleSettingsClick() {
  if (currentRouteSection.value === 'settings') {
    toggleSection('settings')
  } else {
    router.push('/app/settings/general')
    expandSection('settings')
  }
}

function handleSubNavClick(path: string) {
  router.push(path)
}

function handleOrgClick() {
  orgMenuOpen.value = !orgMenuOpen.value
  userMenuOpen.value = false
}

function handleSelectOrg(orgId: string) {
  selectOrganization(orgId)
  orgMenuOpen.value = false
}

function handleAvatarClick() {
  userMenuOpen.value = !userMenuOpen.value
  orgMenuOpen.value = false
}

function closeUserMenu() {
  userMenuOpen.value = false
}

// ─── Click-outside for org menu ───
function handleOrgMenuClickOutside(event: MouseEvent) {
  if (orgMenuRef.value && !orgMenuRef.value.contains(event.target as Node)) {
    orgMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOrgMenuClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOrgMenuClickOutside)
})
</script>

<template>
  <nav aria-label="Main navigation">
    <!-- Single sidebar container -->
    <div
      data-testid="sidebar-container"
      class="fixed left-0 top-0 bottom-0 z-50 flex flex-col"
      :style="{
        width: sidebarWidth,
        transition: 'width var(--sidebar-transition)',
        backgroundColor: 'var(--color-surface)',
      }"
    >
      <!-- ═══ PINNED TOP (shrink-0) ═══ -->
      <div class="shrink-0 flex flex-col items-center px-2 pt-3 gap-1">
        <!-- Logo -->
        <div
          data-testid="sidebar-logo"
          class="flex items-center gap-2 w-full px-1 mb-2"
        >
          <div
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
            class="sidebar-label"
            :style="{
              fontFamily: 'var(--font-display)',
              fontWeight: '600',
              fontSize: '18px',
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
              opacity: isExpanded ? 1 : 0,
              transition: isExpanded ? 'opacity 100ms ease 80ms' : 'none',
            }"
          >Ace</span>
        </div>

        <!-- Org selector -->
        <button
          data-testid="sidebar-org-selector"
          class="flex items-center gap-2 w-full cursor-pointer mb-1 transition-colors duration-150"
          :style="{
            padding: '4px',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            border: 'none',
          }"
          :title="currentOrg?.name || 'Select organization'"
          @click="handleOrgClick"
        >
          <div
            class="flex items-center justify-center shrink-0"
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
          >{{ orgInitial }}</div>
          <span
            v-if="isExpanded"
            class="sidebar-label truncate"
            :style="{
              fontSize: '13px',
              fontWeight: '500',
              color: 'var(--color-on-surface-variant)',
              opacity: isExpanded ? 1 : 0,
              transition: isExpanded ? 'opacity 100ms ease 80ms' : 'none',
            }"
          >{{ currentOrg?.name || 'Select org' }}</span>
        </button>
      </div>

      <!-- ═══ SCROLLABLE MIDDLE (flex-1 overflow-y-auto) ═══ -->
      <div class="flex-1 overflow-y-auto flex flex-col px-2 py-1 gap-0.5">
        <!-- Nav items -->
        <template v-for="item in navItems" :key="item.id">
          <button
            :id="`sidebar-btn-${item.id}`"
            :data-testid="`sidebar-nav-${item.id}`"
            class="relative flex items-center gap-2 w-full shrink-0 cursor-pointer border-none transition-colors duration-150"
            :class="{ 'sidebar-nav-hover': hoveredNavId === item.id && !isActive(item.id) }"
            :style="{
              padding: '8px',
              borderRadius: '8px',
              backgroundColor: isActive(item.id) ? 'var(--color-primary-muted)' : 'transparent',
              color: isActive(item.id) ? item.colorVar : 'var(--color-outline)',
            }"
            :aria-expanded="hasSubNav(item.id) ? isSectionOpen(item.id).toString() : undefined"
            :title="!isExpanded ? item.label : undefined"
            @click="handleNavClick(item)"
            @mouseenter="hoveredNavId = item.id"
            @mouseleave="hoveredNavId = null"
          >
            <!-- Accent bar -->
            <div
              v-if="isActive(item.id)"
              class="sidebar-accent-bar absolute top-2 bottom-2"
              :style="{
                left: '-4px',
                width: '3px',
                backgroundColor: 'var(--color-primary)',
                borderRadius: '2px',
              }"
            />
            <div class="flex items-center justify-center shrink-0" :style="{ width: '24px', height: '24px' }">
              <component :is="item.icon" :size="18" />
            </div>
            <span
              v-if="isExpanded"
              class="sidebar-label flex-1 text-left"
              :style="{
                fontSize: '16px',
                fontWeight: '500',
                opacity: isExpanded ? 1 : 0,
                transition: isExpanded ? 'opacity 100ms ease 80ms' : 'none',
              }"
            >{{ item.label }}</span>
            <component
              :is="isSectionOpen(item.id) ? ChevronDown : ChevronRight"
              v-if="isExpanded && hasSubNav(item.id)"
              :size="14"
              :style="{ color: 'var(--color-outline)', opacity: isExpanded ? 1 : 0, transition: isExpanded ? 'opacity 100ms ease 80ms' : 'none' }"
            />
          </button>

          <!-- Accordion sub-nav (only rendered when sidebar is expanded) -->
          <div
            v-if="isExpanded && hasSubNav(item.id)"
            :role="isExpanded ? 'group' : undefined"
            :aria-labelledby="isExpanded ? `sidebar-btn-${item.id}` : undefined"
            :style="{
              display: 'grid',
              gridTemplateRows: isSectionOpen(item.id) ? '1fr' : '0fr',
              transition: 'grid-template-rows var(--sidebar-transition)',
            }"
          >
            <div style="overflow: hidden">
              <div
                v-for="sub in sectionConfigs[item.id]?.subNav"
                :key="sub.id"
                :data-testid="`sidebar-subnav-${sub.id}`"
                class="cursor-pointer transition-colors duration-150"
                :style="{
                  padding: '6px 8px 6px 40px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: isSubNavActive(sub.path) ? '500' : '400',
                  color: isSubNavActive(sub.path) ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                  backgroundColor: isSubNavActive(sub.path) ? 'var(--color-primary-muted)' : 'transparent',
                }"
                @click="handleSubNavClick(sub.path)"
              >{{ sub.label }}</div>
            </div>
          </div>
        </template>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- Settings -->
        <button
          id="sidebar-btn-settings"
          data-testid="sidebar-settings"
          class="relative flex items-center gap-2 w-full shrink-0 cursor-pointer border-none transition-colors duration-150"
          :class="{ 'sidebar-nav-hover': hoveredNavId === 'settings' && !isActive('settings') }"
          :style="{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: isActive('settings') ? 'var(--color-primary-muted)' : 'transparent',
            color: isActive('settings') ? 'var(--color-on-surface-variant)' : 'var(--color-outline)',
          }"
          :aria-expanded="isSectionOpen('settings').toString()"
          :title="!isExpanded ? 'Settings' : undefined"
          @click="handleSettingsClick"
          @mouseenter="hoveredNavId = 'settings'"
          @mouseleave="hoveredNavId = null"
        >
          <div
            v-if="isActive('settings')"
            class="sidebar-accent-bar absolute top-2 bottom-2"
            :style="{
              left: '-4px',
              width: '3px',
              backgroundColor: 'var(--color-primary)',
              borderRadius: '2px',
            }"
          />
          <div class="flex items-center justify-center shrink-0" :style="{ width: '24px', height: '24px' }">
            <Settings :size="18" />
          </div>
          <span
            v-if="isExpanded"
            class="sidebar-label flex-1 text-left"
            :style="{
              fontSize: '16px',
              fontWeight: '500',
              opacity: isExpanded ? 1 : 0,
              transition: isExpanded ? 'opacity 100ms ease 80ms' : 'none',
            }"
          >Settings</span>
          <component
            :is="isSectionOpen('settings') ? ChevronDown : ChevronRight"
            v-if="isExpanded"
            :size="14"
            :style="{ color: 'var(--color-outline)', opacity: isExpanded ? 1 : 0, transition: isExpanded ? 'opacity 100ms ease 80ms' : 'none' }"
          />
        </button>

        <!-- Settings accordion sub-nav (only rendered when sidebar is expanded) -->
        <div
          v-if="isExpanded"
          role="group"
          :aria-labelledby="isExpanded ? 'sidebar-btn-settings' : undefined"
          :style="{
            display: 'grid',
            gridTemplateRows: isSectionOpen('settings') ? '1fr' : '0fr',
            transition: 'grid-template-rows var(--sidebar-transition)',
          }"
        >
          <div style="overflow: hidden">
            <div
              v-for="sub in sectionConfigs.settings.subNav"
              :key="sub.id"
              :data-testid="`sidebar-subnav-${sub.id}`"
              class="cursor-pointer transition-colors duration-150"
              :style="{
                padding: '6px 8px 6px 40px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: isSubNavActive(sub.path) ? '500' : '400',
                color: isSubNavActive(sub.path) ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                backgroundColor: isSubNavActive(sub.path) ? 'var(--color-primary-muted)' : 'transparent',
              }"
              @click="handleSubNavClick(sub.path)"
            >{{ sub.label }}</div>
          </div>
        </div>
      </div>

      <!-- ═══ PINNED BOTTOM (shrink-0) ═══ -->
      <div class="shrink-0 flex flex-col items-center px-2 pb-3 gap-1">
        <!-- Toggle button -->
        <button
          data-testid="sidebar-toggle"
          class="flex items-center gap-2 w-full cursor-pointer border-none transition-colors duration-150"
          :style="{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            color: 'var(--color-outline)',
          }"
          :aria-label="isExpanded ? 'Collapse sidebar' : 'Expand sidebar'"
          @click="toggleSidebar"
        >
          <div class="flex items-center justify-center shrink-0" :style="{ width: '24px', height: '24px' }">
            <PanelLeftClose v-if="isExpanded" :size="18" />
            <PanelLeft v-else :size="18" />
          </div>
          <span
            v-if="isExpanded"
            class="sidebar-label"
            :style="{
              fontSize: '13px',
              fontWeight: '400',
              opacity: isExpanded ? 1 : 0,
              transition: isExpanded ? 'opacity 100ms ease 80ms' : 'none',
            }"
          >Collapse</span>
        </button>

        <!-- User avatar -->
        <button
          data-testid="sidebar-avatar"
          class="flex items-center justify-center shrink-0 cursor-pointer border-none"
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
          @click="handleAvatarClick"
        >{{ userInitials }}</button>
      </div>
    </div>

    <!-- Org switcher popup -->
    <div
      v-if="orgMenuOpen"
      ref="orgMenuRef"
      data-testid="org-switcher-popup"
      class="fixed z-[60] overflow-hidden animate-fade-in"
      :style="{
        left: `calc(${sidebarWidth} + 4px)`,
        top: 'calc(12px + 32px + 4px)',
        width: '220px',
        backgroundColor: 'var(--color-surface-bright)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid var(--color-outline-variant)',
      }"
    >
      <div
        class="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        :style="{ color: 'var(--color-outline)', fontSize: '10px', borderBottom: '1px solid var(--color-outline-variant)' }"
      >Organizations</div>
      <div class="py-1 max-h-[240px] overflow-y-auto">
        <button
          v-for="org in organizations"
          :key="org.id"
          :data-testid="`org-switcher-${org.id}`"
          class="flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer border-none bg-transparent transition-colors"
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

    <!-- User menu -->
    <SidebarUserMenu
      :is-open="userMenuOpen"
      @close="closeUserMenu"
    />

    <!-- Aria-live region for state announcements -->
    <div
      data-testid="sidebar-aria-live"
      aria-live="polite"
      class="sr-only"
      style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap;"
    >
      {{ isExpanded ? 'Sidebar expanded' : 'Sidebar collapsed' }}
    </div>
  </nav>
</template>

<style scoped>
.sidebar-nav-hover {
  background-color: var(--overlay-hover) !important;
}
</style>
