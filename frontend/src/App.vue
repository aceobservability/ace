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
  return isAuthenticated.value && route.meta.layout === 'app'
})
</script>

<template>
  <div class="relative flex min-h-screen w-full" :class="{ 'block': !showSidebar }">
    <Sidebar v-if="showSidebar" ref="sidebarRef" />
    <main
      class="min-h-screen flex-1 bg-slate-50 transition-[margin-left] duration-200 ease-out"
      :style="showSidebar ? { marginLeft: sidebarWidth } : {}"
    >
      <RouterView />
    </main>
    <CookieConsentBanner />
  </div>
</template>
