<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, UserPlus, Trash2, Shield, Edit2, Users } from 'lucide-vue-next'
import type { Organization, Member, MembershipRole } from '../types/organization'
import type { UserGroup, UserGroupMembership } from '../types/rbac'
import {
  getOrganization,
  updateOrganization,
  deleteOrganization,
  listMembers,
  createInvitation,
  updateMemberRole,
  removeMember,
} from '../api/organizations'
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroupMembers,
  addGroupMember,
  removeGroupMember,
} from '../api/groups'
import {
  getGoogleSSOConfig,
  updateGoogleSSOConfig,
  getMicrosoftSSOConfig,
  updateMicrosoftSSOConfig,
} from '../api/sso'
import { useOrganization } from '../composables/useOrganization'
import DataSourceSettingsPanel from '../components/DataSourceSettingsPanel.vue'

const route = useRoute()
const router = useRouter()
const { fetchOrganizations } = useOrganization()

const orgId = computed(() => route.params.id as string)
const org = ref<Organization | null>(null)
const members = ref<Member[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Edit form
const editMode = ref(false)
const editName = ref('')
const editSlug = ref('')
const editLoading = ref(false)
const editError = ref<string | null>(null)

// Invite form
const showInviteForm = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<MembershipRole>('viewer')
const inviteLoading = ref(false)
const inviteError = ref<string | null>(null)
const inviteSuccess = ref<string | null>(null)

// Delete confirmation
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)

// Groups
const groups = ref<UserGroup[]>([])
const groupsLoading = ref(false)
const groupsError = ref<string | null>(null)
const groupMessage = ref<string | null>(null)
const groupActionError = ref<string | null>(null)

const showCreateGroupForm = ref(false)
const createGroupName = ref('')
const createGroupDescription = ref('')
const createGroupLoading = ref(false)

const editingGroupId = ref<string | null>(null)
const editGroupName = ref('')
const editGroupDescription = ref('')
const groupUpdateLoading = ref(false)

const expandedGroupIds = ref<string[]>([])
const groupMembersById = ref<Record<string, UserGroupMembership[]>>({})
const groupMembersLoading = ref<Record<string, boolean>>({})
const groupMembersError = ref<Record<string, string | null>>({})
const addMemberUserId = ref<Record<string, string>>({})
const groupMemberActionLoading = ref<Record<string, boolean>>({})

// SSO settings
const ssoLoading = ref(false)
const ssoNotice = ref<string | null>(null)

const googleClientId = ref('')
const googleClientSecret = ref('')
const googleEnabled = ref(false)
const googleConfigured = ref(false)
const googleSaving = ref(false)
const googleError = ref<string | null>(null)

const microsoftTenantId = ref('')
const microsoftClientId = ref('')
const microsoftClientSecret = ref('')
const microsoftEnabled = ref(false)
const microsoftConfigured = ref(false)
const microsoftSaving = ref(false)
const microsoftError = ref<string | null>(null)

type SsoProviderKey = 'google' | 'microsoft'

const activeSsoProvider = ref<SsoProviderKey | null>(null)
const ssoDialogOpen = ref(false)
const ssoSelectionMode = ref<'configure' | 'add'>('configure')
const ssoStep = ref<'picker' | 'form'>('picker')
const ssoProviders = computed(() => [
  {
    key: 'google' as const,
    name: 'Google',
    configured: googleConfigured.value,
    enabled: googleEnabled.value,
  },
  {
    key: 'microsoft' as const,
    name: 'Microsoft',
    configured: microsoftConfigured.value,
    enabled: microsoftEnabled.value,
  },
])

const configuredSsoProviders = computed(() =>
  ssoProviders.value.filter((provider) => provider.configured),
)

const activeSsoLabel = computed(() => {
  const provider = ssoProviders.value.find((item) => item.key === activeSsoProvider.value)
  return provider?.name ?? ''
})

const isAdmin = computed(() => org.value?.role === 'admin')

type SettingsSection = 'general' | 'members' | 'groups' | 'datasources'

const settingsSections: Array<{ key: SettingsSection; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'members', label: 'Members' },
  { key: 'groups', label: 'Groups' },
  { key: 'datasources', label: 'Data Sources' },
]

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return value === 'general' || value === 'members' || value === 'groups' || value === 'datasources'
}

const activeSection = computed<SettingsSection>(() => {
  const section = route.params.section as string | undefined
  return isSettingsSection(section) ? section : 'general'
})

function sectionPath(section: SettingsSection): string {
  return `/app/settings/org/${orgId.value}/${section}`
}

function navigateToSection(section: SettingsSection) {
  if (section === activeSection.value) {
    return
  }

  router.push(sectionPath(section))
}

watch(
  () => route.params.section,
  (section) => {
    const sectionValue = section as string | undefined
    if (!isSettingsSection(sectionValue)) {
      router.replace(sectionPath('general'))
    }
  },
  { immediate: true },
)

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const [orgData, membersData] = await Promise.all([
      getOrganization(orgId.value),
      listMembers(orgId.value),
    ])
    org.value = orgData
    members.value = membersData
    editName.value = orgData.name
    editSlug.value = orgData.slug
    await Promise.all([loadGroups(), loadSSOConfigs()])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load organization'
  } finally {
    loading.value = false
  }
}

function resetSSOMessages() {
  ssoNotice.value = null
  googleError.value = null
  microsoftError.value = null
}

function openSsoProvider(provider: SsoProviderKey) {
  ssoDialogOpen.value = true
  ssoStep.value = 'form'
  activeSsoProvider.value = provider
  resetSSOMessages()
}

function openSsoPicker(mode: 'configure' | 'add') {
  if (!isAdmin.value) {
    return
  }

  if (mode === 'add' && ssoProviders.value.every((provider) => provider.configured)) {
    ssoNotice.value = 'All supported providers are already configured'
    return
  }

  ssoDialogOpen.value = true
  ssoSelectionMode.value = mode
  ssoStep.value = 'picker'
  activeSsoProvider.value = null
  resetSSOMessages()
}

function closeSsoDialog() {
  ssoDialogOpen.value = false
  ssoStep.value = 'picker'
  activeSsoProvider.value = null
  resetSSOMessages()
}

const selectableSsoProviders = computed(() => {
  if (ssoSelectionMode.value === 'add') {
    return ssoProviders.value.filter((provider) => !provider.configured)
  }

  return ssoProviders.value
})

function chooseSsoProvider(provider: SsoProviderKey) {
  openSsoProvider(provider)
}

function ssoStatus(provider: { configured: boolean; enabled: boolean }) {
  if (provider.enabled) {
    return 'Enabled'
  }

  if (provider.configured) {
    return 'Disabled'
  }

  return 'Not configured'
}

function handleAddSso() {
  openSsoPicker('add')
}

async function loadGoogleConfig() {
  googleError.value = null
  googleClientSecret.value = ''

  try {
    const config = await getGoogleSSOConfig(orgId.value)
    googleClientId.value = config.client_id
    googleEnabled.value = config.enabled
    googleConfigured.value = true
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load Google SSO settings'
    if (message === 'Google SSO not configured') {
      googleClientId.value = ''
      googleEnabled.value = false
      googleConfigured.value = false
      return
    }

    googleError.value = message
  }
}

async function loadMicrosoftConfig() {
  microsoftError.value = null
  microsoftClientSecret.value = ''

  try {
    const config = await getMicrosoftSSOConfig(orgId.value)
    microsoftTenantId.value = config.tenant_id
    microsoftClientId.value = config.client_id
    microsoftEnabled.value = config.enabled
    microsoftConfigured.value = true
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load Microsoft SSO settings'
    if (message === 'Microsoft SSO not configured') {
      microsoftTenantId.value = ''
      microsoftClientId.value = ''
      microsoftEnabled.value = false
      microsoftConfigured.value = false
      return
    }

    microsoftError.value = message
  }
}

async function loadSSOConfigs() {
  ssoLoading.value = true
  resetSSOMessages()

  await Promise.all([loadGoogleConfig(), loadMicrosoftConfig()])

  ssoLoading.value = false
}

async function loadGroups() {
  groupsLoading.value = true
  groupsError.value = null
  try {
    groups.value = await listGroups(orgId.value)
    const validGroupIds = new Set(groups.value.map((group) => group.id))
    expandedGroupIds.value = expandedGroupIds.value.filter((groupId) => validGroupIds.has(groupId))
  } catch (e) {
    groups.value = []
    groupsError.value = e instanceof Error ? e.message : 'Failed to load groups'
  } finally {
    groupsLoading.value = false
  }
}

function startEdit() {
  editMode.value = true
  editName.value = org.value?.name || ''
  editSlug.value = org.value?.slug || ''
  editError.value = null
}

function cancelEdit() {
  editMode.value = false
  editError.value = null
}

async function saveEdit() {
  if (!editName.value.trim()) {
    editError.value = 'Name is required'
    return
  }

  editLoading.value = true
  editError.value = null
  try {
    org.value = await updateOrganization(orgId.value, {
      name: editName.value.trim(),
      slug: editSlug.value.trim(),
    })
    editMode.value = false
    await fetchOrganizations()
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Failed to update organization'
  } finally {
    editLoading.value = false
  }
}

async function handleInvite() {
  if (!inviteEmail.value.trim()) {
    inviteError.value = 'Email is required'
    return
  }

  inviteLoading.value = true
  inviteError.value = null
  inviteSuccess.value = null
  try {
    const invitation = await createInvitation(orgId.value, {
      email: inviteEmail.value.trim(),
      role: inviteRole.value,
    })
    inviteSuccess.value = `Invitation sent! Token: ${invitation.token}`
    inviteEmail.value = ''
    inviteRole.value = 'viewer'
  } catch (e) {
    inviteError.value = e instanceof Error ? e.message : 'Failed to send invitation'
  } finally {
    inviteLoading.value = false
  }
}

async function handleRoleChange(member: Member, newRole: MembershipRole) {
  try {
    await updateMemberRole(orgId.value, member.user_id, { role: newRole })
    member.role = newRole
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to update role')
  }
}

async function handleRemoveMember(member: Member) {
  if (!confirm(`Remove ${member.email} from this organization?`)) {
    return
  }
  try {
    await removeMember(orgId.value, member.user_id)
    members.value = members.value.filter((m) => m.id !== member.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to remove member')
  }
}

async function handleDelete() {
  deleteLoading.value = true
  try {
    await deleteOrganization(orgId.value)
    await fetchOrganizations()
    router.push('/app/dashboards')
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to delete organization')
  } finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
  }
}

function resetGroupMessages() {
  groupMessage.value = null
  groupActionError.value = null
}

function startCreateGroup() {
  showCreateGroupForm.value = true
  createGroupName.value = ''
  createGroupDescription.value = ''
  resetGroupMessages()
}

function cancelCreateGroup() {
  showCreateGroupForm.value = false
  createGroupName.value = ''
  createGroupDescription.value = ''
  resetGroupMessages()
}

async function handleCreateGroup() {
  const name = createGroupName.value.trim()
  if (!name) {
    groupActionError.value = 'Group name is required'
    return
  }

  createGroupLoading.value = true
  resetGroupMessages()
  try {
    await createGroup(orgId.value, {
      name,
      description: createGroupDescription.value.trim() || undefined,
    })
    groupMessage.value = 'Group created'
    showCreateGroupForm.value = false
    createGroupName.value = ''
    createGroupDescription.value = ''
    await loadGroups()
  } catch (e) {
    groupActionError.value = e instanceof Error ? e.message : 'Failed to create group'
  } finally {
    createGroupLoading.value = false
  }
}

function startEditGroup(group: UserGroup) {
  editingGroupId.value = group.id
  editGroupName.value = group.name
  editGroupDescription.value = group.description || ''
  resetGroupMessages()
}

function cancelEditGroup() {
  editingGroupId.value = null
  editGroupName.value = ''
  editGroupDescription.value = ''
  resetGroupMessages()
}

async function handleUpdateGroup(group: UserGroup) {
  const name = editGroupName.value.trim()
  if (!name) {
    groupActionError.value = 'Group name is required'
    return
  }

  groupUpdateLoading.value = true
  resetGroupMessages()
  try {
    await updateGroup(orgId.value, group.id, {
      name,
      description: editGroupDescription.value.trim() || undefined,
    })
    groupMessage.value = 'Group updated'
    editingGroupId.value = null
    editGroupName.value = ''
    editGroupDescription.value = ''
    await loadGroups()
  } catch (e) {
    groupActionError.value = e instanceof Error ? e.message : 'Failed to update group'
  } finally {
    groupUpdateLoading.value = false
  }
}

async function handleDeleteGroup(group: UserGroup) {
  if (!confirm(`Delete group "${group.name}"?`)) {
    return
  }

  groupMemberActionLoading.value = {
    ...groupMemberActionLoading.value,
    [group.id]: true,
  }
  resetGroupMessages()
  try {
    await deleteGroup(orgId.value, group.id)
    groupMessage.value = 'Group deleted'
    delete groupMembersById.value[group.id]
    await loadGroups()
  } catch (e) {
    groupActionError.value = e instanceof Error ? e.message : 'Failed to delete group'
  } finally {
    groupMemberActionLoading.value = {
      ...groupMemberActionLoading.value,
      [group.id]: false,
    }
  }
}

function isGroupExpanded(groupId: string): boolean {
  return expandedGroupIds.value.includes(groupId)
}

function groupMemberCount(groupId: string): number {
  return groupMembersById.value[groupId]?.length || 0
}

function availableMembersForGroup(groupId: string): Member[] {
  const existing = new Set((groupMembersById.value[groupId] || []).map((member) => member.user_id))
  return members.value.filter((member) => !existing.has(member.user_id))
}

async function loadGroupMembers(groupId: string) {
  groupMembersLoading.value = {
    ...groupMembersLoading.value,
    [groupId]: true,
  }
  groupMembersError.value = {
    ...groupMembersError.value,
    [groupId]: null,
  }
  try {
    groupMembersById.value = {
      ...groupMembersById.value,
      [groupId]: await listGroupMembers(orgId.value, groupId),
    }
  } catch (e) {
    groupMembersError.value = {
      ...groupMembersError.value,
      [groupId]: e instanceof Error ? e.message : 'Failed to load group members',
    }
  } finally {
    groupMembersLoading.value = {
      ...groupMembersLoading.value,
      [groupId]: false,
    }
  }
}

async function toggleGroupMembers(groupId: string) {
  if (isGroupExpanded(groupId)) {
    expandedGroupIds.value = expandedGroupIds.value.filter((id) => id !== groupId)
    return
  }

  expandedGroupIds.value = [...expandedGroupIds.value, groupId]
  if (!groupMembersById.value[groupId] && !groupMembersLoading.value[groupId]) {
    await loadGroupMembers(groupId)
  }
}

async function handleAddGroupMember(groupId: string) {
  const userId = addMemberUserId.value[groupId]
  if (!userId) {
    groupMembersError.value = {
      ...groupMembersError.value,
      [groupId]: 'Select a member to add',
    }
    return
  }

  groupMemberActionLoading.value = {
    ...groupMemberActionLoading.value,
    [groupId]: true,
  }
  groupMembersError.value = {
    ...groupMembersError.value,
    [groupId]: null,
  }
  resetGroupMessages()

  try {
    await addGroupMember(orgId.value, groupId, { user_id: userId })
    addMemberUserId.value = {
      ...addMemberUserId.value,
      [groupId]: '',
    }
    groupMessage.value = 'Group member added'
    await loadGroupMembers(groupId)
  } catch (e) {
    groupMembersError.value = {
      ...groupMembersError.value,
      [groupId]: e instanceof Error ? e.message : 'Failed to add group member',
    }
  } finally {
    groupMemberActionLoading.value = {
      ...groupMemberActionLoading.value,
      [groupId]: false,
    }
  }
}

async function handleRemoveGroupMember(groupId: string, membership: UserGroupMembership) {
  if (!confirm(`Remove ${membership.email} from this group?`)) {
    return
  }

  groupMemberActionLoading.value = {
    ...groupMemberActionLoading.value,
    [groupId]: true,
  }
  groupMembersError.value = {
    ...groupMembersError.value,
    [groupId]: null,
  }
  resetGroupMessages()

  try {
    await removeGroupMember(orgId.value, groupId, membership.user_id)
    groupMessage.value = 'Group member removed'
    await loadGroupMembers(groupId)
  } catch (e) {
    groupMembersError.value = {
      ...groupMembersError.value,
      [groupId]: e instanceof Error ? e.message : 'Failed to remove group member',
    }
  } finally {
    groupMemberActionLoading.value = {
      ...groupMemberActionLoading.value,
      [groupId]: false,
    }
  }
}

async function handleSaveGoogleSSO() {
  if (!isAdmin.value) {
    return
  }

  const clientId = googleClientId.value.trim()
  const clientSecret = googleClientSecret.value.trim()

  if (!clientId) {
    googleError.value = 'Google client ID is required'
    return
  }

  if (!clientSecret) {
    googleError.value = 'Google client secret is required'
    return
  }

  googleSaving.value = true
  googleError.value = null
  ssoNotice.value = null

  try {
    const updated = await updateGoogleSSOConfig(orgId.value, {
      client_id: clientId,
      client_secret: clientSecret,
      enabled: googleEnabled.value,
    })
    googleClientId.value = updated.client_id
    googleEnabled.value = updated.enabled
    googleConfigured.value = true
    googleClientSecret.value = ''
    ssoNotice.value = 'Google SSO settings saved'
  } catch (e) {
    googleError.value = e instanceof Error ? e.message : 'Failed to save Google SSO settings'
  } finally {
    googleSaving.value = false
  }
}

async function handleSaveMicrosoftSSO() {
  if (!isAdmin.value) {
    return
  }

  const tenantId = microsoftTenantId.value.trim()
  const clientId = microsoftClientId.value.trim()
  const clientSecret = microsoftClientSecret.value.trim()

  if (!tenantId) {
    microsoftError.value = 'Microsoft tenant ID is required'
    return
  }

  if (!clientId) {
    microsoftError.value = 'Microsoft client ID is required'
    return
  }

  if (!clientSecret) {
    microsoftError.value = 'Microsoft client secret is required'
    return
  }

  microsoftSaving.value = true
  microsoftError.value = null
  ssoNotice.value = null

  try {
    const updated = await updateMicrosoftSSOConfig(orgId.value, {
      tenant_id: tenantId,
      client_id: clientId,
      client_secret: clientSecret,
      enabled: microsoftEnabled.value,
    })
    microsoftTenantId.value = updated.tenant_id
    microsoftClientId.value = updated.client_id
    microsoftEnabled.value = updated.enabled
    microsoftConfigured.value = true
    microsoftClientSecret.value = ''
    ssoNotice.value = 'Microsoft SSO settings saved'
  } catch (e) {
    microsoftError.value = e instanceof Error ? e.message : 'Failed to save Microsoft SSO settings'
  } finally {
    microsoftSaving.value = false
  }
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="org-settings">
    <header class="page-header">
      <button class="btn-back" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <div class="header-content">
        <h1>Organization Settings</h1>
        <p v-if="org">{{ org.name }}</p>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="org" class="settings-layout">
      <aside class="settings-sidebar" data-testid="org-settings-sidebar">
        <button
          v-for="section in settingsSections"
          :key="section.key"
          class="settings-sidebar-link"
          :class="{ active: activeSection === section.key }"
          :data-testid="`settings-section-${section.key}`"
          @click="navigateToSection(section.key)"
        >
          {{ section.label }}
        </button>
      </aside>

      <div class="settings-content">
      <!-- General Settings -->
      <section v-if="activeSection === 'general'" class="settings-section">
        <div class="section-header">
          <h2>General</h2>
          <button v-if="isAdmin && !editMode" class="btn btn-secondary btn-sm" @click="startEdit">
            <Edit2 :size="16" />
            Edit
          </button>
        </div>

        <div v-if="editMode" class="edit-form">
          <div class="form-group">
            <label>Organization Name</label>
            <input v-model="editName" type="text" :disabled="editLoading" />
          </div>
          <div class="form-group">
            <label>URL Slug</label>
            <input v-model="editSlug" type="text" :disabled="editLoading" />
          </div>
          <div v-if="editError" class="error-message">{{ editError }}</div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="cancelEdit" :disabled="editLoading">Cancel</button>
            <button class="btn btn-primary" @click="saveEdit" :disabled="editLoading">
              {{ editLoading ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
        <div v-else class="info-grid">
          <div class="info-item">
            <span class="info-label">Name</span>
            <span class="info-value">{{ org.name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Slug</span>
            <span class="info-value">{{ org.slug }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Your Role</span>
            <span class="info-value role-badge" :class="org.role">{{ org.role }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Created</span>
            <span class="info-value">{{ new Date(org.created_at).toLocaleDateString() }}</span>
          </div>
        </div>
      </section>

      <!-- Members Section -->
      <section v-if="activeSection === 'members'" class="settings-section">
        <div class="section-header">
          <h2><Users :size="20" /> Members ({{ members.length }})</h2>
          <button v-if="isAdmin" class="btn btn-primary btn-sm" @click="showInviteForm = !showInviteForm">
            <UserPlus :size="16" />
            Invite
          </button>
        </div>

        <!-- Invite Form -->
        <div v-if="showInviteForm && isAdmin" class="invite-form">
          <div class="form-row">
            <input
              v-model="inviteEmail"
              type="email"
              placeholder="Email address"
              :disabled="inviteLoading"
            />
            <select v-model="inviteRole" :disabled="inviteLoading">
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn btn-primary" @click="handleInvite" :disabled="inviteLoading">
              {{ inviteLoading ? 'Sending...' : 'Send Invite' }}
            </button>
          </div>
          <div v-if="inviteError" class="error-message">{{ inviteError }}</div>
          <div v-if="inviteSuccess" class="success-message">{{ inviteSuccess }}</div>
        </div>

        <!-- Members List -->
        <div class="members-list">
          <div v-for="member in members" :key="member.id" class="member-item">
            <div class="member-avatar">
              {{ (member.name || member.email).charAt(0).toUpperCase() }}
            </div>
            <div class="member-info">
              <span class="member-name">{{ member.name || member.email }}</span>
              <span class="member-email">{{ member.email }}</span>
            </div>
            <div class="member-actions">
              <select
                v-if="isAdmin"
                :value="member.role"
                @change="handleRoleChange(member, ($event.target as HTMLSelectElement).value as MembershipRole)"
                class="role-select"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <span v-else class="role-badge" :class="member.role">{{ member.role }}</span>
              <button
                v-if="isAdmin"
                class="btn-icon danger"
                @click="handleRemoveMember(member)"
                title="Remove member"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Groups Section -->
      <section v-if="activeSection === 'groups'" class="settings-section">
        <div class="section-header">
          <h2><Users :size="20" /> Groups ({{ groups.length }})</h2>
          <button
            v-if="isAdmin && !showCreateGroupForm"
            class="btn btn-primary btn-sm"
            data-testid="new-group-button"
            @click="startCreateGroup"
          >
            New Group
          </button>
        </div>

        <div v-if="groupMessage" class="success-message">{{ groupMessage }}</div>
        <div v-if="groupActionError" class="error-message">{{ groupActionError }}</div>

        <div v-if="showCreateGroupForm && isAdmin" class="group-form">
          <div class="form-group">
            <label>Group Name</label>
            <input v-model="createGroupName" type="text" data-testid="create-group-name" :disabled="createGroupLoading" />
          </div>
          <div class="form-group">
            <label>Description (optional)</label>
            <input
              v-model="createGroupDescription"
              type="text"
              data-testid="create-group-description"
              :disabled="createGroupLoading"
            />
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="cancelCreateGroup" :disabled="createGroupLoading">
              Cancel
            </button>
            <button
              class="btn btn-primary"
              data-testid="create-group-submit"
              @click="handleCreateGroup"
              :disabled="createGroupLoading"
            >
              {{ createGroupLoading ? 'Creating...' : 'Create Group' }}
            </button>
          </div>
        </div>

        <div v-if="groupsLoading" class="inline-state">Loading groups...</div>
        <div v-else-if="groupsError" class="error-message">{{ groupsError }}</div>
        <div v-else-if="groups.length === 0" class="inline-state">
          No groups yet. {{ isAdmin ? 'Create one to organize access.' : '' }}
        </div>
        <div v-else class="groups-list">
          <article v-for="group in groups" :key="group.id" class="group-card" :data-testid="`group-card-${group.id}`">
            <div class="group-header-row">
              <div class="group-header-content">
                <h3>{{ group.name }}</h3>
                <p v-if="group.description" class="group-description">{{ group.description }}</p>
                <p v-else class="group-description muted">No description</p>
                <span class="group-meta">{{ groupMemberCount(group.id) }} members</span>
              </div>
              <div class="group-header-actions">
                <button
                  class="btn btn-secondary btn-sm"
                  :data-testid="`toggle-group-members-${group.id}`"
                  @click="toggleGroupMembers(group.id)"
                >
                  {{ isGroupExpanded(group.id) ? 'Hide Members' : 'Show Members' }}
                </button>
                <template v-if="isAdmin && editingGroupId !== group.id">
                  <button
                    class="btn btn-secondary btn-sm"
                    :data-testid="`rename-group-${group.id}`"
                    @click="startEditGroup(group)"
                  >
                    Rename
                  </button>
                  <button
                    class="btn btn-danger btn-sm"
                    :data-testid="`delete-group-${group.id}`"
                    @click="handleDeleteGroup(group)"
                    :disabled="groupMemberActionLoading[group.id]"
                  >
                    Delete
                  </button>
                </template>
              </div>
            </div>

            <div v-if="isAdmin && editingGroupId === group.id" class="group-form group-edit-form">
              <div class="form-group">
                <label>Group Name</label>
                <input v-model="editGroupName" type="text" data-testid="edit-group-name" :disabled="groupUpdateLoading" />
              </div>
              <div class="form-group">
                <label>Description (optional)</label>
                <input
                  v-model="editGroupDescription"
                  type="text"
                  data-testid="edit-group-description"
                  :disabled="groupUpdateLoading"
                />
              </div>
              <div class="form-actions">
                <button class="btn btn-secondary" @click="cancelEditGroup" :disabled="groupUpdateLoading">
                  Cancel
                </button>
                <button
                  class="btn btn-primary"
                  :data-testid="`save-group-${group.id}`"
                  @click="handleUpdateGroup(group)"
                  :disabled="groupUpdateLoading"
                >
                  {{ groupUpdateLoading ? 'Saving...' : 'Save Group' }}
                </button>
              </div>
            </div>

            <div v-if="isGroupExpanded(group.id)" class="group-members-panel">
              <div v-if="groupMembersLoading[group.id]" class="inline-state">Loading group members...</div>
              <div v-else-if="groupMembersError[group.id]" class="error-message">
                {{ groupMembersError[group.id] }}
              </div>
              <template v-else>
                <div v-if="isAdmin" class="group-member-add-row">
                  <select
                    v-model="addMemberUserId[group.id]"
                    :data-testid="`add-member-select-${group.id}`"
                    :disabled="groupMemberActionLoading[group.id]"
                  >
                    <option value="">Select member</option>
                    <option
                      v-for="member in availableMembersForGroup(group.id)"
                      :key="member.user_id"
                      :value="member.user_id"
                    >
                      {{ member.name || member.email }} ({{ member.email }})
                    </option>
                  </select>
                  <button
                    class="btn btn-primary"
                    :data-testid="`add-member-button-${group.id}`"
                    @click="handleAddGroupMember(group.id)"
                    :disabled="groupMemberActionLoading[group.id] || availableMembersForGroup(group.id).length === 0"
                  >
                    Add to Group
                  </button>
                </div>

                <div v-if="(groupMembersById[group.id] || []).length === 0" class="inline-state">
                  No members in this group.
                </div>
                <div v-else class="group-members-list">
                  <div v-for="membership in groupMembersById[group.id]" :key="membership.id" class="group-member-item">
                    <div class="group-member-info">
                      <strong>{{ membership.name || membership.email }}</strong>
                      <span>{{ membership.email }}</span>
                    </div>
                    <button
                      v-if="isAdmin"
                      class="btn btn-secondary btn-sm"
                      :data-testid="`remove-member-${group.id}-${membership.user_id}`"
                      @click="handleRemoveGroupMember(group.id, membership)"
                      :disabled="groupMemberActionLoading[group.id]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </article>
        </div>
      </section>

      <!-- Data Sources Section -->
      <section v-if="activeSection === 'datasources'" class="settings-section">
        <div class="section-header">
          <h2>Data Sources</h2>
          <p class="section-desc">Configure connections to Prometheus, Loki, Tempo, VictoriaMetrics, and other data sources for this organisation.</p>
        </div>
        <DataSourceSettingsPanel :org-id="orgId" />
      </section>

      <!-- SSO Section -->
      <section v-if="activeSection === 'general'" class="settings-section">
        <div class="section-header">
          <h2><Shield :size="20" /> Single Sign-On</h2>
          <div v-if="isAdmin" class="section-actions">
            <button class="btn btn-primary btn-sm" data-testid="add-authentication" @click="handleAddSso">
              Add Authentication
            </button>
          </div>
        </div>
        <p class="section-description">Manage identity provider connections for this organization.</p>

        <div v-if="!isAdmin" class="inline-state">Only organization admins can update SSO settings.</div>

        <div v-if="ssoLoading" class="inline-state">Loading SSO settings...</div>
        <div v-else class="sso-list">
          <div class="sso-provider-list">
            <article class="sso-provider-row" data-testid="sso-provider-password">
              <div class="sso-provider-info">
                <h3>Email/Password</h3>
                <p class="sso-provider-meta">Built-in authentication method available for all organizations.</p>
              </div>
              <div class="sso-provider-actions">
                <span class="sso-status enabled">Enabled</span>
              </div>
            </article>

            <article
              v-for="provider in configuredSsoProviders"
              :key="provider.key"
              class="sso-provider-row"
              :data-testid="`sso-provider-${provider.key}`"
            >
              <div class="sso-provider-info">
                <h3>{{ provider.name }}</h3>
                <p class="sso-provider-meta">
                  {{ provider.configured ? 'Configured for this org.' : 'Not configured yet.' }}
                </p>
              </div>
              <div class="sso-provider-actions">
                <span
                  class="sso-status"
                  :class="{ enabled: provider.enabled, configured: provider.configured }"
                >
                  {{ ssoStatus(provider) }}
                </span>
                <button
                  v-if="isAdmin"
                  class="btn btn-secondary btn-sm"
                  :data-testid="`edit-sso-${provider.key}`"
                  @click="openSsoProvider(provider.key)"
                >
                  <Edit2 :size="14" />
                  Settings
                </button>
              </div>
              <div
                v-if="provider.key === 'google' && googleError && activeSsoProvider !== 'google'"
                class="error-message"
              >
                {{ googleError }}
              </div>
              <div
                v-if="provider.key === 'microsoft' && microsoftError && activeSsoProvider !== 'microsoft'"
                class="error-message"
              >
                {{ microsoftError }}
              </div>
            </article>

            <div v-if="configuredSsoProviders.length === 0" class="inline-state">
              No external authentication methods configured yet.
            </div>

            <div v-if="googleError && activeSsoProvider !== 'google'" class="error-message">
              {{ googleError }}
            </div>

            <div v-if="microsoftError && activeSsoProvider !== 'microsoft'" class="error-message">
              {{ microsoftError }}
            </div>
          </div>

        </div>

        <div v-if="ssoNotice" class="success-message">{{ ssoNotice }}</div>
      </section>

      <!-- Danger Zone -->
      <section v-if="activeSection === 'general' && isAdmin" class="settings-section danger-zone">
        <div class="section-header">
          <h2><Shield :size="20" /> Danger Zone</h2>
        </div>
        <div class="danger-content">
          <div class="danger-item">
            <div class="danger-info">
              <strong>Delete Organization</strong>
              <p>Permanently delete this organization and all its data. This action cannot be undone.</p>
            </div>
            <button class="btn btn-danger" @click="showDeleteConfirm = true">Delete Organization</button>
          </div>
        </div>
      </section>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal modal-sm">
        <h3>Delete Organization?</h3>
        <p>
          This will permanently delete <strong>{{ org?.name }}</strong> and all its dashboards, panels, and
          settings. This action cannot be undone.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteConfirm = false" :disabled="deleteLoading">
            Cancel
          </button>
          <button class="btn btn-danger" @click="handleDelete" :disabled="deleteLoading">
            {{ deleteLoading ? 'Deleting...' : 'Delete Organization' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="ssoDialogOpen" class="modal-overlay" data-testid="sso-config-modal" @click.self="closeSsoDialog">
      <div class="modal sso-modal">
        <div class="sso-panel-header">
          <div>
            <h3 v-if="ssoStep === 'picker'" data-testid="sso-provider-picker-title">Choose SSO provider</h3>
            <h3 v-else>{{ activeSsoLabel }} SSO Settings</h3>
            <p class="section-description" v-if="ssoStep === 'picker'">
              Select a provider to {{ ssoSelectionMode === 'add' ? 'add to this organization' : 'configure' }}.
            </p>
            <p class="section-description" v-else>Update credentials and enable status for this provider.</p>
          </div>
          <button class="btn btn-secondary btn-sm" data-testid="close-sso-config" @click="closeSsoDialog">
            Close
          </button>
        </div>

        <div v-if="ssoStep === 'picker'" class="sso-picker-list">
          <button
            v-for="provider in selectableSsoProviders"
            :key="provider.key"
            type="button"
            class="sso-picker-option"
            :data-testid="`sso-provider-option-${provider.key}`"
            @click="chooseSsoProvider(provider.key)"
          >
            <span class="sso-picker-name">{{ provider.name }}</span>
            <span class="sso-status" :class="{ enabled: provider.enabled, configured: provider.configured }">
              {{ ssoStatus(provider) }}
            </span>
          </button>
        </div>

        <div v-else class="sso-config-panel" data-testid="sso-config-panel">
          <div v-if="activeSsoProvider === 'google'" data-testid="google-sso-card">
            <div class="form-group">
              <label>Client ID</label>
              <input
                v-model="googleClientId"
                type="text"
                data-testid="google-client-id"
                :disabled="!isAdmin || googleSaving"
              />
            </div>
            <div class="form-group">
              <label>Client Secret</label>
              <input
                v-model="googleClientSecret"
                type="password"
                data-testid="google-client-secret"
                placeholder="Enter to update"
                :disabled="!isAdmin || googleSaving"
              />
            </div>
            <div class="form-group form-checkbox">
              <label>
                <input
                  v-model="googleEnabled"
                  type="checkbox"
                  data-testid="google-enabled"
                  :disabled="!isAdmin || googleSaving"
                />
                Enable Google SSO
              </label>
            </div>

            <div v-if="googleError" class="error-message">{{ googleError }}</div>

            <div v-if="isAdmin" class="form-actions sso-actions">
              <button class="btn btn-secondary" data-testid="back-sso-provider-picker" @click="ssoStep = 'picker'">
                Back
              </button>
              <button
                class="btn btn-primary"
                data-testid="save-google-sso"
                :disabled="googleSaving"
                @click="handleSaveGoogleSSO"
              >
                {{ googleSaving ? 'Saving...' : 'Save Google SSO' }}
              </button>
            </div>
          </div>

          <div v-else-if="activeSsoProvider === 'microsoft'" data-testid="microsoft-sso-card">
            <div class="form-group">
              <label>Tenant ID</label>
              <input
                v-model="microsoftTenantId"
                type="text"
                data-testid="microsoft-tenant-id"
                :disabled="!isAdmin || microsoftSaving"
              />
            </div>
            <div class="form-group">
              <label>Client ID</label>
              <input
                v-model="microsoftClientId"
                type="text"
                data-testid="microsoft-client-id"
                :disabled="!isAdmin || microsoftSaving"
              />
            </div>
            <div class="form-group">
              <label>Client Secret</label>
              <input
                v-model="microsoftClientSecret"
                type="password"
                data-testid="microsoft-client-secret"
                placeholder="Enter to update"
                :disabled="!isAdmin || microsoftSaving"
              />
            </div>
            <div class="form-group form-checkbox">
              <label>
                <input
                  v-model="microsoftEnabled"
                  type="checkbox"
                  data-testid="microsoft-enabled"
                  :disabled="!isAdmin || microsoftSaving"
                />
                Enable Microsoft SSO
              </label>
            </div>

            <div v-if="microsoftError" class="error-message">{{ microsoftError }}</div>

            <div v-if="isAdmin" class="form-actions sso-actions">
              <button class="btn btn-secondary" data-testid="back-sso-provider-picker" @click="ssoStep = 'picker'">
                Back
              </button>
              <button
                class="btn btn-primary"
                data-testid="save-microsoft-sso"
                :disabled="microsoftSaving"
                @click="handleSaveMicrosoftSSO"
              >
                {{ microsoftSaving ? 'Saving...' : 'Save Microsoft SSO' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.org-settings {
  padding: 1.35rem 1.5rem;
  max-width: 980px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.2rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.btn-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--surface-2);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-back:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-content h1 {
  margin: 0 0 0.25rem 0;
  font-size: 1.03rem;
  font-weight: 700;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.header-content p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.loading,
.error {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.error {
  color: var(--accent-danger);
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  padding: 0.75rem;
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 1rem;
}

.settings-sidebar-link {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text-secondary);
  padding: 0.65rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-sidebar-link:hover {
  color: var(--text-primary);
  border-color: rgba(125, 211, 252, 0.22);
  background: rgba(31, 49, 73, 0.64);
}

.settings-sidebar-link.active {
  color: #bde9ff;
  border-color: rgba(56, 189, 248, 0.34);
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.18), rgba(52, 211, 153, 0.1));
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-section {
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: var(--shadow-sm);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.section-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.section-description {
  margin: 0 0 0.75rem 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.sso-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sso-provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sso-provider-row {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: rgba(20, 33, 52, 0.75);
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.sso-provider-info h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.sso-provider-meta {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.sso-provider-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.sso-status {
  font-size: 0.75rem;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
}

.sso-status.enabled {
  color: var(--accent-success);
  border-color: rgba(78, 205, 196, 0.45);
  background: rgba(78, 205, 196, 0.1);
}

.sso-status.configured:not(.enabled) {
  color: var(--accent-warning);
  border-color: rgba(255, 159, 67, 0.3);
  background: rgba(255, 159, 67, 0.1);
}

.form-checkbox {
  margin-bottom: 0;
}

.form-checkbox label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.form-checkbox input {
  width: auto;
  margin: 0;
}

.sso-actions {
  margin-top: 0.75rem;
}

.sso-config-panel {
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  background: rgba(11, 19, 30, 0.6);
  padding: 1rem;
}

.sso-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.sso-panel-header h3 {
  margin: 0 0 0.35rem 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 0.875rem;
  color: var(--text-primary);
}

.role-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: capitalize;
}

.role-badge.admin {
  background: rgba(56, 189, 248, 0.18);
  color: var(--accent-primary);
}

.role-badge.editor {
  background: rgba(78, 205, 196, 0.15);
  color: var(--accent-success);
}

.role-badge.viewer {
  background: rgba(255, 159, 67, 0.15);
  color: var(--accent-warning);
}

.edit-form,
.invite-form {
  padding: 1rem;
  background: rgba(20, 33, 52, 0.8);
  border-radius: 10px;
  border: 1px solid var(--border-primary);
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
select {
  width: 100%;
  padding: 0.625rem 0.875rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.form-group input:focus,
select:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.form-row {
  display: flex;
  gap: 0.75rem;
}

.form-row input {
  flex: 1;
}

.form-row select {
  width: 120px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.error-message {
  padding: 0.625rem 0.875rem;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 6px;
  color: var(--accent-danger);
  font-size: 0.875rem;
  margin-top: 0.75rem;
}

.success-message {
  padding: 0.625rem 0.875rem;
  background: rgba(78, 205, 196, 0.1);
  border: 1px solid rgba(78, 205, 196, 0.3);
  border-radius: 6px;
  color: var(--accent-success);
  font-size: 0.875rem;
  margin-top: 0.75rem;
  word-break: break-all;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(20, 33, 52, 0.75);
  border-radius: 10px;
  border: 1px solid var(--border-primary);
}

.member-avatar {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary);
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.member-email {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.inline-state {
  padding: 0.85rem;
  border: 1px dashed var(--border-primary);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.group-form {
  padding: 1rem;
  background: rgba(20, 33, 52, 0.8);
  border-radius: 10px;
  border: 1px solid var(--border-primary);
  margin-bottom: 1rem;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.group-card {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: rgba(20, 33, 52, 0.75);
  padding: 0.9rem;
}

.group-header-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.group-header-content {
  min-width: 0;
}

.group-header-content h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.group-description {
  margin: 0.25rem 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.group-description.muted {
  opacity: 0.7;
}

.group-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.group-header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.group-edit-form {
  margin-top: 0.75rem;
  margin-bottom: 0;
}

.group-members-panel {
  margin-top: 0.75rem;
  border-top: 1px solid var(--border-primary);
  padding-top: 0.75rem;
}

.group-member-add-row {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.group-member-add-row select {
  flex: 1;
}

.group-members-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.group-member-item {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  background: rgba(11, 19, 30, 0.45);
}

.group-member-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.group-member-info strong {
  font-size: 0.85rem;
  color: var(--text-primary);
}

.group-member-info span {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-select {
  width: auto;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--bg-hover);
}

.btn-icon.danger:hover {
  background: rgba(255, 107, 107, 0.1);
  color: var(--accent-danger);
}

.danger-zone {
  border-color: var(--accent-danger);
}

.danger-zone .section-header h2 {
  color: var(--accent-danger);
}

.danger-content {
  padding: 1rem;
  background: rgba(251, 113, 133, 0.08);
  border-radius: 8px;
}

.danger-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.danger-info strong {
  display: block;
  font-size: 0.875rem;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.danger-info p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.btn-secondary {
  background: var(--surface-2);
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--accent-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-primary-hover);
}

.btn-danger {
  background: var(--accent-danger);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #e55b5b;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(3, 10, 18, 0.76);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 400px;
}

.modal h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.modal p {
  margin: 0 0 1.5rem 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.sso-modal {
  width: min(640px, calc(100vw - 2rem));
  max-width: 640px;
}

.sso-picker-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sso-picker-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: rgba(20, 33, 52, 0.75);
  color: var(--text-primary);
  padding: 0.8rem 0.9rem;
  cursor: pointer;
}

.sso-picker-option:hover {
  border-color: var(--accent-primary);
  background: rgba(20, 33, 52, 0.92);
}

.sso-picker-name {
  font-size: 0.9rem;
  font-weight: 600;
}

@media (max-width: 900px) {
  .org-settings {
    padding: 0.9rem;
  }

  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding: 0.5rem;
    gap: 0.35rem;
  }

  .settings-sidebar-link {
    width: auto;
    min-width: 110px;
    text-align: center;
    white-space: nowrap;
  }

  .page-header {
    align-items: flex-start;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .form-row {
    flex-direction: column;
  }

  .section-actions {
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
  }

  .danger-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .group-header-row,
  .group-member-item,
  .group-member-add-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .group-header-actions {
    justify-content: flex-start;
  }

  .sso-modal {
    width: calc(100vw - 1rem);
  }
}
</style>
