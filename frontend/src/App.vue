<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import CmdKModal from './components/CmdKModal.vue'
import CookieConsentBanner from './components/CookieConsentBanner.vue'
import ShortcutsOverlay from './components/ShortcutsOverlay.vue'
import ToastNotification from './components/ToastNotification.vue'
import { useAuth } from './composables/useAuth'
import { useDatasource } from './composables/useDatasource'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useOrgBranding } from './composables/useOrgBranding'
import { useOrganization } from './composables/useOrganization'

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useAuth()
const { register } = useKeyboardShortcuts()
const { currentOrg, fetchOrganizations } = useOrganization()
const { fetchDatasources } = useDatasource()
useOrgBranding()

const showSidebar = computed(() => {
  return isAuthenticated.value && route.meta.appLayout === 'app'
})

const mainMargin = computed(() => {
  if (!showSidebar.value) return {}
  return { marginLeft: '52px' }
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

// Fetch organizations when authenticated
watch(isAuthenticated, async (authenticated) => {
  if (authenticated) {
    await fetchOrganizations()
  }
}, { immediate: true })

// Fetch datasources when org changes
watch(() => currentOrg.value?.id, async (newOrgId) => {
  if (newOrgId) {
    await fetchDatasources(newOrgId)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})

// Register global shortcuts (only Cmd+K and Cmd+Shift+N remain here)
const unregisterFns: (() => void)[] = []

unregisterFns.push(
  register('Cmd+K', openCmdK, 'Open command palette', 'General'),
)
unregisterFns.push(
  register('Cmd+Shift+N', () => router.push('/app/dashboards?new=1'), 'New dashboard', 'Actions'),
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
