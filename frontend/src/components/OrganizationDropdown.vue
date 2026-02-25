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
  <div class="org-dropdown" ref="dropdownRef">
    <button class="org-trigger" @click="toggleDropdown" :class="{ expanded }">
      <div class="org-avatar">
        {{ currentOrg?.name?.charAt(0)?.toUpperCase() || '?' }}
      </div>
      <template v-if="expanded">
        <span class="org-name">{{ currentOrg?.name || 'Select Org' }}</span>
        <ChevronDown class="chevron" :class="{ open: dropdownOpen }" :size="16" />
      </template>
    </button>

    <Teleport to="body">
      <div v-if="dropdownOpen" class="dropdown-menu" :style="getDropdownPosition()">
        <div class="dropdown-header">Organizations</div>

        <div class="org-list">
          <button
            v-for="org in organizations"
            :key="org.id"
            class="org-item"
            :class="{ active: currentOrg?.id === org.id }"
            @click="handleSelectOrg(org.id)"
          >
            <div class="org-item-avatar">
              {{ org.name.charAt(0).toUpperCase() }}
            </div>
            <div class="org-item-info">
              <span class="org-item-name">{{ org.name }}</span>
              <span class="org-item-role">{{ org.role }}</span>
            </div>
            <Check v-if="currentOrg?.id === org.id" :size="16" class="check-icon" />
          </button>
        </div>

        <div class="dropdown-divider"></div>

        <button class="dropdown-action" @click="handleCreateOrg">
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

<style>
.org-dropdown {
  position: relative;
  margin: 0.75rem 0.5rem;
}

.org-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem;
  background: rgba(20, 33, 52, 0.85);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.org-trigger:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-strong);
}

.org-trigger:not(.expanded) {
  width: 40px;
  padding: 0.5rem;
  justify-content: center;
}

.org-avatar {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--color-accent), var(--color-accent-secondary));
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.org-name {
  flex: 1;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  color: var(--color-text-1);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.chevron.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  width: 260px;
  background: rgba(11, 21, 33, 0.98);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-header {
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.org-list {
  max-height: 200px;
  overflow-y: auto;
}

.org-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.org-item:hover {
  background: var(--color-bg-hover);
}

.org-item.active {
  background: rgba(245, 158, 11, 0.14);
}

.org-item-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--color-accent), var(--color-accent-secondary));
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.org-item-info {
  flex: 1;
  text-align: left;
  min-width: 0;
}

.org-item-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.org-item-role {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-1);
  text-transform: capitalize;
}

.check-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0.5rem 0;
}

.dropdown-action {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 1rem;
  background: transparent;
  border: none;
  font-size: 0.875rem;
  color: var(--color-text-1);
  cursor: pointer;
  transition: all 0.15s;
}

.dropdown-action:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-0);
}
</style>
