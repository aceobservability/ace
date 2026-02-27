<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CookieConsentBanner from './components/CookieConsentBanner.vue'
import CopilotPanel from './components/CopilotPanel.vue'
import Sidebar from './components/Sidebar.vue'
import { useAuth } from './composables/useAuth'
import { useCopilot } from './composables/useCopilot'
import { useDatasource } from './composables/useDatasource'
import { useOrganization } from './composables/useOrganization'
import { useOrgBranding } from './composables/useOrgBranding'

const route = useRoute()
const { isAuthenticated } = useAuth()
useOrgBranding()

const sidebarRef = ref<InstanceType<typeof Sidebar> | null>(null)

const showSidebar = computed(() => {
  return isAuthenticated.value && route.meta.appLayout === 'app'
})

const mainMargin = computed(() => {
  if (!showSidebar.value) return {}
  const width = sidebarRef.value?.isPinned ? 220 : 48
  return { marginLeft: width + 'px' }
})

const showCopilot = ref(false)
const { isConnected, hasCopilot, checkConnection } = useCopilot()
const { currentOrg } = useOrganization()
const { metricsDatasources, fetchDatasources } = useDatasource()

const copilotDatasource = computed(() => {
  const sources = metricsDatasources.value
  if (sources.length === 0) return null
  return sources.find((ds) => ds.is_default) || sources[0]
})

watch(
  () => currentOrg.value?.id,
  (orgId) => {
    if (orgId) fetchDatasources(orgId)
  },
  { immediate: true },
)

watch(
  isAuthenticated,
  (authed) => {
    if (authed) checkConnection()
  },
  { immediate: true },
)
</script>

<template>
  <div class="relative flex min-h-screen w-full overflow-x-hidden" :class="{ 'block': !showSidebar }">
    <Sidebar v-if="showSidebar" ref="sidebarRef" />
    <main
      class="min-h-screen min-w-0 flex-1 bg-surface-base transition-[margin-left] duration-200"
      :style="mainMargin"
    >
      <RouterView />
    </main>
    <CopilotPanel
      v-if="showCopilot && showSidebar && isConnected && hasCopilot && copilotDatasource"
      :datasource-type="copilotDatasource.type"
      :datasource-name="copilotDatasource.name"
      :datasource-id="copilotDatasource.id"
      @close="showCopilot = false"
    />
    <button
      v-if="showSidebar && !showCopilot"
      class="fixed bottom-6 right-6 z-50 flex items-center justify-center h-12 w-12 rounded-full shadow-lg cursor-pointer border-none transition bg-surface-raised text-text-secondary border border-border hover:bg-surface-overlay hover:text-text-primary"
      @click="showCopilot = true"
      title="Toggle AI assistant"
    >
      <Sparkles :size="20" />
    </button>
    <CookieConsentBanner />
  </div>
</template>
