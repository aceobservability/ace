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
  <div class="fixed inset-0 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease-out]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="closeModal">
    <div class="modal" data-testid="folder-permissions-modal">
      <header class="modal-header">
        <div>
          <h2><Shield :size="18" /> Folder Permissions</h2>
          <p>{{ props.folder.name }}</p>
        </div>
        <button class="btn-icon" @click="closeModal" aria-label="Close permissions editor">
          <X :size="18" />
        </button>
      </header>

      <div v-if="loading" class="inline-state">Loading permissions...</div>
      <div v-else-if="error" class="error-message">{{ error }}</div>
      <div v-else class="content">
        <div class="add-entry-panel">
          <div class="form-row">
            <select v-model="newPrincipalType" data-testid="principal-type-select" :disabled="saving">
              <option value="user">User</option>
              <option value="group">Group</option>
            </select>
            <select v-model="newPrincipalId" data-testid="principal-select" :disabled="saving || principalOptions.length === 0">
              <option value="">Select {{ newPrincipalType }}</option>
              <option
                v-for="option in principalOptions"
                :key="`${newPrincipalType}-${option.id}`"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
            <select v-model="newPermission" data-testid="permission-select" :disabled="saving">
              <option value="view">View</option>
              <option value="edit">Edit</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button class="btn btn-secondary" data-testid="add-permission-entry" @click="addEntry" :disabled="saving">
            Add Entry
          </button>
        </div>

        <div v-if="entries.length === 0" class="inline-state">
          No explicit ACL entries. Organization role defaults apply.
        </div>
        <div v-else class="entries-list">
          <div
            v-for="(entry, index) in entries"
            :key="`${entry.principal_type}-${entry.principal_id}`"
            class="entry-row"
            :data-testid="`permission-entry-${index}`"
          >
            <div class="entry-principal">
              <strong>{{ principalLabel(entry) }}</strong>
              <span class="entry-type">{{ entry.principal_type }}</span>
            </div>
            <div class="entry-actions">
              <select
                :value="entry.permission"
                :data-testid="`entry-permission-${index}`"
                :disabled="saving"
                @change="updateEntryPermission(index, ($event.target as HTMLSelectElement).value as ResourcePermissionLevel)"
              >
                <option value="view">View</option>
                <option value="edit">Edit</option>
                <option value="admin">Admin</option>
              </select>
              <button
                class="btn btn-danger btn-sm"
                :data-testid="`remove-entry-${index}`"
                @click="removeEntry(index)"
                :disabled="saving"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <div v-if="actionError" class="error-message">{{ actionError }}</div>
        <div v-if="successMessage" class="success-message">{{ successMessage }}</div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeModal" :disabled="saving">Close</button>
          <button class="btn btn-primary" data-testid="save-folder-permissions" @click="savePermissions" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Permissions' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 10, 18, 0.76);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  width: min(760px, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow: auto;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 1rem;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.modal-header h2 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 1rem;
  font-family: var(--font-family-mono);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.modal-header p {
  margin: 0.25rem 0 0;
  color: var(--color-text-1);
  font-size: 0.82rem;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.add-entry-panel {
  padding: 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: rgba(20, 33, 52, 0.8);
}

.form-row {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr) 120px;
  gap: 0.6rem;
  margin-bottom: 0.65rem;
}

select {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-1);
  color: var(--color-text-0);
}

select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.entry-row {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: rgba(11, 19, 30, 0.55);
  padding: 0.75rem;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.entry-principal {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.entry-principal strong {
  font-size: 0.84rem;
  color: var(--color-text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-type {
  margin-top: 0.25rem;
  width: fit-content;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.18);
  color: var(--color-accent);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.entry-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.inline-state {
  padding: 0.8rem;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-text-1);
  font-size: 0.8rem;
}

.error-message {
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(251, 113, 133, 0.35);
  border-radius: 8px;
  background: rgba(251, 113, 133, 0.12);
  color: var(--color-danger);
  font-size: 0.82rem;
}

.success-message {
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(78, 205, 196, 0.35);
  border-radius: 8px;
  background: rgba(78, 205, 196, 0.12);
  color: var(--color-success);
  font-size: 0.82rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.55rem 0.8rem;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-sm {
  padding: 0.4rem 0.65rem;
  font-size: 0.78rem;
}

.btn-secondary {
  background: transparent;
  border-color: #F59E0B;
  color: #FCD34D;
}

.btn-primary {
  background: var(--color-accent);
  color: #1a0f00;
}

.btn-danger {
  background: var(--color-danger);
  color: white;
}

.btn-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-2);
  color: var(--color-text-1);
  cursor: pointer;
}

@media (max-width: 760px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .entry-row,
  .entry-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .entry-actions {
    width: 100%;
  }

  .entry-actions select,
  .entry-actions button {
    width: 100%;
  }
}
</style>
