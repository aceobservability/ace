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
  return `/settings/org/${orgId.value}/${section}`
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
    router.push('/dashboards')
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
  <div class="px-8 py-6 max-w-4xl mx-auto">
    <!-- Back link -->
    <button class="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 bg-transparent border-none cursor-pointer transition" @click="goBack">
      <ArrowLeft :size="16" />
      <span>Back</span>
    </button>

    <!-- Title -->
    <h1 class="text-2xl font-bold text-slate-900 m-0">Organization Settings</h1>
    <p v-if="org" class="text-sm text-slate-500 mt-1 mb-0">{{ org.name }}</p>

    <div v-if="loading" class="text-center py-8 text-slate-500">Loading...</div>
    <div v-else-if="error" class="text-center py-8 text-rose-600">{{ error }}</div>
    <div v-else-if="org">
      <!-- Tab bar -->
      <nav class="flex gap-1 border-b border-slate-200 mt-6 mb-6" data-testid="org-settings-sidebar">
        <button
          v-for="section in settingsSections"
          :key="section.key"
          class="px-4 py-2.5 text-sm font-medium cursor-pointer bg-transparent border-b-2 transition"
          :class="activeSection === section.key
            ? 'text-emerald-600 border-emerald-600'
            : 'text-slate-500 hover:text-slate-700 border-transparent'"
          :data-testid="`settings-section-${section.key}`"
          @click="navigateToSection(section.key)"
        >
          {{ section.label }}
        </button>
      </nav>

      <div class="flex flex-col gap-4">
      <!-- General Settings -->
      <section v-if="activeSection === 'general'" class="rounded-xl border border-slate-200 bg-white p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-slate-900">General</h2>
          <button v-if="isAdmin && !editMode" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer" @click="startEdit">
            <Edit2 :size="16" />
            Edit
          </button>
        </div>

        <div v-if="editMode" class="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4">
          <div class="mb-4">
            <label class="block mb-1.5 text-sm font-medium text-slate-700">Organization Name</label>
            <input v-model="editName" type="text" :disabled="editLoading" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50" />
          </div>
          <div class="mb-4">
            <label class="block mb-1.5 text-sm font-medium text-slate-700">URL Slug</label>
            <input v-model="editSlug" type="text" :disabled="editLoading" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50" />
          </div>
          <div v-if="editError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600 mt-3">{{ editError }}</div>
          <div class="flex justify-end gap-3 mt-4">
            <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="cancelEdit" :disabled="editLoading">Cancel</button>
            <button class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="saveEdit" :disabled="editLoading">
              {{ editLoading ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
        <div v-else class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Name</span>
            <span class="text-sm text-slate-900">{{ org.name }}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Slug</span>
            <span class="text-sm text-slate-900">{{ org.slug }}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Your Role</span>
            <span
              class="inline-block w-fit rounded px-2 py-0.5 text-xs font-medium capitalize"
              :class="{
                'bg-amber-50 text-amber-700': org.role === 'admin',
                'bg-emerald-50 text-emerald-700': org.role === 'editor',
                'bg-slate-100 text-slate-600': org.role === 'viewer',
              }"
            >{{ org.role }}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Created</span>
            <span class="text-sm text-slate-900">{{ new Date(org.created_at).toLocaleDateString() }}</span>
          </div>
        </div>
      </section>

      <!-- Members Section -->
      <section v-if="activeSection === 'members'" class="rounded-xl border border-slate-200 bg-white p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-slate-900"><Users :size="20" /> Members ({{ members.length }})</h2>
          <button v-if="isAdmin" class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer" @click="showInviteForm = !showInviteForm">
            <UserPlus :size="16" />
            Invite
          </button>
        </div>

        <!-- Invite Form -->
        <div v-if="showInviteForm && isAdmin" class="flex items-center gap-3 mb-6">
          <input
            v-model="inviteEmail"
            type="email"
            placeholder="Email address"
            :disabled="inviteLoading"
            class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <select v-model="inviteRole" :disabled="inviteLoading" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 w-28">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="handleInvite" :disabled="inviteLoading">
            {{ inviteLoading ? 'Sending...' : 'Send Invite' }}
          </button>
        </div>
        <div v-if="inviteError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600 mb-4">{{ inviteError }}</div>
        <div v-if="inviteSuccess" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 mb-4 break-all">{{ inviteSuccess }}</div>

        <!-- Members Table -->
        <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="bg-slate-900">
                <th class="px-4 py-3 text-left text-xs font-mono uppercase tracking-[0.07em] text-slate-300">Member</th>
                <th class="px-4 py-3 text-left text-xs font-mono uppercase tracking-[0.07em] text-slate-300">Email</th>
                <th class="px-4 py-3 text-left text-xs font-mono uppercase tracking-[0.07em] text-slate-300">Role</th>
                <th v-if="isAdmin" class="px-4 py-3 text-right text-xs font-mono uppercase tracking-[0.07em] text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in members" :key="member.id" class="border-b border-slate-100">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-semibold shrink-0">
                      {{ (member.name || member.email).charAt(0).toUpperCase() }}
                    </div>
                    <span class="text-sm font-medium text-slate-900">{{ member.name || member.email }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-slate-500">{{ member.email }}</td>
                <td class="px-4 py-3">
                  <select
                    v-if="isAdmin"
                    :value="member.role"
                    @change="handleRoleChange(member, ($event.target as HTMLSelectElement).value as MembershipRole)"
                    class="rounded-lg border border-slate-200 text-sm px-2 py-1 bg-white text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <span
                    v-else
                    class="inline-block rounded px-2 py-0.5 text-xs font-medium capitalize"
                    :class="{
                      'bg-amber-50 text-amber-700': member.role === 'admin',
                      'bg-emerald-50 text-emerald-700': member.role === 'editor',
                      'bg-slate-100 text-slate-600': member.role === 'viewer',
                    }"
                  >{{ member.role }}</span>
                </td>
                <td v-if="isAdmin" class="px-4 py-3 text-right">
                  <button
                    class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-transparent border-none text-rose-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition"
                    @click="handleRemoveMember(member)"
                    title="Remove member"
                  >
                    <Trash2 :size="16" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Groups Section -->
      <section v-if="activeSection === 'groups'" class="rounded-xl border border-slate-200 bg-white p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-slate-900"><Users :size="20" /> Groups ({{ groups.length }})</h2>
          <button
            v-if="isAdmin && !showCreateGroupForm"
            class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer"
            data-testid="new-group-button"
            @click="startCreateGroup"
          >
            New Group
          </button>
        </div>

        <div v-if="groupMessage" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 mb-4">{{ groupMessage }}</div>
        <div v-if="groupActionError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600 mb-4">{{ groupActionError }}</div>

        <div v-if="showCreateGroupForm && isAdmin" class="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4">
          <div class="mb-4">
            <label class="block mb-1.5 text-sm font-medium text-slate-700">Group Name</label>
            <input v-model="createGroupName" type="text" data-testid="create-group-name" :disabled="createGroupLoading" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50" />
          </div>
          <div class="mb-4">
            <label class="block mb-1.5 text-sm font-medium text-slate-700">Description (optional)</label>
            <input
              v-model="createGroupDescription"
              type="text"
              data-testid="create-group-description"
              :disabled="createGroupLoading"
              class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
          <div class="flex justify-end gap-3 mt-4">
            <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="cancelCreateGroup" :disabled="createGroupLoading">
              Cancel
            </button>
            <button
              class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="create-group-submit"
              @click="handleCreateGroup"
              :disabled="createGroupLoading"
            >
              {{ createGroupLoading ? 'Creating...' : 'Create Group' }}
            </button>
          </div>
        </div>

        <div v-if="groupsLoading" class="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Loading groups...</div>
        <div v-else-if="groupsError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600">{{ groupsError }}</div>
        <div v-else-if="groups.length === 0" class="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
          No groups yet. {{ isAdmin ? 'Create one to organize access.' : '' }}
        </div>
        <div v-else class="flex flex-col gap-3">
          <article v-for="group in groups" :key="group.id" class="rounded-xl border border-slate-200 bg-white p-4" :data-testid="`group-card-${group.id}`">
            <div class="flex justify-between gap-3 items-start">
              <div class="min-w-0">
                <h3 class="m-0 text-sm font-semibold text-slate-900">{{ group.name }}</h3>
                <p v-if="group.description" class="mt-1 mb-0 text-sm text-slate-500">{{ group.description }}</p>
                <p v-else class="mt-1 mb-0 text-sm text-slate-400">No description</p>
                <span class="text-xs text-slate-500">{{ groupMemberCount(group.id) }} members</span>
              </div>
              <div class="flex gap-2 flex-wrap justify-end">
                <button
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                  :data-testid="`toggle-group-members-${group.id}`"
                  @click="toggleGroupMembers(group.id)"
                >
                  {{ isGroupExpanded(group.id) ? 'Hide Members' : 'Show Members' }}
                </button>
                <template v-if="isAdmin && editingGroupId !== group.id">
                  <button
                    class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                    :data-testid="`rename-group-${group.id}`"
                    @click="startEditGroup(group)"
                  >
                    Rename
                  </button>
                  <button
                    class="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    :data-testid="`delete-group-${group.id}`"
                    @click="handleDeleteGroup(group)"
                    :disabled="groupMemberActionLoading[group.id]"
                  >
                    Delete
                  </button>
                </template>
              </div>
            </div>

            <div v-if="isAdmin && editingGroupId === group.id" class="rounded-lg border border-slate-200 bg-slate-50 p-4 mt-3">
              <div class="mb-4">
                <label class="block mb-1.5 text-sm font-medium text-slate-700">Group Name</label>
                <input v-model="editGroupName" type="text" data-testid="edit-group-name" :disabled="groupUpdateLoading" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50" />
              </div>
              <div class="mb-4">
                <label class="block mb-1.5 text-sm font-medium text-slate-700">Description (optional)</label>
                <input
                  v-model="editGroupDescription"
                  type="text"
                  data-testid="edit-group-description"
                  :disabled="groupUpdateLoading"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                />
              </div>
              <div class="flex justify-end gap-3 mt-4">
                <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="cancelEditGroup" :disabled="groupUpdateLoading">
                  Cancel
                </button>
                <button
                  class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  :data-testid="`save-group-${group.id}`"
                  @click="handleUpdateGroup(group)"
                  :disabled="groupUpdateLoading"
                >
                  {{ groupUpdateLoading ? 'Saving...' : 'Save Group' }}
                </button>
              </div>
            </div>

            <div v-if="isGroupExpanded(group.id)" class="mt-3 border-t border-slate-100 pt-3">
              <div v-if="groupMembersLoading[group.id]" class="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Loading group members...</div>
              <div v-else-if="groupMembersError[group.id]" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
                {{ groupMembersError[group.id] }}
              </div>
              <template v-else>
                <div v-if="isAdmin" class="flex gap-3 mb-3">
                  <select
                    v-model="addMemberUserId[group.id]"
                    :data-testid="`add-member-select-${group.id}`"
                    :disabled="groupMemberActionLoading[group.id]"
                    class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
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
                    class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    :data-testid="`add-member-button-${group.id}`"
                    @click="handleAddGroupMember(group.id)"
                    :disabled="groupMemberActionLoading[group.id] || availableMembersForGroup(group.id).length === 0"
                  >
                    Add to Group
                  </button>
                </div>

                <div v-if="(groupMembersById[group.id] || []).length === 0" class="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  No members in this group.
                </div>
                <div v-else class="flex flex-col gap-2">
                  <div v-for="membership in groupMembersById[group.id]" :key="membership.id" class="flex justify-between gap-3 items-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div class="flex flex-col min-w-0">
                      <strong class="text-sm text-slate-900">{{ membership.name || membership.email }}</strong>
                      <span class="text-xs text-slate-500 truncate">{{ membership.email }}</span>
                    </div>
                    <button
                      v-if="isAdmin"
                      class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

      <!-- SSO Section -->
      <section v-if="activeSection === 'general'" class="rounded-xl border border-slate-200 bg-white p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-slate-900"><Shield :size="20" /> Single Sign-On</h2>
          <div v-if="isAdmin" class="flex gap-2 items-center">
            <button class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer" data-testid="add-authentication" @click="handleAddSso">
              Add Authentication
            </button>
          </div>
        </div>
        <p class="text-sm text-slate-500 mb-3 mt-0">Manage identity provider connections for this organization.</p>

        <div v-if="!isAdmin" class="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Only organization admins can update SSO settings.</div>

        <div v-if="ssoLoading" class="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Loading SSO settings...</div>
        <div v-else class="flex flex-col gap-3">
          <div class="flex flex-col gap-2">
            <article class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2.5" data-testid="sso-provider-password">
              <div>
                <h3 class="m-0 text-sm font-semibold text-slate-900">Email/Password</h3>
                <p class="mt-1 mb-0 text-xs text-slate-500">Built-in authentication method available for all organizations.</p>
              </div>
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <span class="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">Enabled</span>
              </div>
            </article>

            <article
              v-for="provider in configuredSsoProviders"
              :key="provider.key"
              class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2.5"
              :data-testid="`sso-provider-${provider.key}`"
            >
              <div>
                <h3 class="m-0 text-sm font-semibold text-slate-900">{{ provider.name }}</h3>
                <p class="mt-1 mb-0 text-xs text-slate-500">
                  {{ provider.configured ? 'Configured for this org.' : 'Not configured yet.' }}
                </p>
              </div>
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <span
                  class="inline-block rounded-full px-2.5 py-0.5 text-xs border"
                  :class="{
                    'border-emerald-200 bg-emerald-50 text-emerald-700': provider.enabled,
                    'border-amber-200 bg-amber-50 text-amber-700': provider.configured && !provider.enabled,
                    'border-slate-200 bg-slate-50 text-slate-500': !provider.configured,
                  }"
                >
                  {{ ssoStatus(provider) }}
                </span>
                <button
                  v-if="isAdmin"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                  :data-testid="`edit-sso-${provider.key}`"
                  @click="openSsoProvider(provider.key)"
                >
                  <Edit2 :size="14" />
                  Settings
                </button>
              </div>
              <div
                v-if="provider.key === 'google' && googleError && activeSsoProvider !== 'google'"
                class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600"
              >
                {{ googleError }}
              </div>
              <div
                v-if="provider.key === 'microsoft' && microsoftError && activeSsoProvider !== 'microsoft'"
                class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600"
              >
                {{ microsoftError }}
              </div>
            </article>

            <div v-if="configuredSsoProviders.length === 0" class="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
              No external authentication methods configured yet.
            </div>

            <div v-if="googleError && activeSsoProvider !== 'google'" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
              {{ googleError }}
            </div>

            <div v-if="microsoftError && activeSsoProvider !== 'microsoft'" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
              {{ microsoftError }}
            </div>
          </div>

        </div>

        <div v-if="ssoNotice" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 mt-3 break-all">{{ ssoNotice }}</div>
      </section>

      <!-- Danger Zone -->
      <section v-if="activeSection === 'general' && isAdmin" class="rounded-xl border border-rose-300 bg-white p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-rose-600"><Shield :size="20" /> Danger Zone</h2>
        </div>
        <div class="rounded-lg bg-rose-50 p-4">
          <div class="flex justify-between items-center gap-4">
            <div>
              <strong class="block text-sm text-slate-900 mb-1">Delete Organization</strong>
              <p class="m-0 text-xs text-slate-500">Permanently delete this organization and all its data. This action cannot be undone.</p>
            </div>
            <button class="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 cursor-pointer shrink-0" @click="showDeleteConfirm = true">Delete Organization</button>
          </div>
        </div>
      </section>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showDeleteConfirm = false">
      <div class="rounded-xl border border-slate-200 bg-white p-6 max-w-sm w-full shadow-lg">
        <h3 class="m-0 mb-3 text-lg font-semibold text-slate-900">Delete Organization?</h3>
        <p class="m-0 mb-6 text-sm text-slate-500">
          This will permanently delete <strong class="text-slate-700">{{ org?.name }}</strong> and all its dashboards, panels, and
          settings. This action cannot be undone.
        </p>
        <div class="flex justify-end gap-3">
          <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="showDeleteConfirm = false" :disabled="deleteLoading">
            Cancel
          </button>
          <button class="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="handleDelete" :disabled="deleteLoading">
            {{ deleteLoading ? 'Deleting...' : 'Delete Organization' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="ssoDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="sso-config-modal" @click.self="closeSsoDialog">
      <div class="rounded-xl border border-slate-200 bg-white p-6 w-full max-w-xl shadow-lg">
        <div class="flex justify-between items-start gap-4 mb-3">
          <div>
            <h3 v-if="ssoStep === 'picker'" class="m-0 mb-1 text-base font-semibold text-slate-900" data-testid="sso-provider-picker-title">Choose SSO provider</h3>
            <h3 v-else class="m-0 mb-1 text-base font-semibold text-slate-900">{{ activeSsoLabel }} SSO Settings</h3>
            <p class="text-sm text-slate-500 m-0" v-if="ssoStep === 'picker'">
              Select a provider to {{ ssoSelectionMode === 'add' ? 'add to this organization' : 'configure' }}.
            </p>
            <p class="text-sm text-slate-500 m-0" v-else>Update credentials and enable status for this provider.</p>
          </div>
          <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer" data-testid="close-sso-config" @click="closeSsoDialog">
            Close
          </button>
        </div>

        <div v-if="ssoStep === 'picker'" class="flex flex-col gap-3">
          <button
            v-for="provider in selectableSsoProviders"
            :key="provider.key"
            type="button"
            class="flex justify-between items-center gap-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left cursor-pointer transition hover:border-emerald-400 hover:bg-emerald-50"
            :data-testid="`sso-provider-option-${provider.key}`"
            @click="chooseSsoProvider(provider.key)"
          >
            <span class="text-sm font-semibold text-slate-900">{{ provider.name }}</span>
            <span
              class="inline-block rounded-full px-2.5 py-0.5 text-xs border"
              :class="{
                'border-emerald-200 bg-emerald-50 text-emerald-700': provider.enabled,
                'border-amber-200 bg-amber-50 text-amber-700': provider.configured && !provider.enabled,
                'border-slate-200 bg-slate-50 text-slate-500': !provider.configured,
              }"
            >
              {{ ssoStatus(provider) }}
            </span>
          </button>
        </div>

        <div v-else class="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="sso-config-panel">
          <div v-if="activeSsoProvider === 'google'" data-testid="google-sso-card">
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium text-slate-700">Client ID</label>
              <input
                v-model="googleClientId"
                type="text"
                data-testid="google-client-id"
                :disabled="!isAdmin || googleSaving"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium text-slate-700">Client Secret</label>
              <input
                v-model="googleClientSecret"
                type="password"
                data-testid="google-client-secret"
                placeholder="Enter to update"
                :disabled="!isAdmin || googleSaving"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
            <div class="mb-0">
              <label class="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input
                  v-model="googleEnabled"
                  type="checkbox"
                  data-testid="google-enabled"
                  :disabled="!isAdmin || googleSaving"
                  class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Enable Google SSO
              </label>
            </div>

            <div v-if="googleError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600 mt-3">{{ googleError }}</div>

            <div v-if="isAdmin" class="flex justify-end gap-3 mt-4">
              <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer" data-testid="back-sso-provider-picker" @click="ssoStep = 'picker'">
                Back
              </button>
              <button
                class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="save-google-sso"
                :disabled="googleSaving"
                @click="handleSaveGoogleSSO"
              >
                {{ googleSaving ? 'Saving...' : 'Save Google SSO' }}
              </button>
            </div>
          </div>

          <div v-else-if="activeSsoProvider === 'microsoft'" data-testid="microsoft-sso-card">
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium text-slate-700">Tenant ID</label>
              <input
                v-model="microsoftTenantId"
                type="text"
                data-testid="microsoft-tenant-id"
                :disabled="!isAdmin || microsoftSaving"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium text-slate-700">Client ID</label>
              <input
                v-model="microsoftClientId"
                type="text"
                data-testid="microsoft-client-id"
                :disabled="!isAdmin || microsoftSaving"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium text-slate-700">Client Secret</label>
              <input
                v-model="microsoftClientSecret"
                type="password"
                data-testid="microsoft-client-secret"
                placeholder="Enter to update"
                :disabled="!isAdmin || microsoftSaving"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
            <div class="mb-0">
              <label class="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input
                  v-model="microsoftEnabled"
                  type="checkbox"
                  data-testid="microsoft-enabled"
                  :disabled="!isAdmin || microsoftSaving"
                  class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Enable Microsoft SSO
              </label>
            </div>

            <div v-if="microsoftError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600 mt-3">{{ microsoftError }}</div>

            <div v-if="isAdmin" class="flex justify-end gap-3 mt-4">
              <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 cursor-pointer" data-testid="back-sso-provider-picker" @click="ssoStep = 'picker'">
                Back
              </button>
              <button
                class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
