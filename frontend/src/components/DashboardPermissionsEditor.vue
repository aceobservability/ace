<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { listGroups } from '../api/groups'
import { listMembers } from '../api/organizations'
import { listDashboardPermissions, replaceDashboardPermissions } from '../api/permissions'
import type { Dashboard } from '../types/dashboard'
import type { Member } from '../types/organization'
import type {
  PrincipalType,
  ResourcePermissionEntry,
  ResourcePermissionLevel,
  UserGroup,
} from '../types/rbac'

const props = defineProps<{
  dashboard: Dashboard
  orgId: string
}>()

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const actionError = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const members = ref<Member[]>([])
const groups = ref<UserGroup[]>([])
const entries = ref<ResourcePermissionEntry[]>([])

const newPrincipalType = ref<PrincipalType>('user')
const newPrincipalId = ref('')
const newPermission = ref<ResourcePermissionLevel>('view')

const principalOptions = computed(() => {
  if (newPrincipalType.value === 'user') {
    return members.value.map((member) => ({
      id: member.user_id,
      label: `${member.name || member.email} (${member.email})`,
    }))
  }

  return groups.value.map((group) => ({
    id: group.id,
    label: group.name,
  }))
})

watch(newPrincipalType, () => {
  newPrincipalId.value = ''
})

function principalLabel(entry: ResourcePermissionEntry): string {
  if (entry.principal_type === 'user') {
    const member = members.value.find((item) => item.user_id === entry.principal_id)
    return member
      ? `${member.name || member.email} (${member.email})`
      : `Unknown user (${entry.principal_id})`
  }

  const group = groups.value.find((item) => item.id === entry.principal_id)
  return group ? group.name : `Unknown group (${entry.principal_id})`
}

async function loadData() {
  loading.value = true
  error.value = null
  actionError.value = null

  try {
    const [permissionEntries, orgMembers, orgGroups] = await Promise.all([
      listDashboardPermissions(props.dashboard.id),
      listMembers(props.orgId),
      listGroups(props.orgId),
    ])

    entries.value = permissionEntries
    members.value = orgMembers
    groups.value = orgGroups
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load dashboard permissions'
  } finally {
    loading.value = false
  }
}

function addEntry() {
  successMessage.value = null
  actionError.value = null

  if (!newPrincipalId.value) {
    actionError.value = 'Select a principal to add'
    return
  }

  const duplicate = entries.value.some(
    (entry) =>
      entry.principal_type === newPrincipalType.value &&
      entry.principal_id === newPrincipalId.value,
  )

  if (duplicate) {
    actionError.value = 'This principal already has a permission entry'
    return
  }

  entries.value = [
    ...entries.value,
    {
      principal_type: newPrincipalType.value,
      principal_id: newPrincipalId.value,
      permission: newPermission.value,
    },
  ]
  newPrincipalId.value = ''
  newPermission.value = 'view'
}

function updateEntryPermission(index: number, permission: ResourcePermissionLevel) {
  entries.value = entries.value.map((entry, entryIndex) => {
    if (entryIndex === index) {
      return {
        ...entry,
        permission,
      }
    }

    return entry
  })
  successMessage.value = null
}

function removeEntry(index: number) {
  entries.value = entries.value.filter((_, entryIndex) => entryIndex !== index)
  actionError.value = null
  successMessage.value = null
}

async function savePermissions() {
  saving.value = true
  actionError.value = null
  successMessage.value = null

  try {
    const updatedEntries = await replaceDashboardPermissions(props.dashboard.id, {
      entries: entries.value,
    })
    entries.value = updatedEntries
    successMessage.value = 'Dashboard permissions updated'
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Failed to update dashboard permissions'
  } finally {
    saving.value = false
  }
}

onMounted(loadData)

watch(
  () => [props.dashboard.id, props.orgId],
  () => {
    void loadData()
  },
)
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="dashboard-permissions-editor">
    <h3 class="text-sm font-semibold text-[var(--color-on-surface)] mb-3">Permissions</h3>

    <div v-if="loading" class="px-4 py-3 text-sm text-[var(--color-outline)] border border-dashed  rounded-sm">Loading permissions...</div>
    <div v-else-if="error" class="px-3 py-2 border border-[var(--color-error)]/25 rounded-sm bg-[var(--color-error)]/10 text-sm text-[var(--color-error)]">{{ error }}</div>
    <div v-else class="flex flex-col gap-3">
      <div class="flex items-center gap-3 rounded-sm bg-[var(--color-surface-container-high)] p-3 mt-4">
        <div class="grid grid-cols-[130px_minmax(0,1fr)_120px] max-md:grid-cols-1 gap-2 flex-1">
          <select v-model="newPrincipalType" data-testid="principal-type-select" :disabled="saving" class="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20">
            <option value="user">User</option>
            <option value="group">Group</option>
          </select>
          <select v-model="newPrincipalId" data-testid="principal-select" :disabled="saving || principalOptions.length === 0" class="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20">
            <option value="">Select {{ newPrincipalType }}</option>
            <option
              v-for="option in principalOptions"
              :key="`${newPrincipalType}-${option.id}`"
              :value="option.id"
            >
              {{ option.label }}
            </option>
          </select>
          <select v-model="newPermission" data-testid="permission-select" :disabled="saving" class="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20">
            <option value="view">View</option>
            <option value="edit">Edit</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button class="rounded-sm bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary)]-hover disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition" data-testid="add-permission-entry" @click="addEntry" :disabled="saving">
          Add Entry
        </button>
      </div>

      <div v-if="entries.length === 0" class="px-4 py-3 text-sm text-[var(--color-outline)] border border-dashed  rounded-sm">
        No explicit ACL entries. Organization role defaults apply.
      </div>
      <div v-else class="rounded bg-[var(--color-surface-container-low)] overflow-hidden">
        <div class="bg-[var(--color-surface-container-high)] text-xs font-mono uppercase tracking-[0.07em] text-[var(--color-outline)] grid grid-cols-[1fr_auto] px-4 py-3">
          <span>Principal</span>
          <span>Actions</span>
        </div>
        <div
          v-for="(entry, index) in entries"
          :key="`${entry.principal_type}-${entry.principal_id}`"
          class="flex items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--color-on-surface-variant)] max-md:flex-col max-md:items-start"
          :data-testid="`permission-entry-${index}`"
        >
          <div class="flex flex-col min-w-0">
            <strong class="text-sm text-[var(--color-on-surface)] truncate">{{ principalLabel(entry) }}</strong>
            <span class="mt-1 w-fit px-2 py-0.5 rounded-sm bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-xs uppercase tracking-wide">{{ entry.principal_type }}</span>
          </div>
          <div class="flex items-center gap-2 max-md:flex-col max-md:w-full max-md:items-start">
            <select
              :value="entry.permission"
              :data-testid="`entry-permission-${index}`"
              :disabled="saving"
              @change="updateEntryPermission(index, ($event.target as HTMLSelectElement).value as ResourcePermissionLevel)"
              class="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 max-md:w-full"
            >
              <option value="view">View</option>
              <option value="edit">Edit</option>
              <option value="admin">Admin</option>
            </select>
            <button
              class="text-[var(--color-error)] hover:text-[var(--color-error)] transition text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed max-md:w-full"
              :data-testid="`remove-entry-${index}`"
              @click="removeEntry(index)"
              :disabled="saving"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div v-if="actionError" class="px-3 py-2 border border-[var(--color-error)]/25 rounded-sm bg-[var(--color-error)]/10 text-sm text-[var(--color-error)]">{{ actionError }}</div>
      <div v-if="successMessage" class="px-3 py-2 border border-[var(--color-primary)]/20 rounded-sm bg-[var(--color-primary)]/10 text-sm text-[var(--color-primary)]">{{ successMessage }}</div>

      <div class="flex justify-end">
        <button class="inline-flex items-center justify-center gap-1 rounded-sm bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary)]-hover cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed" data-testid="save-dashboard-permissions" @click="savePermissions" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save Permissions' }}
        </button>
      </div>
    </div>
  </div>
</template>
