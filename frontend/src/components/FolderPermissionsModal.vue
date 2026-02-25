<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { X, Shield } from 'lucide-vue-next'
import type { Folder } from '../types/folder'
import type { Member } from '../types/organization'
import type {
  PrincipalType,
  ResourcePermissionEntry,
  ResourcePermissionLevel,
  UserGroup,
} from '../types/rbac'
import { listMembers } from '../api/organizations'
import { listGroups } from '../api/groups'
import {
  listFolderPermissions,
  replaceFolderPermissions,
} from '../api/permissions'

const props = defineProps<{
  folder: Folder
  orgId: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
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
    return member ? `${member.name || member.email} (${member.email})` : `Unknown user (${entry.principal_id})`
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
      listFolderPermissions(props.folder.id),
      listMembers(props.orgId),
      listGroups(props.orgId),
    ])

    entries.value = permissionEntries
    members.value = orgMembers
    groups.value = orgGroups
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load folder permissions'
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
    const updatedEntries = await replaceFolderPermissions(props.folder.id, {
      entries: entries.value,
    })
    entries.value = updatedEntries
    successMessage.value = 'Folder permissions updated'
    emit('saved')
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Failed to update folder permissions'
  } finally {
    saving.value = false
  }
}

function closeModal() {
  emit('close')
}

onMounted(loadData)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="closeModal">
    <div class="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-lg max-h-[80vh] overflow-y-auto" data-testid="folder-permissions-modal">
      <header class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900"><Shield :size="18" /> Folder Permissions</h2>
          <p class="mt-1 text-sm text-slate-500">{{ props.folder.name }}</p>
        </div>
        <button class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 cursor-pointer transition" @click="closeModal" aria-label="Close permissions editor">
          <X :size="18" />
        </button>
      </header>

      <div v-if="loading" class="px-6 py-4 text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg m-6">Loading permissions...</div>
      <div v-else-if="error" class="mx-6 mt-4 px-3 py-2 border border-rose-200 rounded-lg bg-rose-50 text-sm text-rose-600">{{ error }}</div>
      <div v-else class="px-6 py-4 flex flex-col gap-3">
        <div class="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="grid grid-cols-[130px_minmax(0,1fr)_120px] max-md:grid-cols-1 gap-2 flex-1 mb-0">
            <select v-model="newPrincipalType" data-testid="principal-type-select" :disabled="saving" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500">
              <option value="user">User</option>
              <option value="group">Group</option>
            </select>
            <select v-model="newPrincipalId" data-testid="principal-select" :disabled="saving || principalOptions.length === 0" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500">
              <option value="">Select {{ newPrincipalType }}</option>
              <option
                v-for="option in principalOptions"
                :key="`${newPrincipalType}-${option.id}`"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
            <select v-model="newPermission" data-testid="permission-select" :disabled="saving" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500">
              <option value="view">View</option>
              <option value="edit">Edit</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition" data-testid="add-permission-entry" @click="addEntry" :disabled="saving">
            Add Entry
          </button>
        </div>

        <div v-if="entries.length === 0" class="px-4 py-3 text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
          No explicit ACL entries. Organization role defaults apply.
        </div>
        <div v-else class="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div class="bg-slate-900 text-xs font-mono uppercase tracking-[0.07em] text-slate-300 grid grid-cols-[1fr_auto] px-4 py-3">
            <span>Principal</span>
            <span>Actions</span>
          </div>
          <div
            v-for="(entry, index) in entries"
            :key="`${entry.principal_type}-${entry.principal_id}`"
            class="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600 border-b border-slate-100 max-md:flex-col max-md:items-start"
            :data-testid="`permission-entry-${index}`"
          >
            <div class="flex flex-col min-w-0">
              <strong class="text-sm text-slate-900 truncate">{{ principalLabel(entry) }}</strong>
              <span class="mt-1 w-fit px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs uppercase tracking-wide">{{ entry.principal_type }}</span>
            </div>
            <div class="flex items-center gap-2 max-md:flex-col max-md:w-full max-md:items-start">
              <select
                :value="entry.permission"
                :data-testid="`entry-permission-${index}`"
                :disabled="saving"
                @change="updateEntryPermission(index, ($event.target as HTMLSelectElement).value as ResourcePermissionLevel)"
                class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500 max-md:w-full"
              >
                <option value="view">View</option>
                <option value="edit">Edit</option>
                <option value="admin">Admin</option>
              </select>
              <button
                class="text-rose-500 hover:text-rose-600 transition text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed max-md:w-full"
                :data-testid="`remove-entry-${index}`"
                @click="removeEntry(index)"
                :disabled="saving"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <div v-if="actionError" class="px-3 py-2 border border-rose-200 rounded-lg bg-rose-50 text-sm text-rose-600">{{ actionError }}</div>
        <div v-if="successMessage" class="px-3 py-2 border border-emerald-200 rounded-lg bg-emerald-50 text-sm text-emerald-600">{{ successMessage }}</div>

        <div class="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button class="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed" @click="closeModal" :disabled="saving">Close</button>
          <button class="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed" data-testid="save-folder-permissions" @click="savePermissions" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Permissions' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
