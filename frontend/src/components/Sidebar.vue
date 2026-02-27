<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, Settings, Activity, ChevronLeft, ChevronRight, Compass, LogOut, ChevronDown, Shield, Moon, Sun, Monitor, PanelLeftOpen } from 'lucide-vue-next'
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
  { id: 'dashboards', icon: LayoutDashboard, label: 'Dashboards', path: '/app/dashboards' },
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
  if (path.startsWith('/app/')) {
    return path.slice(4)
  }
  return path
}

const openNavGroups = ref<Record<string, boolean>>({
  explore: normalizeAppPath(route.path).startsWith('/explore'),
})

// Settings path is dynamic based on current organization
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
  if (item.children) {
    return item.children.some(child => isRouteMatch(child.path))
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
      isVisuallyExpanded ? 'w-[232px] max-[900px]:w-[210px]' : 'w-16',
      'fixed left-0 top-0 bottom-0 z-50 flex flex-col min-h-screen border-r border-slate-700 bg-slate-950 transition-[width] duration-200 ease-out'
    ]"
    @mouseenter="handleSidebarMouseEnter"
    @mouseleave="handleSidebarMouseLeave"
  >
    <!-- Header -->
    <div
      :class="[
        'h-14 flex items-center border-b border-slate-700 shrink-0',
        isVisuallyExpanded ? 'justify-between px-3' : 'justify-center px-2'
      ]"
    >
      <div
        :class="[
          'flex items-center gap-2.5',
          isVisuallyExpanded ? 'pl-0.5' : 'pl-0'
        ]"
      >
        <img
          v-if="currentOrg?.branding?.logo_data_uri"
          :src="currentOrg.branding.logo_data_uri"
          class="shrink-0 w-6 h-6 rounded-[10px] object-contain"
          alt="Logo"
        />
        <Activity
          v-else
          class="text-accent shrink-0 p-1 rounded-[10px] bg-accent-muted"
          :size="24"
        />
        <div v-if="isVisuallyExpanded" class="flex flex-col min-w-0">
          <span class="text-[0.95rem] font-bold tracking-wide uppercase font-mono text-slate-100">{{ currentOrg?.branding?.app_title || 'Ace' }}</span>
          <span v-if="!currentOrg?.branding?.app_title" class="text-[0.64rem] uppercase tracking-widest text-slate-500 whitespace-nowrap">developer cockpit</span>
        </div>
      </div>
      <button
        v-if="isVisuallyExpanded"
        class="flex items-center justify-center w-[28px] h-[28px] bg-slate-800/60 border border-slate-700 rounded-lg text-slate-400 cursor-pointer transition-all duration-200 hover:bg-slate-700 hover:text-slate-200 shrink-0"
        @click="toggleSidebar"
        title="Collapse sidebar"
      >
        <ChevronLeft :size="15" />
      </button>
    </div>

    <OrganizationDropdown :expanded="isVisuallyExpanded" @createOrg="showCreateOrgModal = true" />

    <!-- Navigation -->
    <nav class="flex-1 flex flex-col py-3 overflow-y-auto">
      <div class="flex flex-col gap-0.5">
        <div
          v-for="item in navItems"
          :key="item.id"
          class="flex flex-col"
        >
          <button
            :class="[
              'group relative h-[40px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] cursor-pointer transition-all duration-200',
              isVisuallyExpanded
                ? 'mx-2.5 px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
                : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200',
              isActive(item)
                ? 'bg-accent-muted border-accent-border text-accent'
                : 'text-slate-400'
            ]"
            @click="handleNavItemClick(item)"
            :title="isVisuallyExpanded ? undefined : item.label"
          >
            <component :is="item.icon" :size="19" />
            <span
              v-if="isVisuallyExpanded"
              class="text-[0.82rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis"
            >{{ item.label }}</span>
            <span
              v-else
              class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
            >{{ item.label }}</span>
            <span
              v-if="isVisuallyExpanded && item.children"
              class="ml-auto inline-flex items-center justify-center w-5 h-5 text-slate-500 rounded hover:bg-slate-700 hover:text-slate-200"
              @click.stop="toggleNavGroup(item.id)"
            >
              <ChevronDown
                :size="14"
                :class="[
                  'transition-transform duration-200',
                  isNavGroupOpen(item.id) ? 'rotate-180' : ''
                ]"
              />
            </span>
          </button>

          <div
            v-if="isVisuallyExpanded && item.children && isNavGroupOpen(item.id)"
            class="flex flex-col gap-px mt-0.5 mb-1 ml-[2.1rem] mr-2.5"
          >
            <button
              v-for="child in item.children"
              :key="child.path"
              :class="[
                'h-[30px] flex items-center px-3 border rounded-lg cursor-pointer transition-all duration-200',
                isRouteMatch(child.path)
                  ? 'border-accent-border bg-accent-muted text-accent font-medium'
                  : 'border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-200'
              ]"
              @click="navigate(child.path)"
            >
              <span class="text-[0.76rem] tracking-[0.01em]">{{ child.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom section -->
      <div class="mt-auto flex flex-col gap-0.5 pt-3 mx-2.5 border-t border-slate-800">
        <button
          v-if="settingsPath"
          :class="[
            'group relative h-[38px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] cursor-pointer transition-all duration-200',
            isVisuallyExpanded
              ? 'px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
              : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200',
            isRouteMatch('/settings')
              ? 'bg-accent-muted border-accent-border text-accent'
              : 'text-slate-400'
          ]"
          @click="navigate(settingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Settings'"
        >
          <Settings :size="18" />
          <span
            v-if="isVisuallyExpanded"
            class="text-[0.8rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis"
          >Settings</span>
          <span
            v-else
            class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
          >Settings</span>
        </button>
        <button
          :class="[
            'group relative h-[38px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] cursor-pointer transition-all duration-200',
            isVisuallyExpanded
              ? 'px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
              : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200',
            isRouteMatch(privacySettingsPath)
              ? 'bg-accent-muted border-accent-border text-accent'
              : 'text-slate-400'
          ]"
          @click="navigate(privacySettingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Privacy'"
        >
          <Shield :size="18" />
          <span
            v-if="isVisuallyExpanded"
            class="text-[0.8rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis"
          >Privacy</span>
          <span
            v-else
            class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
          >Privacy</span>
        </button>
        <button
          :class="[
            'group relative h-[38px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] cursor-pointer transition-all duration-200',
            isVisuallyExpanded
              ? 'px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
              : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200',
          ]"
          @click="cycle()"
          :title="`Theme: ${mode} (click to cycle)`"
        >
          <Moon v-if="mode === 'dark'" :size="18" />
          <Sun v-if="mode === 'light'" :size="18" />
          <Monitor v-if="mode === 'system'" :size="18" />
          <span
            v-if="isVisuallyExpanded"
            class="text-[0.8rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis capitalize"
          >{{ mode }}</span>
          <span
            v-else
            class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
          >Theme: {{ mode }}</span>
        </button>
      </div>
    </nav>

    <!-- User section -->
    <div class="shrink-0 border-t border-slate-700">
      <div v-if="isVisuallyExpanded && user" class="px-4 py-2.5">
        <span class="text-[0.7rem] font-mono text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap block">{{ user.email }}</span>
      </div>
      <button
        :class="[
          'group relative h-[40px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] text-slate-400 cursor-pointer transition-all duration-200 hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-500',
          isVisuallyExpanded
            ? 'mx-2.5 mb-2 px-3.5'
            : 'w-11 mx-auto mb-2 p-0 justify-center'
        ]"
        @click="handleLogout"
        :title="isVisuallyExpanded ? undefined : 'Log out'"
      >
        <LogOut :size="18" />
        <span
          v-if="isVisuallyExpanded"
          class="text-[0.8rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis"
        >Log out</span>
        <span
          v-else
          class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
        >Log out</span>
      </button>
    </div>

    <!-- Expand button (collapsed state) - floating edge tab -->
    <button
      v-if="!isExpanded && !isHoverExpanded"
      class="absolute -right-3 top-1/2 -translate-y-1/2 z-[60] flex items-center justify-center w-6 h-12 bg-slate-800 border border-slate-600 rounded-r-lg text-slate-400 cursor-pointer transition-all duration-200 hover:bg-accent-muted hover:border-accent-border hover:text-accent hover:w-7 shadow-lg"
      @click.stop="toggleSidebar"
      title="Expand sidebar"
    >
      <PanelLeftOpen :size="14" />
    </button>

    <CreateOrganizationModal
      v-if="showCreateOrgModal"
      @close="showCreateOrgModal = false"
      @created="handleOrgCreated"
    />
  </aside>
</template>
