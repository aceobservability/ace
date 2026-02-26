<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, Settings, Activity, ChevronLeft, ChevronRight, Compass, LogOut, ChevronDown, Shield, Moon, Sun, Monitor } from 'lucide-vue-next'
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
    <div
      :class="[
        isVisuallyExpanded
          ? 'h-16 flex items-center justify-between px-3 border-b border-slate-700'
          : 'h-[88px] flex flex-col items-center justify-center gap-[0.45rem] py-2 border-b border-slate-700'
      ]"
    >
      <div
        :class="[
          'flex items-center gap-2.5',
          isVisuallyExpanded ? 'pl-0.5' : 'pl-0'
        ]"
      >
        <Activity
          class="text-emerald-500 shrink-0 p-1 rounded-[10px] bg-emerald-500/15"
          :size="24"
        />
        <div v-if="isVisuallyExpanded" class="flex flex-col min-w-0">
          <span class="text-[0.95rem] font-bold tracking-wide uppercase font-mono text-slate-100">Ace</span>
          <span class="text-[0.64rem] uppercase tracking-widest text-slate-500 whitespace-nowrap">developer cockpit</span>
        </div>
      </div>
      <button
        :class="[
          'flex items-center justify-center w-[30px] h-[30px] bg-slate-800 border border-slate-700 rounded-lg text-slate-400 cursor-pointer transition-all duration-200 hover:bg-slate-700 hover:text-slate-200 shrink-0',
          !isVisuallyExpanded ? 'mx-auto' : ''
        ]"
        @click="toggleSidebar"
        :title="isExpanded ? 'Collapse' : 'Expand'"
      >
        <component :is="isExpanded ? ChevronLeft : ChevronRight" :size="16" />
      </button>
    </div>

    <OrganizationDropdown :expanded="isVisuallyExpanded" @createOrg="showCreateOrgModal = true" />

    <nav class="flex-1 flex flex-col justify-between py-3.5">
      <div class="flex flex-col gap-1">
        <div
          v-for="item in navItems"
          :key="item.id"
          class="flex flex-col gap-1"
        >
          <button
            :class="[
              'group relative h-[42px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] text-slate-400 cursor-pointer transition-all duration-200',
              isVisuallyExpanded
                ? 'mx-2.5 px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
                : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200',
              isActive(item)
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 before:absolute before:-left-1 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:bg-emerald-500 before:rounded-full'
                : ''
            ]"
            @click="handleNavItemClick(item)"
            :title="isVisuallyExpanded ? undefined : item.label"
          >
            <component :is="item.icon" :size="20" />
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
            class="flex flex-col gap-[0.2rem] mx-2.5 mb-1.5 ml-7"
          >
            <button
              v-for="child in item.children"
              :key="child.path"
              :class="[
                'h-8 flex items-center px-3 bg-transparent border border-transparent rounded-lg text-slate-500 cursor-pointer transition-all duration-200 hover:bg-slate-800 hover:text-slate-200',
                isRouteMatch(child.path)
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : ''
              ]"
              @click="navigate(child.path)"
            >
              <span class="text-[0.76rem] tracking-[0.01em]">{{ child.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <button
          v-if="settingsPath"
          :class="[
            'group relative h-[42px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] text-slate-400 cursor-pointer transition-all duration-200',
            isVisuallyExpanded
              ? 'mx-2.5 px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
              : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200',
            isRouteMatch('/settings')
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 before:absolute before:-left-1 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:bg-emerald-500 before:rounded-full'
              : ''
          ]"
          @click="navigate(settingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Settings'"
        >
          <Settings :size="20" />
          <span
            v-if="isVisuallyExpanded"
            class="text-[0.82rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis"
          >Settings</span>
          <span
            v-else
            class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
          >Settings</span>
        </button>
        <button
          :class="[
            'group relative h-[42px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] text-slate-400 cursor-pointer transition-all duration-200',
            isVisuallyExpanded
              ? 'mx-2.5 px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
              : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200',
            isRouteMatch(privacySettingsPath)
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 before:absolute before:-left-1 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:bg-emerald-500 before:rounded-full'
              : ''
          ]"
          @click="navigate(privacySettingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Privacy'"
        >
          <Shield :size="20" />
          <span
            v-if="isVisuallyExpanded"
            class="text-[0.82rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis"
          >Privacy</span>
          <span
            v-else
            class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
          >Privacy</span>
        </button>
        <button
          :class="[
            'group relative h-[42px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] text-slate-400 cursor-pointer transition-all duration-200',
            isVisuallyExpanded
              ? 'mx-2.5 px-3.5 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
              : 'w-11 mx-auto p-0 justify-center hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
          ]"
          @click="cycle()"
          :title="`Theme: ${mode} (click to cycle)`"
        >
          <Moon v-if="mode === 'dark'" :size="20" />
          <Sun v-if="mode === 'light'" :size="20" />
          <Monitor v-if="mode === 'system'" :size="20" />
          <span
            v-if="isVisuallyExpanded"
            class="text-[0.82rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis capitalize"
          >{{ mode }}</span>
          <span
            v-else
            class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
          >Theme: {{ mode }}</span>
        </button>
        <div v-if="isVisuallyExpanded && user" class="px-3.5 py-2.5 mx-2 mt-2 border-t border-slate-700 bg-slate-900 rounded-[10px]">
          <span class="text-[0.72rem] font-mono text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap block">{{ user.email }}</span>
        </div>
        <button
          :class="[
            'group relative h-[42px] flex items-center gap-3 bg-transparent border border-transparent rounded-[10px] text-slate-400 cursor-pointer transition-all duration-200 hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-500',
            isVisuallyExpanded
              ? 'mx-2.5 px-3.5'
              : 'w-11 mx-auto p-0 justify-center'
          ]"
          @click="handleLogout"
          :title="isVisuallyExpanded ? undefined : 'Log out'"
        >
          <LogOut :size="20" />
          <span
            v-if="isVisuallyExpanded"
            class="text-[0.82rem] font-medium tracking-[0.01em] whitespace-nowrap overflow-hidden text-ellipsis"
          >Log out</span>
          <span
            v-else
            class="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-xs font-medium text-slate-200 whitespace-nowrap opacity-0 invisible pointer-events-none z-[100] group-hover:opacity-100 group-hover:visible"
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
