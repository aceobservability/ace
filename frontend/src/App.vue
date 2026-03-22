<script setup lang="ts">
import { Menu } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import CmdKModal from './components/CmdKModal.vue'
import CookieConsentBanner from './components/CookieConsentBanner.vue'
import ShortcutsOverlay from './components/ShortcutsOverlay.vue'
import ToastNotification from './components/ToastNotification.vue'
import { useAuth } from './composables/useAuth'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useOrgBranding } from './composables/useOrgBranding'
import { useSidebar } from './composables/useSidebar'

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useAuth()
const { isOpen, open: openSidebar } = useSidebar()
const { register } = useKeyboardShortcuts()
useOrgBranding()

const showSidebar = computed(() => {
  return isAuthenticated.value && route.meta.appLayout === 'app'
})

const mainMargin = computed(() => {
  if (!showSidebar.value) return {}
  return { marginLeft: isOpen.value ? '240px' : '0px' }
})

// Cmd+K modal state
const cmdKOpen = ref(false)

function openCmdK() {
  cmdKOpen.value = true
}
function closeCmdK() {
  cmdKOpen.value = false
}

// Viewport width warning
const viewportTooNarrow = ref(false)
function checkViewport() {
  viewportTooNarrow.value = window.innerWidth < 1280
}

onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})

// Register global shortcuts
const unregisterFns: (() => void)[] = []

unregisterFns.push(
  register('Cmd+K', openCmdK, 'Open command palette', 'General'),
)
unregisterFns.push(
  register('Cmd+1', () => router.push('/app'), 'Go to Home', 'Navigation'),
)
unregisterFns.push(
  register('Cmd+2', () => router.push('/app/dashboards'), 'Go to Dashboards', 'Navigation'),
)
unregisterFns.push(
  register('Cmd+3', () => router.push('/app/services'), 'Go to Services', 'Navigation'),
)
unregisterFns.push(
  register('Cmd+4', () => router.push('/app/alerts'), 'Go to Alerts', 'Navigation'),
)
unregisterFns.push(
  register('Cmd+5', () => router.push('/app/explore/metrics'), 'Go to Explore', 'Navigation'),
)
unregisterFns.push(
  register('Cmd+Shift+N', () => router.push('/app/dashboards?new=1'), 'New dashboard', 'Actions'),
)
unregisterFns.push(
  register('Cmd+E', () => router.push('/app/explore/metrics'), 'Open Explore', 'Navigation'),
)

onUnmounted(() => {
  for (const fn of unregisterFns) {
    fn()
  }
})
</script>

<template>
  <div class="relative flex min-h-screen w-full overflow-x-hidden">
    <!-- Sidebar -->
    <AppSidebar v-if="showSidebar" />

    <!-- Hamburger button when sidebar is closed -->
    <button
      v-if="showSidebar && !isOpen"
      class="fixed top-3 left-3 z-40 flex items-center justify-center rounded-md border-none cursor-pointer transition-opacity"
      :style="{
        width: '32px',
        height: '32px',
        backgroundColor: 'transparent',
        color: 'var(--color-outline)',
        opacity: 0.5,
      }"
      data-testid="sidebar-hamburger"
      title="Open sidebar"
      @click="openSidebar"
      @mouseenter="($event.target as HTMLElement).style.opacity = '1'"
      @mouseleave="($event.target as HTMLElement).style.opacity = '0.5'"
    >
      <Menu :size="20" />
    </button>

    <!-- Main content -->
    <main
      class="min-h-screen min-w-0 flex-1 transition-[margin-left] duration-200"
      :style="{
        ...mainMargin,
        backgroundColor: 'var(--color-surface)',
      }"
    >
      <RouterView />
    </main>

    <!-- Modals & overlays -->
    <CmdKModal :is-open="cmdKOpen" @close="closeCmdK" />
    <ShortcutsOverlay />
    <ToastNotification />
    <CookieConsentBanner />

    <!-- Viewport too narrow overlay -->
    <div
      v-if="viewportTooNarrow && showSidebar"
      class="fixed inset-0 z-[100] flex items-center justify-center"
      :style="{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }"
      data-testid="narrow-viewport-overlay"
    >
      <div class="text-center p-8 max-w-md">
        <p
          class="text-lg font-semibold mb-2"
          :style="{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }"
        >
          Best experienced on a wider screen
        </p>
        <p
          class="text-sm"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Please use a screen at least 1280px wide for the best experience.
        </p>
      </div>
    </div>
  </div>
</template>
