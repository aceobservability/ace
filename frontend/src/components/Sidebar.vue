<script setup lang="ts">
import {
  BellRing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useOrganization } from '../composables/useOrganization'
import { useTheme } from '../composables/useTheme'
import CreateOrganizationModal from './CreateOrganizationModal.vue'
import OrganizationDropdown from './OrganizationDropdown.vue'

const route = useRoute()
const router = useRouter()
const { fetchOrganizations, clearOrganizations, currentOrg } = useOrganization()
const { logout, user } = useAuth()
const { mode, cycle } = useTheme()

const isExpanded = ref(typeof window !== 'undefined' ? window.innerWidth > 1100 : true)
const isHoverExpanded = ref(false)
const showCreateOrgModal = ref(false)

const isVisuallyExpanded = computed(() => {
  return isExpanded.value || isHoverExpanded.value
})

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
  { id: 'dashboards', icon: LayoutDashboard, label: 'Dashboards', path: '/dashboards' },
  { id: 'alerts', icon: BellRing, label: 'Alerts', path: '/alerts' },
  {
    id: 'explore',
    icon: Compass,
    label: 'Explore',
    path: '/explore/metrics',
    children: [
      { label: 'Metrics', path: '/explore/metrics' },
      { label: 'Logs', path: '/explore/logs' },
      { label: 'Traces', path: '/explore/traces' },
    ],
  },
  { id: 'datasources', icon: Database, label: 'Data Sources', path: '/datasources' },
]

const openNavGroups = ref<Record<string, boolean>>({
  explore: route.path.startsWith('/explore'),
})

// Settings path is dynamic based on current organization
const settingsPath = computed(() => {
  if (currentOrg.value) {
    return `/settings/org/${currentOrg.value.id}/general`
  }
  return null
})

const privacySettingsPath = '/settings/privacy'

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/explore')) {
      openNavGroups.value.explore = true
    }
  },
)

function isRouteMatch(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`)
}

function isActive(item: NavItem): boolean {
  if (item.children) {
    return item.children.some((child) => isRouteMatch(child.path))
  }
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
  if (item.children) {
    openNavGroups.value[item.id] = true
  }
  navigate(item.path)
}

function toggleSidebar() {
  isExpanded.value = !isExpanded.value
}

function handleSidebarMouseEnter() {
  if (!isExpanded.value) {
    isHoverExpanded.value = true
  }
}

function handleSidebarMouseLeave() {
  isHoverExpanded.value = false
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

defineExpose({ isExpanded })
</script>

<template>
  <aside
    :class="[
      'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800 bg-surface-sidebar transition-[width] duration-200',
      isVisuallyExpanded ? 'w-58' : 'w-16'
    ]"
    @mouseenter="handleSidebarMouseEnter"
    @mouseleave="handleSidebarMouseLeave"
  >
    <!-- Header -->
    <div
      :class="[
        'flex items-center border-b border-slate-800',
        isVisuallyExpanded
          ? 'h-16 justify-between px-3'
          : 'h-20 flex-col justify-center gap-2 px-0'
      ]"
    >
      <div class="flex items-center gap-2.5">
        <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-mono text-xs font-bold text-white">A</span>
        <span v-if="isVisuallyExpanded" class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">Ace</span>
      </div>
      <button
        :class="[
          'flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 transition hover:border-slate-600 hover:text-slate-200',
          !isVisuallyExpanded && 'mx-auto'
        ]"
        @click="toggleSidebar"
        :title="isExpanded ? 'Collapse' : 'Expand'"
      >
        <component :is="isExpanded ? ChevronLeft : ChevronRight" :size="16" />
      </button>
    </div>

    <OrganizationDropdown :expanded="isVisuallyExpanded" @createOrg="showCreateOrgModal = true" />

    <!-- Navigation -->
    <nav class="flex flex-1 flex-col justify-between py-3">
      <div class="flex flex-col gap-1">
        <div
          v-for="item in navItems"
          :key="item.id"
          class="flex flex-col"
        >
          <button
            :class="[
              'group/item relative mx-2 flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200',
              isActive(item) && 'border-l-2 border-l-emerald-400 border-t-transparent border-r-transparent border-b-transparent bg-emerald-600/10 text-slate-100',
              !isVisuallyExpanded && 'mx-auto w-11 justify-center px-0'
            ]"
            @click="handleNavItemClick(item)"
            :title="isVisuallyExpanded ? undefined : item.label"
          >
            <component :is="item.icon" :size="20" />
            <span v-if="isVisuallyExpanded" class="truncate">{{ item.label }}</span>
            <span
              v-if="!isVisuallyExpanded"
              class="pointer-events-none invisible absolute left-[calc(100%+12px)] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 opacity-0 transition group-hover/item:visible group-hover/item:opacity-100"
            >{{ item.label }}</span>
            <span
              v-if="isVisuallyExpanded && item.children"
              class="ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-300"
              @click.stop="toggleNavGroup(item.id)"
            >
              <ChevronDown
                :size="14"
                :class="['transition-transform duration-200', isNavGroupOpen(item.id) && 'rotate-180']"
              />
            </span>
          </button>

          <!-- Sub-nav items -->
          <div
            v-if="isVisuallyExpanded && item.children && isNavGroupOpen(item.id)"
            class="ml-9 mr-2 mb-1 flex flex-col gap-0.5"
          >
            <button
              v-for="child in item.children"
              :key="child.path"
              :class="[
                'flex h-8 items-center rounded-lg px-3 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300',
                isRouteMatch(child.path) && 'bg-emerald-600/10 text-emerald-400'
              ]"
              @click="navigate(child.path)"
            >
              {{ child.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom section -->
      <div class="flex flex-col gap-1 border-t border-slate-800 pt-2">
        <button
          v-if="settingsPath"
          :class="[
            'group/item relative mx-2 flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200',
            isRouteMatch('/settings') && 'border-l-2 border-l-emerald-400 border-t-transparent border-r-transparent border-b-transparent bg-emerald-600/10 text-slate-100',
            !isVisuallyExpanded && 'mx-auto w-11 justify-center px-0'
          ]"
          @click="navigate(settingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Settings'"
        >
          <Settings :size="20" />
          <span v-if="isVisuallyExpanded" class="truncate">Settings</span>
          <span
            v-if="!isVisuallyExpanded"
            class="pointer-events-none invisible absolute left-[calc(100%+12px)] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 opacity-0 transition group-hover/item:visible group-hover/item:opacity-100"
          >Settings</span>
        </button>
        <button
          :class="[
            'group/item relative mx-2 flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200',
            isRouteMatch(privacySettingsPath) && 'border-l-2 border-l-emerald-400 border-t-transparent border-r-transparent border-b-transparent bg-emerald-600/10 text-slate-100',
            !isVisuallyExpanded && 'mx-auto w-11 justify-center px-0'
          ]"
          @click="navigate(privacySettingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Privacy'"
        >
          <Shield :size="20" />
          <span v-if="isVisuallyExpanded" class="truncate">Privacy</span>
          <span
            v-if="!isVisuallyExpanded"
            class="pointer-events-none invisible absolute left-[calc(100%+12px)] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 opacity-0 transition group-hover/item:visible group-hover/item:opacity-100"
          >Privacy</span>
        </button>
        <button
          :class="[
            'group/item relative mx-2 flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200',
            !isVisuallyExpanded && 'mx-auto w-11 justify-center px-0'
          ]"
          @click="cycle()"
          :title="`Theme: ${mode} (click to cycle)`"
        >
          <Moon v-if="mode === 'dark'" :size="20" />
          <Sun v-if="mode === 'light'" :size="20" />
          <Monitor v-if="mode === 'system'" :size="20" />
          <span v-if="isVisuallyExpanded" class="truncate text-xs capitalize">{{ mode }}</span>
          <span
            v-if="!isVisuallyExpanded"
            class="pointer-events-none invisible absolute left-[calc(100%+12px)] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 opacity-0 transition group-hover/item:visible group-hover/item:opacity-100"
          >Theme: {{ mode }}</span>
        </button>
        <div v-if="isVisuallyExpanded && user" class="mx-3 mt-2 truncate rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-500">
          {{ user.email }}
        </div>
        <button
          :class="[
            'group/item relative mx-2 flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400',
            !isVisuallyExpanded && 'mx-auto w-11 justify-center px-0'
          ]"
          @click="handleLogout"
          :title="isVisuallyExpanded ? undefined : 'Log out'"
        >
          <LogOut :size="20" />
          <span v-if="isVisuallyExpanded" class="truncate">Log out</span>
          <span
            v-if="!isVisuallyExpanded"
            class="pointer-events-none invisible absolute left-[calc(100%+12px)] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 opacity-0 transition group-hover/item:visible group-hover/item:opacity-100"
          >Log out</span>
        </button>
      </div>
    </nav>

    <CreateOrganizationModal
      v-if="showCreateOrgModal"
      @close="showCreateOrgModal = false"
      @created="handleOrgCreated"
    />
  </aside>
</template>
