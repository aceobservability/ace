<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Plus, Check } from 'lucide-vue-next'
import { useOrganization } from '../composables/useOrganization'

defineProps<{
  expanded: boolean
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
  <div class="relative mx-2 my-3" ref="dropdownRef">
    <button
      @click="toggleDropdown"
      :class="[
        'mx-2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 w-full cursor-pointer',
        !expanded && 'mx-auto !w-11 justify-center !px-0'
      ]"
    >
      <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-xs font-semibold text-white">
        {{ currentOrg?.name?.charAt(0)?.toUpperCase() || '?' }}
      </div>
      <template v-if="expanded">
        <span class="flex-1 truncate text-left text-sm font-medium text-slate-300">{{ currentOrg?.name || 'Select Org' }}</span>
        <ChevronDown
          :size="16"
          :class="['shrink-0 text-slate-400 transition-transform duration-200', dropdownOpen && 'rotate-180']"
        />
      </template>
    </button>

    <Teleport to="body">
      <div v-if="dropdownOpen" class="absolute z-[60] w-64 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden animate-[fadeIn_0.15s_ease-out]" :style="getDropdownPosition()">
        <div class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Organizations</div>

        <div class="max-h-[200px] overflow-y-auto">
          <button
            v-for="org in organizations"
            :key="org.id"
            :class="[
              'flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 cursor-pointer border-none bg-transparent',
              currentOrg?.id === org.id && 'bg-emerald-50 text-emerald-700'
            ]"
            @click="handleSelectOrg(org.id)"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
              {{ org.name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0 text-left">
              <span class="block truncate text-sm font-medium text-slate-700">{{ org.name }}</span>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500 capitalize">{{ org.role }}</span>
            </div>
            <Check v-if="currentOrg?.id === org.id" :size="16" class="shrink-0 text-emerald-600" />
          </button>
        </div>

        <button class="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 cursor-pointer bg-transparent" @click="handleCreateOrg">
          <Plus :size="16" />
          <span>Create Organization</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
function getDropdownPosition() {
  return {
    position: 'fixed' as const,
    left: '8px',
    top: '64px',
    zIndex: 1000,
  }
}
</script>
