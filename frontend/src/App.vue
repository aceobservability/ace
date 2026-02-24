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
  <div class="app-layout" :class="{ 'no-sidebar': !showSidebar }">
    <Sidebar v-if="showSidebar" ref="sidebarRef" />
    <main class="main-content" :style="showSidebar ? { marginLeft: sidebarWidth } : {}">
      <RouterView />
    </main>
    <CookieConsentBanner />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
  position: relative;
}

.app-layout.no-sidebar {
  display: block;
}

.main-content {
  flex: 1;
  margin-left: 232px;
  min-height: 100vh;
  background: transparent;
  transition: margin-left 0.24s ease;
}

.no-sidebar .main-content {
  margin-left: 0;
}

@media (max-width: 900px) {
  .main-content {
    margin-left: 64px;
  }
}
</style>
