<script setup lang="ts">
import { Check, ChevronDown, Plus } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'
import { useOrganization } from '../composables/useOrganization'

const props = defineProps<{
  expanded: boolean
  sidebarWidth?: number
}>()

const emit = defineEmits<{
  createOrg: []
}>()

const { organizations, currentOrg, selectOrganization, fetchOrganizations } = useOrganization()

const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLDivElement | null>(null)

onMounted(() => {
  fetchOrganizations()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    dropdownOpen.value = false
  }
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function handleSelectOrg(orgId: string) {
  selectOrganization(orgId)
  dropdownOpen.value = false
}

function handleCreateOrg() {
  dropdownOpen.value = false
  emit('createOrg')
}
</script>

<template>
  <div class="relative mx-2 my-2" ref="dropdownRef">
    <button
      @click="toggleDropdown"
      data-testid="org-dropdown-btn"
      :class="[
        'flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-2.5 py-1.5 text-sm text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-bright)] w-full cursor-pointer',
        !expanded && 'mx-auto !w-9 justify-center !px-0'
      ]"
    >
      <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-[var(--color-primary)] text-[0.625rem] font-semibold text-white">
        {{ currentOrg?.name?.charAt(0)?.toUpperCase() || '?' }}
      </div>
      <template v-if="expanded">
        <span class="flex-1 truncate text-left text-xs font-medium text-[var(--color-on-surface-variant)]">{{ currentOrg?.name || 'Select Org' }}</span>
        <ChevronDown
          :size="14"
          :class="['shrink-0 text-[#555a6e] transition-transform duration-200', dropdownOpen && 'rotate-180']"
        />
      </template>
    </button>

    <Teleport to="body">
      <div v-if="dropdownOpen" data-testid="org-dropdown-menu" class="absolute z-[60] w-64 rounded bg-[var(--color-surface-container-low)] shadow-lg overflow-hidden animate-[fadeIn_0.15s_ease-out]" :style="{ position: 'fixed', left: (props.sidebarWidth ?? 220) + 'px', top: '64px', zIndex: 1000 }">
        <div class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-outline)]">Organizations</div>

        <div class="max-h-[200px] overflow-y-auto">
          <button
            v-for="org in organizations"
            :key="org.id"
            :class="[
              'flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-container-high)] cursor-pointer border-none bg-transparent',
              currentOrg?.id === org.id && 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
            ]"
            :data-testid="`org-dropdown-item-${org.id}`"
            @click="handleSelectOrg(org.id)"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[var(--color-surface-container-high)] text-xs font-semibold text-[var(--color-on-surface-variant)]">
              {{ org.name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0 text-left">
              <span class="block truncate text-sm font-medium text-[var(--color-on-surface)]">{{ org.name }}</span>
              <span class="rounded-sm bg-[var(--color-surface-container-high)] px-2 py-0.5 font-mono text-xs text-[var(--color-outline)] capitalize">{{ org.role }}</span>
            </div>
            <Check v-if="currentOrg?.id === org.id" :size="16" class="shrink-0 text-[var(--color-primary)]" />
          </button>
        </div>

        <button class="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10 cursor-pointer bg-transparent" data-testid="org-dropdown-create-btn" @click="handleCreateOrg">
          <Plus :size="16" />
          <span>Create Organization</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

