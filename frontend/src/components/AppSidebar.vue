<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useOrganization } from '../composables/useOrganization'
import { useSidebar } from '../composables/useSidebar'
import SidebarFlyout from './SidebarFlyout.vue'
import SidebarRail from './SidebarRail.vue'
import SidebarUserMenu from './SidebarUserMenu.vue'

const router = useRouter()
const { organizations, currentOrg, selectOrganization } = useOrganization()
const {
  pinnedSection,
  activeFlyoutSection,
  currentRouteSection,
  handleMouseEnter,
  handleMouseLeave,
  pinSection,
  closeFlyout,
} = useSidebar()

const userMenuOpen = ref(false)
const orgMenuOpen = ref(false)
const orgMenuRef = ref<HTMLDivElement | null>(null)

function handleOrgClick() {
  orgMenuOpen.value = !orgMenuOpen.value
  userMenuOpen.value = false
}

function handleSelectOrg(orgId: string) {
  selectOrganization(orgId)
  orgMenuOpen.value = false
}

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

// Map section IDs to their default routes for navigation
const sectionRoutes: Record<string, string> = {
  home: '/app',
  dashboards: '/app/dashboards',
  services: '/app/services',
  alerts: '/app/alerts',
  explore: '/app/explore/metrics',
  settings: '/app/settings',
}

function handleRailSelect(sectionId: string) {
  // Navigate to the section's default route
  router.push(sectionRoutes[sectionId] || '/app')
  // Pin/unpin the flyout
  pinSection(sectionId)
}

function handleFlyoutNavigate(path: string) {
  router.push(path)
}

function handleAvatarClick() {
  userMenuOpen.value = !userMenuOpen.value
}

function closeUserMenu() {
  userMenuOpen.value = false
}

const railActiveSection = computed<string | null>(
  () => pinnedSection.value || currentRouteSection.value,
)
</script>

<template>
  <nav aria-label="Main navigation">
    <!-- Click-outside backdrop: closes flyout when clicking content area -->
    <div
      v-if="pinnedSection"
      class="fixed inset-0 z-30"
      data-testid="flyout-backdrop"
      :style="{ left: '292px' }"
      @click="closeFlyout"
    />

    <SidebarRail
      :active-section="railActiveSection"
      @hover="handleMouseEnter"
      @hover-end="handleMouseLeave"
      @select="handleRailSelect"
      @avatar-click="handleAvatarClick"
      @org-click="handleOrgClick"
    />

    <SidebarFlyout
      v-if="activeFlyoutSection && activeFlyoutSection !== 'home'"
      :section="activeFlyoutSection"
      :is-pinned="pinnedSection !== null"
      @close="closeFlyout"
      @navigate="handleFlyoutNavigate"
      @hover="handleMouseEnter(activeFlyoutSection!)"
      @hover-end="handleMouseLeave"
    />

    <SidebarUserMenu
      :is-open="userMenuOpen"
      @close="closeUserMenu"
    />

    <!-- Org switcher popup — positioned relative to rail (52px wide) + logo area -->
    <div
      v-if="orgMenuOpen"
      ref="orgMenuRef"
      data-testid="org-switcher-popup"
      class="fixed z-[60] overflow-hidden animate-fade-in"
      :style="{
        left: 'calc(52px + 4px)',
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
  </nav>
</template>
