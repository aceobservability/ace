<script setup lang="ts">
import { LayoutGrid, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { listDashboards } from '../api/dashboards'
import { useCopilot } from '../composables/useCopilot'
import { useOrganization } from '../composables/useOrganization'
import type { Dashboard } from '../types/dashboard'

const props = defineProps<{
  query: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
  'enter-chat': [query: string]
}>()

const { isConnected } = useCopilot()
const { currentOrgId } = useOrganization()

const dashboards = ref<Dashboard[]>([])

onMounted(async () => {
  if (!currentOrgId.value) return
  try {
    dashboards.value = await listDashboards(currentOrgId.value)
  } catch {
    dashboards.value = []
  }
})

const filteredDashboards = computed(() => {
  if (!props.query) return dashboards.value
  const q = props.query.toLowerCase()
  return dashboards.value.filter((d) => {
    const title = d.title.toLowerCase()
    const description = (d.description ?? '').toLowerCase()
    return title.includes(q) || description.includes(q)
  })
})

const showAskCopilot = computed(() => {
  return isConnected.value && props.query.length > 0
})

function handleResultClick(dashboard: Dashboard) {
  emit('navigate', `/app/dashboards/${dashboard.id}`)
}

function handleAskCopilot() {
  emit('enter-chat', props.query)
}
</script>

<template>
  <div>
    <!-- Results list -->
    <div class="max-h-[300px] overflow-y-auto">
      <template v-if="filteredDashboards.length > 0">
        <button
          v-for="d in filteredDashboards"
          :key="d.id"
          :data-testid="`search-result-${d.id}`"
          class="flex items-center gap-3 w-full text-left border-none cursor-pointer transition-colors duration-150"
          :style="{
            padding: '10px 16px',
            backgroundColor: 'transparent',
            color: 'var(--color-on-surface)',
            fontSize: '13px',
          }"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-container-high)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
          @click="handleResultClick(d)"
        >
          <LayoutGrid
            :size="18"
            :style="{ color: 'var(--color-on-surface-variant)', flexShrink: 0 }"
          />
          <div class="flex flex-col gap-0.5 min-w-0">
            <span
              class="truncate font-medium"
              :style="{ color: 'var(--color-on-surface)' }"
            >{{ d.title }}</span>
            <span
              v-if="d.description"
              class="truncate text-xs"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >{{ d.description }}</span>
          </div>
        </button>
      </template>

      <!-- Empty state -->
      <div
        v-else
        data-testid="search-empty"
        class="flex items-center justify-center py-8"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        <span class="text-sm">No results found</span>
      </div>
    </div>

    <!-- Ask Copilot option -->
    <button
      v-if="showAskCopilot"
      data-testid="ask-copilot-option"
      class="flex items-center gap-3 w-full text-left border-none cursor-pointer transition-colors duration-150"
      :style="{
        padding: '10px 16px',
        backgroundColor: 'transparent',
        color: 'var(--color-primary)',
        fontSize: '13px',
        borderTop: '1px solid var(--color-outline-variant)',
      }"
      @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-container-high)'"
      @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
      @click="handleAskCopilot"
    >
      <Sparkles
        :size="18"
        :style="{ flexShrink: 0 }"
      />
      <span>Ask Copilot</span>
    </button>
  </div>
</template>
