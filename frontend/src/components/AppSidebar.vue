<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSidebar } from '../composables/useSidebar'
import SidebarFlyout from './SidebarFlyout.vue'
import SidebarRail from './SidebarRail.vue'
import SidebarUserMenu from './SidebarUserMenu.vue'

const router = useRouter()
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

// The rail shows the active section based on pinned state or current route
function railActiveSection(): string | null {
  return pinnedSection.value || currentRouteSection.value
}
</script>

<template>
  <nav aria-label="Main navigation">
    <SidebarRail
      :active-section="railActiveSection()"
      @hover="handleMouseEnter"
      @hover-end="handleMouseLeave"
      @select="handleRailSelect"
      @avatar-click="handleAvatarClick"
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
  </nav>
</template>
