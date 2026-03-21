<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, Settings, Activity, Compass, LogOut, ChevronDown, Shield, Moon, Sun, Monitor, Bell, Pin, PinOff } from 'lucide-vue-next'
import OrganizationDropdown from './OrganizationDropdown.vue'
import CreateOrganizationModal from './CreateOrganizationModal.vue'
import { useOrganization } from '../composables/useOrganization'
import { useAuth } from '../composables/useAuth'
import { useTheme } from '../composables/useTheme'

const route = useRoute()
const router = useRouter()
const { fetchOrganizations, clearOrganizations, currentOrg } = useOrganization()
const { logout, user } = useAuth()
const { mode, cycle } = useTheme()

const showCreateOrgModal = ref(false)

// --- Pin / expand state ---
const isPinned = ref(localStorage.getItem('sidebar-pinned') === 'true')

function togglePin() {
  isPinned.value = !isPinned.value
  localStorage.setItem('sidebar-pinned', String(isPinned.value))
}

// Hover expand logic with collapse delay
let collapseTimeout: ReturnType<typeof setTimeout> | null = null
const isHovered = ref(false)

function handleMouseEnter() {
  if (collapseTimeout) {
    clearTimeout(collapseTimeout)
    collapseTimeout = null
  }
  isHovered.value = true
}

function handleMouseLeave() {
  if (!isPinned.value) {
    collapseTimeout = setTimeout(() => {
      isHovered.value = false
    }, 200)
  }
}

onUnmounted(() => {
  if (collapseTimeout) clearTimeout(collapseTimeout)
})

const isOpen = computed(() => isPinned.value || isHovered.value)
const COLLAPSED_W = 48
const EXPANDED_W = 220
const sidebarWidth = computed(() => isOpen.value ? EXPANDED_W : COLLAPSED_W)

// --- Navigation ---
interface NavItem {
  id: string
  icon: typeof LayoutDashboard
  label: string
  path: string
  children?: NavChild[]
}
interface NavChild {
  label: string
  path: string
}

const navItems: NavItem[] = [
  { id: 'dashboards', icon: LayoutDashboard, label: 'Dashboards', path: '/app/dashboards' },
  { id: 'alerts', icon: Bell, label: 'Alerts', path: '/app/alerts' },
  {
    id: 'explore',
    icon: Compass,
    label: 'Explore',
    path: '/app/explore/metrics',
    children: [
      { label: 'Metrics', path: '/app/explore/metrics' },
      { label: 'Logs', path: '/app/explore/logs' },
      { label: 'Traces', path: '/app/explore/traces' },
    ],
  },
]

function normalizeAppPath(path: string): string {
  return path.startsWith('/app/') ? path.slice(4) : path
}

const openNavGroups = ref<Record<string, boolean>>({
  explore: normalizeAppPath(route.path).startsWith('/explore'),
})

const settingsPath = computed(() => {
  if (currentOrg.value) {
    return `/app/settings/org/${currentOrg.value.id}/general`
  }
  return null
})

const privacySettingsPath = '/app/settings/privacy'

watch(() => route.path, (path) => {
  if (normalizeAppPath(path).startsWith('/explore')) {
    openNavGroups.value.explore = true
  }
})

function isRouteMatch(path: string): boolean {
  const currentPath = normalizeAppPath(route.path)
  const targetPath = normalizeAppPath(path)
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
}

function isActive(item: NavItem): boolean {
  if (item.children) return item.children.some(child => isRouteMatch(child.path))
  return isRouteMatch(item.path)
}

function isNavGroupOpen(id: string): boolean {
  return !!openNavGroups.value[id]
}

function toggleNavGroup(id: string) {
  openNavGroups.value[id] = !openNavGroups.value[id]
}

function navigate(path: string) {
  router.push(path)
}

function handleNavItemClick(item: NavItem) {
  if (item.children) openNavGroups.value[item.id] = true
  navigate(item.path)
}

function handleOrgCreated() {
  showCreateOrgModal.value = false
  fetchOrganizations()
}

async function handleLogout() {
  await logout()
  clearOrganizations()
  router.push('/login')
}

defineExpose({ isPinned, sidebarWidth })
</script>

<template>
  <!-- Single sidebar that transitions width -->
  <aside
    data-testid="sidebar"
    class="fixed left-0 top-0 bottom-0 z-50 overflow-hidden border-r border-[#12122a] transition-[width] duration-200 ease-out"
    :style="{ width: sidebarWidth + 'px' }"
    style="background: linear-gradient(180deg, #0a0a18 0%, #060610 100%)"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Inner content always rendered at expanded width; outer overflow clips when collapsed -->
    <div class="flex flex-col h-full" :style="{ width: EXPANDED_W + 'px' }">

      <!-- Header: Logo + App name + Pin -->
      <div class="flex h-12 items-center px-[14px] shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <img
            v-if="currentOrg?.branding?.logo_data_uri"
            :src="currentOrg.branding.logo_data_uri"
            class="w-5 h-5 shrink-0 rounded object-contain"
            alt="Logo"
          />
          <Activity v-else class="text-accent shrink-0" :size="20" />
          <span
            class="text-sm font-bold tracking-wide uppercase font-mono text-[#c8cad4] whitespace-nowrap transition-opacity duration-200"
            :class="isOpen ? 'opacity-100' : 'opacity-0'"
          >{{ currentOrg?.branding?.app_title || 'Ace' }}</span>
        </div>
        <button
          class="ml-auto shrink-0 flex items-center justify-center h-6 w-6 rounded-sm cursor-pointer border-none transition-all duration-200"
          :class="[
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
            isPinned ? 'text-accent hover:text-accent/70' : 'text-[#555a6e] hover:text-[#c8cad4]'
          ]"
          :style="isPinned ? '' : 'background: transparent'"
          :title="isPinned ? 'Unpin sidebar' : 'Pin sidebar'"
          data-testid="sidebar-pin-btn"
          @click="togglePin"
        >
          <PinOff v-if="isPinned" :size="14" />
          <Pin v-else :size="14" />
        </button>
      </div>

      <!-- Organization Dropdown -->
      <div
        class="transition-opacity duration-200"
        :class="isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 overflow-hidden'"
      >
        <OrganizationDropdown :expanded="true" :sidebar-width="sidebarWidth" @createOrg="showCreateOrgModal = true" />
      </div>

      <!-- Navigation -->
      <nav class="flex flex-1 flex-col py-2 overflow-y-auto overflow-x-hidden">
        <div class="flex flex-col gap-0.5">
          <div v-for="item in navItems" :key="item.id" class="flex flex-col">
            <button
              class="group relative flex h-9 items-center gap-3 px-[14px] rounded-sm transition-colors duration-150 cursor-pointer border-none"
              :class="[
                isActive(item)
                  ? 'text-accent before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-accent'
                  : 'text-[#555a6e] hover:text-[#c8cad4] hover:bg-[#14142a]'
              ]"
              :style="isActive(item) ? 'background: radial-gradient(circle at 24px center, rgba(52,211,153,0.10) 0%, transparent 70%)' : ''"
              :data-testid="`nav-${item.id}`"
              @click="handleNavItemClick(item)"
            >
              <component :is="item.icon" :size="20" class="shrink-0" />
              <span
                class="text-[0.8125rem] font-medium whitespace-nowrap transition-opacity duration-200"
                :class="isOpen ? 'opacity-100' : 'opacity-0'"
              >{{ item.label }}</span>
              <span
                v-if="item.children && isOpen"
                class="ml-auto inline-flex items-center justify-center w-5 h-5 text-[#555a6e] rounded hover:text-[#c8cad4]"
                :data-testid="`nav-${item.id}-toggle`"
                @click.stop="toggleNavGroup(item.id)"
              >
                <ChevronDown
                  :size="14"
                  :class="['transition-transform duration-200', isNavGroupOpen(item.id) ? 'rotate-180' : '']"
                />
              </span>
              <!-- Tooltip (only when collapsed) -->
              <span
                v-if="!isOpen"
                class="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 bg-[#14142a] border border-[#1a1a30] rounded text-xs font-medium text-[#c8cad4] whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] transition-opacity duration-100 group-hover:opacity-100 group-hover:visible shadow-lg"
              >{{ item.label }}</span>
            </button>

            <!-- Submenu children -->
            <div
              v-if="item.children && isNavGroupOpen(item.id) && isOpen"
              class="flex flex-col gap-px mt-0.5 mb-1 mr-1"
              style="margin-left: 46px"
            >
              <button
                v-for="child in item.children"
                :key="child.path"
                class="flex h-7 items-center px-2.5 rounded-sm cursor-pointer transition-colors duration-150 border-none"
                :class="[
                  isRouteMatch(child.path)
                    ? 'text-accent font-medium'
                    : 'text-[#555a6e] hover:text-[#c8cad4] hover:bg-[#14142a]'
                ]"
                :data-testid="`nav-${item.id}-${child.label.toLowerCase()}`"
                @click="navigate(child.path)"
              >
                <span class="text-xs">{{ child.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Separator -->
        <div class="mx-3 my-2 border-t border-[#1a1a30]"></div>

        <!-- Bottom section -->
        <div class="mt-auto flex flex-col gap-0.5">
          <button
            v-if="settingsPath"
            class="group relative flex h-9 items-center gap-3 px-[14px] rounded-sm transition-colors duration-150 cursor-pointer border-none"
            :class="[
              isRouteMatch('/settings')
                ? 'text-accent before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-accent'
                : 'text-[#555a6e] hover:text-[#c8cad4] hover:bg-[#14142a]'
            ]"
            data-testid="nav-settings"
            @click="navigate(settingsPath)"
          >
            <Settings :size="20" class="shrink-0" />
            <span
              class="text-[0.8125rem] font-medium whitespace-nowrap transition-opacity duration-200"
              :class="isOpen ? 'opacity-100' : 'opacity-0'"
            >Settings</span>
            <span
              v-if="!isOpen"
              class="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 bg-[#14142a] border border-[#1a1a30] rounded text-xs font-medium text-[#c8cad4] whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] transition-opacity duration-100 group-hover:opacity-100 group-hover:visible shadow-lg"
            >Settings</span>
          </button>

          <button
            class="group relative flex h-9 items-center gap-3 px-[14px] rounded-sm transition-colors duration-150 cursor-pointer border-none"
            :class="[
              isRouteMatch(privacySettingsPath)
                ? 'text-accent before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-accent'
                : 'text-[#555a6e] hover:text-[#c8cad4] hover:bg-[#14142a]'
            ]"
            data-testid="nav-privacy"
            @click="navigate(privacySettingsPath)"
          >
            <Shield :size="20" class="shrink-0" />
            <span
              class="text-[0.8125rem] font-medium whitespace-nowrap transition-opacity duration-200"
              :class="isOpen ? 'opacity-100' : 'opacity-0'"
            >Privacy</span>
            <span
              v-if="!isOpen"
              class="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 bg-[#14142a] border border-[#1a1a30] rounded text-xs font-medium text-[#c8cad4] whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] transition-opacity duration-100 group-hover:opacity-100 group-hover:visible shadow-lg"
            >Privacy</span>
          </button>

          <button
            class="group relative flex h-9 items-center gap-3 px-[14px] rounded-sm text-[#555a6e] hover:text-[#c8cad4] hover:bg-[#14142a] transition-colors duration-150 cursor-pointer border-none"
            data-testid="nav-theme"
            @click="cycle()"
            :title="`Theme: ${mode}`"
          >
            <Moon v-if="mode === 'dark'" :size="20" class="shrink-0" />
            <Sun v-if="mode === 'light'" :size="20" class="shrink-0" />
            <Monitor v-if="mode === 'system'" :size="20" class="shrink-0" />
            <span
              class="text-[0.8125rem] font-medium whitespace-nowrap capitalize transition-opacity duration-200"
              :class="isOpen ? 'opacity-100' : 'opacity-0'"
            >{{ mode }}</span>
            <span
              v-if="!isOpen"
              class="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 bg-[#14142a] border border-[#1a1a30] rounded text-xs font-medium text-[#c8cad4] whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] transition-opacity duration-100 group-hover:opacity-100 group-hover:visible shadow-lg"
            >Theme: {{ mode }}</span>
          </button>

          <button
            class="group relative flex h-9 items-center gap-3 px-[14px] rounded-sm text-[#555a6e] hover:text-rose-500 hover:bg-rose-500/10 transition-colors duration-150 cursor-pointer border-none mb-2"
            data-testid="nav-logout"
            @click="handleLogout"
          >
            <LogOut :size="20" class="shrink-0" />
            <span
              class="text-[0.8125rem] font-medium whitespace-nowrap transition-opacity duration-200"
              :class="isOpen ? 'opacity-100' : 'opacity-0'"
            >Log out</span>
            <span
              v-if="!isOpen"
              class="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 bg-[#14142a] border border-[#1a1a30] rounded text-xs font-medium text-[#c8cad4] whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] transition-opacity duration-100 group-hover:opacity-100 group-hover:visible shadow-lg"
            >Log out</span>
          </button>
        </div>
      </nav>

      <!-- User info (visible when expanded) -->
      <div
        class="shrink-0 border-t border-[#1a1a30] px-[14px] py-2.5 transition-opacity duration-200"
        :class="isOpen ? 'opacity-100' : 'opacity-0'"
      >
        <span v-if="user" class="block text-[0.6875rem] font-mono text-[#555a6e] truncate">{{ user.email }}</span>
      </div>
    </div>

    <CreateOrganizationModal
      v-if="showCreateOrgModal"
      @close="showCreateOrgModal = false"
      @created="handleOrgCreated"
    />
  </aside>
</template>
