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

type SettingsSection = 'general' | 'members' | 'groups'

const settingsSections: Array<{ key: SettingsSection; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'members', label: 'Members' },
  { key: 'groups', label: 'Groups' },
]

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return value === 'general' || value === 'members' || value === 'groups'
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
  <div class="py-[1.35rem] px-6 max-w-[980px] mx-auto max-md:p-[0.9rem]">
    <header class="flex items-center gap-4 mb-[1.2rem] p-4 border border-border rounded-[14px] bg-surface-1 shadow-sm max-md:items-start">
      <button class="flex items-center justify-center w-10 h-10 bg-surface-2 border border-border rounded-[10px] text-text-1 cursor-pointer transition-all duration-200 hover:bg-bg-hover hover:text-text-0" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <div>
        <h1 class="mb-1 text-[1.03rem] font-bold font-mono uppercase tracking-[0.04em]">Organization Settings</h1>
        <p v-if="org" class="text-text-1 text-sm">{{ org.name }}</p>
      </div>
    </header>

    <div v-if="loading" class="text-center p-8 text-text-1">Loading...</div>
    <div v-else-if="error" class="text-center p-8 text-danger">{{ error }}</div>
    <div v-else-if="org" class="grid grid-cols-[220px_minmax(0,1fr)] gap-4 items-start max-md:grid-cols-1">
      <aside class="flex flex-col gap-[0.45rem] bg-surface-1 border border-border rounded-[14px] p-3 shadow-sm sticky top-4 max-md:static max-md:flex-row max-md:overflow-x-auto max-md:p-2 max-md:gap-[0.35rem]" data-testid="org-settings-sidebar">
        <button v-for="section in settingsSections" :key="section.key"
          class="sidebar-link w-full text-left border border-transparent rounded-[10px] text-text-1 py-[0.65rem] px-3 text-[0.85rem] font-semibold cursor-pointer transition-all duration-200 hover:text-text-0 max-md:w-auto max-md:min-w-[110px] max-md:text-center max-md:whitespace-nowrap"
          :class="{ active: activeSection === section.key }"
          :data-testid="`settings-section-${section.key}`"
          @click="navigateToSection(section.key)">{{ section.label }}</button>
      </aside>

      <div class="flex flex-col gap-4">
      <section v-if="activeSection === 'general'" class="bg-surface-1 border border-border rounded-[14px] p-6 shadow-sm">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 text-base font-semibold">General</h2>
          <button v-if="isAdmin && !editMode" class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] border border-accent rounded-[6px] bg-transparent text-text-accent cursor-pointer hover:bg-bg-hover" @click="startEdit"><Edit2 :size="16" />Edit</button>
        </div>
        <div v-if="editMode" class="p-4 rounded-[10px] border border-border mb-4" style="background: rgba(20, 33, 52, 0.8)">
          <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Organization Name</label><input v-model="editName" type="text" :disabled="editLoading" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
          <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">URL Slug</label><input v-model="editSlug" type="text" :disabled="editLoading" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
          <div v-if="editError" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm mt-3" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ editError }}</div>
          <div class="flex justify-end gap-3 mt-4">
            <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[6px] bg-transparent text-text-accent text-sm font-medium cursor-pointer" @click="cancelEdit" :disabled="editLoading">Cancel</button>
            <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer" @click="saveEdit" :disabled="editLoading">{{ editLoading ? 'Saving...' : 'Save Changes' }}</button>
          </div>
        </div>
        <div v-else class="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <div class="flex flex-col gap-1"><span class="text-xs font-medium text-text-1 uppercase tracking-[0.05em]">Name</span><span class="text-sm text-text-0">{{ org.name }}</span></div>
          <div class="flex flex-col gap-1"><span class="text-xs font-medium text-text-1 uppercase tracking-[0.05em]">Slug</span><span class="text-sm text-text-0">{{ org.slug }}</span></div>
          <div class="flex flex-col gap-1"><span class="text-xs font-medium text-text-1 uppercase tracking-[0.05em]">Your Role</span><span class="role-badge text-sm" :class="org.role">{{ org.role }}</span></div>
          <div class="flex flex-col gap-1"><span class="text-xs font-medium text-text-1 uppercase tracking-[0.05em]">Created</span><span class="text-sm text-text-0">{{ new Date(org.created_at).toLocaleDateString() }}</span></div>
        </div>
      </section>

      <section v-if="activeSection === 'members'" class="bg-surface-1 border border-border rounded-[14px] p-6 shadow-sm">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 text-base font-semibold"><Users :size="20" /> Members ({{ members.length }})</h2>
          <button v-if="isAdmin" class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] rounded-[6px] bg-accent text-[#1a0f00] cursor-pointer" @click="showInviteForm = !showInviteForm"><UserPlus :size="16" />Invite</button>
        </div>
        <div v-if="showInviteForm && isAdmin" class="p-4 rounded-[10px] border border-border mb-4" style="background: rgba(20, 33, 52, 0.8)">
          <div class="flex gap-3 max-md:flex-col">
            <input v-model="inviteEmail" type="email" placeholder="Email address" :disabled="inviteLoading" class="flex-1 py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" />
            <select v-model="inviteRole" :disabled="inviteLoading" class="w-[120px] py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 max-md:w-full"><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select>
            <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer" @click="handleInvite" :disabled="inviteLoading">{{ inviteLoading ? 'Sending...' : 'Send Invite' }}</button>
          </div>
          <div v-if="inviteError" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm mt-3" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ inviteError }}</div>
          <div v-if="inviteSuccess" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-success text-sm mt-3 break-all" style="background: rgba(78, 205, 196, 0.1); border: 1px solid rgba(78, 205, 196, 0.3)">{{ inviteSuccess }}</div>
        </div>
        <div class="flex flex-col gap-2">
          <div v-for="member in members" :key="member.id" class="flex items-center gap-3 p-3 rounded-[10px] border border-border" style="background: rgba(20, 33, 52, 0.75)">
            <div class="w-9 h-9 flex items-center justify-center bg-accent rounded-full text-sm font-semibold text-white shrink-0">{{ (member.name || member.email).charAt(0).toUpperCase() }}</div>
            <div class="flex-1 min-w-0"><span class="block text-sm font-medium text-text-0">{{ member.name || member.email }}</span><span class="block text-xs text-text-1 whitespace-nowrap overflow-hidden text-ellipsis">{{ member.email }}</span></div>
            <div class="flex items-center gap-2">
              <select v-if="isAdmin" :value="member.role" @change="handleRoleChange(member, ($event.target as HTMLSelectElement).value as MembershipRole)" class="w-auto py-[0.375rem] px-2 text-xs bg-bg-1 border border-border rounded-[6px] text-text-0"><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select>
              <span v-else class="role-badge" :class="member.role">{{ member.role }}</span>
              <button v-if="isAdmin" class="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-[6px] text-text-1 cursor-pointer transition-all duration-200 hover:text-danger" style="--hover-bg: rgba(255, 107, 107, 0.1)" @click="handleRemoveMember(member)" title="Remove member"><Trash2 :size="16" /></button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'groups'" class="bg-surface-1 border border-border rounded-[14px] p-6 shadow-sm">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 text-base font-semibold"><Users :size="20" /> Groups ({{ groups.length }})</h2>
          <button v-if="isAdmin && !showCreateGroupForm" class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] rounded-[6px] bg-accent text-[#1a0f00] cursor-pointer" data-testid="new-group-button" @click="startCreateGroup">New Group</button>
        </div>
        <div v-if="groupMessage" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-success text-sm mt-3 break-all" style="background: rgba(78, 205, 196, 0.1); border: 1px solid rgba(78, 205, 196, 0.3)">{{ groupMessage }}</div>
        <div v-if="groupActionError" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm mt-3" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ groupActionError }}</div>
        <div v-if="showCreateGroupForm && isAdmin" class="p-4 rounded-[10px] border border-border mb-4" style="background: rgba(20, 33, 52, 0.8)">
          <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Group Name</label><input v-model="createGroupName" type="text" data-testid="create-group-name" :disabled="createGroupLoading" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
          <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Description (optional)</label><input v-model="createGroupDescription" type="text" data-testid="create-group-description" :disabled="createGroupLoading" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
          <div class="flex justify-end gap-3 mt-4"><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[6px] bg-transparent text-text-accent text-sm font-medium cursor-pointer" @click="cancelCreateGroup" :disabled="createGroupLoading">Cancel</button><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer" data-testid="create-group-submit" @click="handleCreateGroup" :disabled="createGroupLoading">{{ createGroupLoading ? 'Creating...' : 'Create Group' }}</button></div>
        </div>
        <div v-if="groupsLoading" class="p-[0.85rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8125rem]">Loading groups...</div>
        <div v-else-if="groupsError" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ groupsError }}</div>
        <div v-else-if="groups.length === 0" class="p-[0.85rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8125rem]">No groups yet. {{ isAdmin ? 'Create one to organize access.' : '' }}</div>
        <div v-else class="flex flex-col gap-3">
          <article v-for="group in groups" :key="group.id" class="border border-border rounded-[10px] p-[0.9rem]" :data-testid="`group-card-${group.id}`" style="background: rgba(20, 33, 52, 0.75)">
            <div class="flex justify-between gap-3 items-start max-md:flex-col max-md:items-start">
              <div class="min-w-0"><h3 class="text-[0.95rem]">{{ group.name }}</h3><p v-if="group.description" class="text-[0.8125rem] text-text-1 mt-1 mb-1">{{ group.description }}</p><p v-else class="text-[0.8125rem] text-text-1 mt-1 mb-1 opacity-70">No description</p><span class="text-xs text-text-1">{{ groupMemberCount(group.id) }} members</span></div>
              <div class="flex gap-2 flex-wrap justify-end max-md:justify-start">
                <button class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] border border-accent rounded-[6px] bg-transparent text-text-accent cursor-pointer" :data-testid="`toggle-group-members-${group.id}`" @click="toggleGroupMembers(group.id)">{{ isGroupExpanded(group.id) ? 'Hide Members' : 'Show Members' }}</button>
                <template v-if="isAdmin && editingGroupId !== group.id">
                  <button class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] border border-accent rounded-[6px] bg-transparent text-text-accent cursor-pointer" :data-testid="`rename-group-${group.id}`" @click="startEditGroup(group)">Rename</button>
                  <button class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] rounded-[6px] bg-danger text-white cursor-pointer disabled:opacity-50" :data-testid="`delete-group-${group.id}`" @click="handleDeleteGroup(group)" :disabled="groupMemberActionLoading[group.id]">Delete</button>
                </template>
              </div>
            </div>
            <div v-if="isAdmin && editingGroupId === group.id" class="p-4 rounded-[10px] border border-border mt-3" style="background: rgba(20, 33, 52, 0.8)">
              <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Group Name</label><input v-model="editGroupName" type="text" data-testid="edit-group-name" :disabled="groupUpdateLoading" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
              <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Description (optional)</label><input v-model="editGroupDescription" type="text" data-testid="edit-group-description" :disabled="groupUpdateLoading" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
              <div class="flex justify-end gap-3 mt-4"><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[6px] bg-transparent text-text-accent text-sm font-medium cursor-pointer" @click="cancelEditGroup" :disabled="groupUpdateLoading">Cancel</button><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer" :data-testid="`save-group-${group.id}`" @click="handleUpdateGroup(group)" :disabled="groupUpdateLoading">{{ groupUpdateLoading ? 'Saving...' : 'Save Group' }}</button></div>
            </div>
            <div v-if="isGroupExpanded(group.id)" class="mt-3 border-t border-border pt-3">
              <div v-if="groupMembersLoading[group.id]" class="p-[0.85rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8125rem]">Loading group members...</div>
              <div v-else-if="groupMembersError[group.id]" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ groupMembersError[group.id] }}</div>
              <template v-else>
                <div v-if="isAdmin" class="flex gap-3 mb-3 max-md:flex-col max-md:items-start">
                  <select v-model="addMemberUserId[group.id]" :data-testid="`add-member-select-${group.id}`" :disabled="groupMemberActionLoading[group.id]" class="flex-1 py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 max-md:w-full"><option value="">Select member</option><option v-for="member in availableMembersForGroup(group.id)" :key="member.user_id" :value="member.user_id">{{ member.name || member.email }} ({{ member.email }})</option></select>
                  <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer disabled:opacity-50" :data-testid="`add-member-button-${group.id}`" @click="handleAddGroupMember(group.id)" :disabled="groupMemberActionLoading[group.id] || availableMembersForGroup(group.id).length === 0">Add to Group</button>
                </div>
                <div v-if="(groupMembersById[group.id] || []).length === 0" class="p-[0.85rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8125rem]">No members in this group.</div>
                <div v-else class="flex flex-col gap-2">
                  <div v-for="membership in groupMembersById[group.id]" :key="membership.id" class="flex justify-between gap-3 items-center border border-border rounded-[8px] py-[0.6rem] px-3 max-md:flex-col max-md:items-start" style="background: rgba(11, 19, 30, 0.45)">
                    <div class="flex flex-col min-w-0"><strong class="text-[0.85rem] text-text-0">{{ membership.name || membership.email }}</strong><span class="text-xs text-text-1 whitespace-nowrap overflow-hidden text-ellipsis">{{ membership.email }}</span></div>
                    <button v-if="isAdmin" class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] border border-accent rounded-[6px] bg-transparent text-text-accent cursor-pointer" :data-testid="`remove-member-${group.id}-${membership.user_id}`" @click="handleRemoveGroupMember(group.id, membership)" :disabled="groupMemberActionLoading[group.id]">Remove</button>
                  </div>
                </div>
              </template>
            </div>
          </article>
        </div>
      </section>

      <section v-if="activeSection === 'general'" class="bg-surface-1 border border-border rounded-[14px] p-6 shadow-sm">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 text-base font-semibold"><Shield :size="20" /> Single Sign-On</h2>
          <div v-if="isAdmin" class="flex gap-2 items-center"><button class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] rounded-[6px] bg-accent text-[#1a0f00] cursor-pointer" data-testid="add-authentication" @click="handleAddSso">Add Authentication</button></div>
        </div>
        <p class="text-text-1 text-sm mb-3">Manage identity provider connections for this organization.</p>
        <div v-if="!isAdmin" class="p-[0.85rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8125rem]">Only organization admins can update SSO settings.</div>
        <div v-if="ssoLoading" class="p-[0.85rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8125rem]">Loading SSO settings...</div>
        <div v-else class="flex flex-col gap-3">
          <div class="flex flex-col gap-2">
            <article class="sso-provider-row border border-border rounded-[10px] p-[0.9rem] flex flex-col gap-[0.65rem]" style="background: rgba(20, 33, 52, 0.75)" data-testid="sso-provider-password">
              <div><h3 class="text-[0.95rem]">Email/Password</h3><p class="text-[0.8rem] text-text-1 mt-[0.35rem]">Built-in authentication method available for all organizations.</p></div>
              <div class="flex items-center justify-between gap-3 flex-wrap"><span class="sso-status enabled">Enabled</span></div>
            </article>
            <article v-for="provider in configuredSsoProviders" :key="provider.key" class="border border-border rounded-[10px] p-[0.9rem] flex flex-col gap-[0.65rem]" style="background: rgba(20, 33, 52, 0.75)" :data-testid="`sso-provider-${provider.key}`">
              <div><h3 class="text-[0.95rem]">{{ provider.name }}</h3><p class="text-[0.8rem] text-text-1 mt-[0.35rem]">{{ provider.configured ? 'Configured for this org.' : 'Not configured yet.' }}</p></div>
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <span class="sso-status" :class="{ enabled: provider.enabled, configured: provider.configured }">{{ ssoStatus(provider) }}</span>
                <button v-if="isAdmin" class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] border border-accent rounded-[6px] bg-transparent text-text-accent cursor-pointer" :data-testid="`edit-sso-${provider.key}`" @click="openSsoProvider(provider.key)"><Edit2 :size="14" />Settings</button>
              </div>
              <div v-if="provider.key === 'google' && googleError && activeSsoProvider !== 'google'" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ googleError }}</div>
              <div v-if="provider.key === 'microsoft' && microsoftError && activeSsoProvider !== 'microsoft'" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ microsoftError }}</div>
            </article>
            <div v-if="configuredSsoProviders.length === 0" class="p-[0.85rem] border border-dashed border-border rounded-[8px] text-text-1 text-[0.8125rem]">No external authentication methods configured yet.</div>
            <div v-if="googleError && activeSsoProvider !== 'google'" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ googleError }}</div>
            <div v-if="microsoftError && activeSsoProvider !== 'microsoft'" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ microsoftError }}</div>
          </div>
        </div>
        <div v-if="ssoNotice" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-success text-sm mt-3" style="background: rgba(78, 205, 196, 0.1); border: 1px solid rgba(78, 205, 196, 0.3)">{{ ssoNotice }}</div>
      </section>

      <section v-if="activeSection === 'general' && isAdmin" class="bg-surface-1 border border-danger rounded-[14px] p-6 shadow-sm">
        <div class="flex justify-between items-center mb-4"><h2 class="flex items-center gap-2 text-base font-semibold text-danger"><Shield :size="20" /> Danger Zone</h2></div>
        <div class="p-4 rounded-[8px]" style="background: rgba(251, 113, 133, 0.08)">
          <div class="flex justify-between items-center gap-4 max-md:flex-col max-md:items-start"><div><strong class="block text-sm text-text-0 mb-1">Delete Organization</strong><p class="text-xs text-text-1">Permanently delete this organization and all its data. This action cannot be undone.</p></div>
            <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-danger text-white text-sm font-medium cursor-pointer" @click="showDeleteConfirm = true">Delete Organization</button></div>
        </div>
      </section>
      </div>
    </div>

    <div v-if="showDeleteConfirm" class="fixed inset-0 flex items-center justify-center z-[1000]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="showDeleteConfirm = false">
      <div class="bg-surface-1 border border-border rounded-[14px] p-6 max-w-[400px]">
        <h3 class="mb-3 text-[1.125rem] font-semibold">Delete Organization?</h3>
        <p class="text-sm text-text-1 mb-6">This will permanently delete <strong>{{ org?.name }}</strong> and all its dashboards, panels, and settings. This action cannot be undone.</p>
        <div class="flex justify-end gap-3"><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[6px] bg-transparent text-text-accent text-sm font-medium cursor-pointer" @click="showDeleteConfirm = false" :disabled="deleteLoading">Cancel</button><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-danger text-white text-sm font-medium cursor-pointer" @click="handleDelete" :disabled="deleteLoading">{{ deleteLoading ? 'Deleting...' : 'Delete Organization' }}</button></div>
      </div>
    </div>

    <div v-if="ssoDialogOpen" class="fixed inset-0 flex items-center justify-center z-[1000]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" data-testid="sso-config-modal" @click.self="closeSsoDialog">
      <div class="bg-surface-1 border border-border rounded-[14px] p-6 w-[min(640px,calc(100vw-2rem))] max-w-[640px] max-md:w-[calc(100vw-1rem)]">
        <div class="flex justify-between items-start gap-4 mb-3">
          <div><h3 v-if="ssoStep === 'picker'" class="mb-[0.35rem] text-base" data-testid="sso-provider-picker-title">Choose SSO provider</h3><h3 v-else class="mb-[0.35rem] text-base">{{ activeSsoLabel }} SSO Settings</h3><p class="text-text-1 text-sm" v-if="ssoStep === 'picker'">Select a provider to {{ ssoSelectionMode === 'add' ? 'add to this organization' : 'configure' }}.</p><p class="text-text-1 text-sm" v-else>Update credentials and enable status for this provider.</p></div>
          <button class="inline-flex items-center gap-2 py-[0.375rem] px-3 text-[0.8125rem] border border-accent rounded-[6px] bg-transparent text-text-accent cursor-pointer" data-testid="close-sso-config" @click="closeSsoDialog">Close</button>
        </div>
        <div v-if="ssoStep === 'picker'" class="flex flex-col gap-3">
          <button v-for="provider in selectableSsoProviders" :key="provider.key" type="button" class="sso-picker-option flex justify-between items-center gap-3 w-full border border-border rounded-[10px] py-[0.8rem] px-[0.9rem] cursor-pointer text-text-0 hover:border-accent" style="background: rgba(20, 33, 52, 0.75)" :data-testid="`sso-provider-option-${provider.key}`" @click="chooseSsoProvider(provider.key)">
            <span class="text-[0.9rem] font-semibold">{{ provider.name }}</span>
            <span class="sso-status" :class="{ enabled: provider.enabled, configured: provider.configured }">{{ ssoStatus(provider) }}</span>
          </button>
        </div>
        <div v-else class="border border-border rounded-[12px] p-4" style="background: rgba(11, 19, 30, 0.6)" data-testid="sso-config-panel">
          <div v-if="activeSsoProvider === 'google'" data-testid="google-sso-card">
            <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Client ID</label><input v-model="googleClientId" type="text" data-testid="google-client-id" :disabled="!isAdmin || googleSaving" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
            <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Client Secret</label><input v-model="googleClientSecret" type="password" data-testid="google-client-secret" placeholder="Enter to update" :disabled="!isAdmin || googleSaving" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
            <div class="mb-0"><label class="inline-flex items-center gap-2"><input v-model="googleEnabled" type="checkbox" data-testid="google-enabled" :disabled="!isAdmin || googleSaving" class="w-auto m-0" />Enable Google SSO</label></div>
            <div v-if="googleError" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm mt-3" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ googleError }}</div>
            <div v-if="isAdmin" class="flex justify-end gap-3 mt-3"><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[6px] bg-transparent text-text-accent text-sm font-medium cursor-pointer" data-testid="back-sso-provider-picker" @click="ssoStep = 'picker'">Back</button><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer" data-testid="save-google-sso" :disabled="googleSaving" @click="handleSaveGoogleSSO">{{ googleSaving ? 'Saving...' : 'Save Google SSO' }}</button></div>
          </div>
          <div v-else-if="activeSsoProvider === 'microsoft'" data-testid="microsoft-sso-card">
            <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Tenant ID</label><input v-model="microsoftTenantId" type="text" data-testid="microsoft-tenant-id" :disabled="!isAdmin || microsoftSaving" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
            <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Client ID</label><input v-model="microsoftClientId" type="text" data-testid="microsoft-client-id" :disabled="!isAdmin || microsoftSaving" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
            <div class="mb-4"><label class="block mb-[0.375rem] text-sm font-medium text-text-0">Client Secret</label><input v-model="microsoftClientSecret" type="password" data-testid="microsoft-client-secret" placeholder="Enter to update" :disabled="!isAdmin || microsoftSaving" class="w-full py-[0.625rem] px-[0.875rem] bg-bg-1 border border-border rounded-[6px] text-sm text-text-0 focus:outline-none focus:border-accent" /></div>
            <div class="mb-0"><label class="inline-flex items-center gap-2"><input v-model="microsoftEnabled" type="checkbox" data-testid="microsoft-enabled" :disabled="!isAdmin || microsoftSaving" class="w-auto m-0" />Enable Microsoft SSO</label></div>
            <div v-if="microsoftError" class="py-[0.625rem] px-[0.875rem] rounded-[6px] text-danger text-sm mt-3" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ microsoftError }}</div>
            <div v-if="isAdmin" class="flex justify-end gap-3 mt-3"><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[6px] bg-transparent text-text-accent text-sm font-medium cursor-pointer" data-testid="back-sso-provider-picker" @click="ssoStep = 'picker'">Back</button><button class="inline-flex items-center gap-2 py-[0.625rem] px-4 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer" data-testid="save-microsoft-sso" :disabled="microsoftSaving" @click="handleSaveMicrosoftSSO">{{ microsoftSaving ? 'Saving...' : 'Save Microsoft SSO' }}</button></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Minimal CSS for complex state-dependent styling */
.sidebar-link:hover { border-color: rgba(252, 211, 77, 0.22); background: rgba(31, 49, 73, 0.64); }
.sidebar-link.active { color: #FCD34D; border-color: rgba(245, 158, 11, 0.34); background: linear-gradient(90deg, rgba(245, 158, 11, 0.18), rgba(99, 102, 241, 0.1)); }
.role-badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; text-transform: capitalize; }
.role-badge.admin { background: rgba(245, 158, 11, 0.18); color: var(--color-accent); }
.role-badge.editor { background: rgba(78, 205, 196, 0.15); color: var(--color-success); }
.role-badge.viewer { background: rgba(255, 159, 67, 0.15); color: var(--color-warning); }
.sso-status { font-size: 0.75rem; border-radius: 999px; padding: 0.15rem 0.55rem; color: var(--color-text-1); border: 1px solid var(--color-border); }
.sso-status.enabled { color: var(--color-success); border-color: rgba(78, 205, 196, 0.45); background: rgba(78, 205, 196, 0.1); }
.sso-status.configured:not(.enabled) { color: var(--color-warning); border-color: rgba(255, 159, 67, 0.3); background: rgba(255, 159, 67, 0.1); }
.sso-picker-option:hover { background: rgba(20, 33, 52, 0.92); }
</style>
