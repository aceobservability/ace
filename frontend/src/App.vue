<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import CookieConsentBanner from './components/CookieConsentBanner.vue'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const { isAuthenticated } = useAuth()

const sidebarRef = ref<InstanceType<typeof Sidebar> | null>(null)

const sidebarWidth = computed(() => {
  return sidebarRef.value?.isExpanded ? '232px' : '64px'
})

const showSidebar = computed(() => {
  return isAuthenticated.value && route.meta.appLayout === 'app'
})
</script>

<template>
  <div class="flex min-h-screen w-full relative" :class="{ '!block': !showSidebar }">
    <Sidebar v-if="showSidebar" ref="sidebarRef" />
    <main class="flex-1 min-h-screen bg-transparent transition-[margin-left] duration-[0.24s] ease" :style="showSidebar ? { marginLeft: sidebarWidth } : { marginLeft: '0' }">
      <RouterView />
    </main>
    <CookieConsentBanner />
  </div>
</template>
