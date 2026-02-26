<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, Settings, Activity, ChevronLeft, ChevronRight, Compass, LogOut, ChevronDown, Shield } from 'lucide-vue-next'
import OrganizationDropdown from './OrganizationDropdown.vue'
import CreateOrganizationModal from './CreateOrganizationModal.vue'
import { useOrganization } from '../composables/useOrganization'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { fetchOrganizations, clearOrganizations, currentOrg } = useOrganization()
const { logout, user } = useAuth()

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
    class="sidebar"
    :class="{ expanded: isVisuallyExpanded }"
    @mouseenter="handleSidebarMouseEnter"
    @mouseleave="handleSidebarMouseLeave"
  >
    <div class="sidebar-header" :class="{ collapsed: !isVisuallyExpanded }">
      <div class="sidebar-logo">
        <Activity class="logo-icon" :size="24" />
        <div v-if="isVisuallyExpanded" class="logo-copy">
          <span class="logo-text">Ace</span>
          <span class="logo-subtext">developer cockpit</span>
        </div>
      </div>
      <button class="toggle-btn" @click="toggleSidebar" :title="isExpanded ? 'Collapse' : 'Expand'">
        <component :is="isExpanded ? ChevronLeft : ChevronRight" :size="16" />
      </button>
    </div>

    <OrganizationDropdown :expanded="isVisuallyExpanded" @createOrg="showCreateOrgModal = true" />

    <nav class="sidebar-nav">
      <div class="nav-main">
        <div
          v-for="item in navItems"
          :key="item.id"
          class="nav-item-group"
        >
          <button
            class="nav-item"
            :class="{ active: isActive(item) }"
            @click="handleNavItemClick(item)"
            :title="isVisuallyExpanded ? undefined : item.label"
          >
            <component :is="item.icon" :size="20" />
            <span v-if="isVisuallyExpanded" class="nav-label">{{ item.label }}</span>
            <span v-else class="nav-tooltip">{{ item.label }}</span>
            <span
              v-if="isVisuallyExpanded && item.children"
              class="nav-chevron-toggle"
              @click.stop="toggleNavGroup(item.id)"
            >
              <ChevronDown :size="14" class="nav-chevron" :class="{ open: isNavGroupOpen(item.id) }" />
            </span>
          </button>

          <div
            v-if="isVisuallyExpanded && item.children && isNavGroupOpen(item.id)"
            class="nav-children"
          >
            <button
              v-for="child in item.children"
              :key="child.path"
              class="nav-sub-item"
              :class="{ active: isRouteMatch(child.path) }"
              @click="navigate(child.path)"
            >
              <span class="nav-sub-label">{{ child.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="nav-bottom">
        <button
          v-if="settingsPath"
          class="nav-item"
          :class="{ active: isRouteMatch('/settings') }"
          @click="navigate(settingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Settings'"
        >
          <Settings :size="20" />
          <span v-if="isVisuallyExpanded" class="nav-label">Settings</span>
          <span v-else class="nav-tooltip">Settings</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: isRouteMatch(privacySettingsPath) }"
          @click="navigate(privacySettingsPath)"
          :title="isVisuallyExpanded ? undefined : 'Privacy'"
        >
          <Shield :size="20" />
          <span v-if="isVisuallyExpanded" class="nav-label">Privacy</span>
          <span v-else class="nav-tooltip">Privacy</span>
        </button>
        <div v-if="isVisuallyExpanded && user" class="user-info">
          <span class="user-email">{{ user.email }}</span>
        </div>
        <button
          class="nav-item logout-btn"
          @click="handleLogout"
          :title="isVisuallyExpanded ? undefined : 'Log out'"
        >
          <LogOut :size="20" />
          <span v-if="isVisuallyExpanded" class="nav-label">Log out</span>
          <span v-else class="nav-tooltip">Log out</span>
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

<style scoped>
.sidebar {
  width: 64px;
  min-height: 100vh;
  background: linear-gradient(180deg, rgba(12, 21, 34, 0.95), rgba(10, 17, 28, 0.92));
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 50;
  transition: width 0.24s ease;
  backdrop-filter: blur(10px);
}

.sidebar.expanded {
  width: 232px;
}

.sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  right: -1px;
  width: 1px;
  height: 100%;
  background: linear-gradient(180deg, transparent, rgba(56, 189, 248, 0.4), transparent);
  pointer-events: none;
}

.sidebar-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--border-primary);
}

.sidebar-header.collapsed {
  height: 88px;
  flex-direction: column;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.5rem 0;
}

.sidebar-header.collapsed .sidebar-logo {
  padding-left: 0;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding-left: 0.1rem;
}

.logo-icon {
  color: var(--accent-primary);
  flex-shrink: 0;
  padding: 0.35rem;
  border-radius: 10px;
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.24), rgba(52, 211, 153, 0.2));
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.logo-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.logo-text {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.logo-subtext {
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: rgba(20, 35, 54, 0.9);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.sidebar:not(.expanded) .toggle-btn {
  margin: 0 auto;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.9rem 0;
}

.nav-main,
.nav-bottom {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-item-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-item {
  position: relative;
  height: 42px;
  margin: 0 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0 0.9rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-chevron-toggle {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  border-radius: 4px;
}

.nav-chevron-toggle:hover {
  background: rgba(31, 49, 73, 0.84);
  color: var(--text-primary);
}

.nav-chevron {
  transition: transform 0.2s ease;
}

.nav-chevron.open {
  transform: rotate(180deg);
}

.nav-children {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0 0.6rem 0.35rem 1.8rem;
}

.nav-sub-item {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 0.7rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-sub-item:hover {
  background: rgba(31, 49, 73, 0.64);
  border-color: rgba(125, 211, 252, 0.2);
  color: var(--text-primary);
}

.nav-sub-item.active {
  background: rgba(56, 189, 248, 0.14);
  border-color: rgba(56, 189, 248, 0.28);
  color: #bde9ff;
}

.nav-sub-label {
  font-size: 0.76rem;
  letter-spacing: 0.01em;
}

.sidebar:not(.expanded) .nav-item {
  width: 44px;
  margin: 0 auto;
  padding: 0;
  justify-content: center;
}

.nav-item:hover {
  background: rgba(31, 49, 73, 0.74);
  border-color: rgba(125, 211, 252, 0.22);
  color: var(--text-primary);
}

.nav-item.active {
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.18), rgba(52, 211, 153, 0.1));
  border-color: rgba(56, 189, 248, 0.34);
  color: #bde9ff;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -5px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  background: var(--accent-primary);
  border-radius: 999px;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.7);
}

.sidebar:not(.expanded) .nav-item.active::before {
  left: -3px;
}

.nav-label {
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-tooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  padding: 0.5rem 0.75rem;
  background: rgba(11, 20, 31, 0.96);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0.2s;
  pointer-events: none;
  z-index: 100;
}

.nav-tooltip::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 5px solid transparent;
  border-right-color: var(--border-secondary);
}

.sidebar:not(.expanded) .nav-item:hover .nav-tooltip {
  opacity: 1;
  visibility: visible;
}

.user-info {
  padding: 0.65rem 0.9rem;
  margin: 0.5rem 0.5rem 0;
  border-top: 1px solid var(--border-primary);
  background: rgba(19, 32, 50, 0.5);
  border-radius: 10px;
}

.user-email {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.logout-btn:hover {
  background: rgba(251, 113, 133, 0.15);
  border-color: rgba(251, 113, 133, 0.34);
  color: var(--accent-danger);
}

@media (max-width: 900px) {
  .sidebar.expanded {
    width: 210px;
  }
}
</style>
