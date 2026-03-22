<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { UserPlus, Trash2, Shield, Edit2, Users, Database, Bot, Lock } from 'lucide-vue-next'
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
  deleteGroup,
  listGroupMembers,
} from '../api/groups'
import {
  getGoogleSSOConfig,
  updateGoogleSSOConfig,
  getMicrosoftSSOConfig,
  updateMicrosoftSSOConfig,
} from '../api/sso'
import { useOrganization } from '../composables/useOrganization'
import { useCommandContext } from '../composables/useCommandContext'
import DataSourceSettingsPanel from '../components/DataSourceSettingsPanel.vue'
import GitHubAppSettings from '../components/GitHubAppSettings.vue'

const route = useRoute()
const router = useRouter()
const { currentOrg, fetchOrganizations } = useOrganization()
const { registerContext, deregisterContext } = useCommandContext()

const orgId = computed(() => currentOrg.value?.id || '')
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

const expandedGroupIds = ref<string[]>([])
const groupMembersById = ref<Record<string, UserGroupMembership[]>>({})
const groupMembersLoading = ref<Record<string, boolean>>({})
const groupMembersError = ref<Record<string, string | null>>({})
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
const ssoStep = ref<'picker' | 'form'>('picker')
const ssoProviders = computed(() => [
  { key: 'google' as const, name: 'Google', configured: googleConfigured.value, enabled: googleEnabled.value },
  { key: 'microsoft' as const, name: 'Microsoft', configured: microsoftConfigured.value, enabled: microsoftEnabled.value },
])
const configuredSsoProviders = computed(() => ssoProviders.value.filter((p) => p.configured))
const activeSsoLabel = computed(() => ssoProviders.value.find((p) => p.key === activeSsoProvider.value)?.name ?? '')

const isAdmin = computed(() => org.value?.role === 'admin')

// Sections
type SettingsSection = 'general' | 'members' | 'groups' | 'datasources' | 'ai' | 'sso'

const settingsSections: Array<{ key: SettingsSection; label: string; icon: any }> = [
  { key: 'general', label: 'General', icon: Edit2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'groups', label: 'Groups & Permissions', icon: Shield },
  { key: 'datasources', label: 'Data Sources', icon: Database },
  { key: 'ai', label: 'AI Configuration', icon: Bot },
  { key: 'sso', label: 'SSO / Auth', icon: Lock },
]

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return settingsSections.some((s) => s.key === value)
}

const activeSection = computed<SettingsSection>(() => {
  const section = route.params.section as string | undefined
  return isSettingsSection(section) ? section : 'general'
})

function navigateToSection(section: SettingsSection) {
  if (section === activeSection.value) return
  router.push(`/app/settings/${section}`)
}

watch(
  () => route.params.section,
  (section) => {
    if (!isSettingsSection(section as string | undefined)) {
      router.replace('/app/settings/general')
    }
  },
  { immediate: true },
)

onMounted(async () => {
  registerContext({
    viewName: 'Settings',
    viewRoute: '/app/settings',
    description: 'Manage organization profile, members, datasources, and preferences',
  })

  if (orgId.value) {
    await loadData()
  }
})

watch(orgId, async (newId) => {
  if (newId) {
    await loadData()
  }
})

onUnmounted(() => {
  deregisterContext()
})

async function loadData() {
  if (!orgId.value) return
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

// --- General ---
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
  if (!editName.value.trim()) { editError.value = 'Name is required'; return }
  editLoading.value = true
  editError.value = null
  try {
    org.value = await updateOrganization(orgId.value, { name: editName.value.trim(), slug: editSlug.value.trim() })
    editMode.value = false
    await fetchOrganizations()
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Failed to update organization'
  } finally {
    editLoading.value = false
  }
}

// --- Members ---
async function handleInvite() {
  if (!inviteEmail.value.trim()) { inviteError.value = 'Email is required'; return }
  inviteLoading.value = true
  inviteError.value = null
  inviteSuccess.value = null
  try {
    const invitation = await createInvitation(orgId.value, { email: inviteEmail.value.trim(), role: inviteRole.value })
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
  if (!confirm(`Remove ${member.email} from this organization?`)) return
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

// --- Groups ---
function resetGroupMessages() { groupMessage.value = null; groupActionError.value = null }

async function loadGroups() {
  groupsLoading.value = true
  groupsError.value = null
  try {
    groups.value = await listGroups(orgId.value)
    const validGroupIds = new Set(groups.value.map((g) => g.id))
    expandedGroupIds.value = expandedGroupIds.value.filter((id) => validGroupIds.has(id))
  } catch (e) {
    groups.value = []
    groupsError.value = e instanceof Error ? e.message : 'Failed to load groups'
  } finally {
    groupsLoading.value = false
  }
}

function startCreateGroup() { showCreateGroupForm.value = true; createGroupName.value = ''; createGroupDescription.value = ''; resetGroupMessages() }
function cancelCreateGroup() { showCreateGroupForm.value = false; createGroupName.value = ''; createGroupDescription.value = ''; resetGroupMessages() }

async function handleCreateGroup() {
  const name = createGroupName.value.trim()
  if (!name) { groupActionError.value = 'Group name is required'; return }
  createGroupLoading.value = true
  resetGroupMessages()
  try {
    await createGroup(orgId.value, { name, description: createGroupDescription.value.trim() || undefined })
    groupMessage.value = 'Group created'
    showCreateGroupForm.value = false; createGroupName.value = ''; createGroupDescription.value = ''
    await loadGroups()
  } catch (e) {
    groupActionError.value = e instanceof Error ? e.message : 'Failed to create group'
  } finally {
    createGroupLoading.value = false
  }
}

function startEditGroup(group: UserGroup) { editingGroupId.value = group.id; editGroupName.value = group.name; editGroupDescription.value = group.description || ''; resetGroupMessages() }

async function handleDeleteGroup(group: UserGroup) {
  if (!confirm(`Delete group "${group.name}"?`)) return
  groupMemberActionLoading.value = { ...groupMemberActionLoading.value, [group.id]: true }
  resetGroupMessages()
  try {
    await deleteGroup(orgId.value, group.id)
    groupMessage.value = 'Group deleted'
    delete groupMembersById.value[group.id]
    await loadGroups()
  } catch (e) {
    groupActionError.value = e instanceof Error ? e.message : 'Failed to delete group'
  } finally {
    groupMemberActionLoading.value = { ...groupMemberActionLoading.value, [group.id]: false }
  }
}

function isGroupExpanded(groupId: string) { return expandedGroupIds.value.includes(groupId) }
function groupMemberCount(groupId: string) { return groupMembersById.value[groupId]?.length || 0 }
async function loadGroupMembers(groupId: string) {
  groupMembersLoading.value = { ...groupMembersLoading.value, [groupId]: true }
  groupMembersError.value = { ...groupMembersError.value, [groupId]: null }
  try {
    groupMembersById.value = { ...groupMembersById.value, [groupId]: await listGroupMembers(orgId.value, groupId) }
  } catch (e) {
    groupMembersError.value = { ...groupMembersError.value, [groupId]: e instanceof Error ? e.message : 'Failed to load members' }
  } finally {
    groupMembersLoading.value = { ...groupMembersLoading.value, [groupId]: false }
  }
}

async function toggleGroupMembers(groupId: string) {
  if (isGroupExpanded(groupId)) { expandedGroupIds.value = expandedGroupIds.value.filter((id) => id !== groupId); return }
  expandedGroupIds.value = [...expandedGroupIds.value, groupId]
  if (!groupMembersById.value[groupId] && !groupMembersLoading.value[groupId]) { await loadGroupMembers(groupId) }
}

// --- SSO ---
function resetSSOMessages() { ssoNotice.value = null; googleError.value = null; microsoftError.value = null }

async function loadGoogleConfig() {
  googleError.value = null; googleClientSecret.value = ''
  try {
    const config = await getGoogleSSOConfig(orgId.value)
    googleClientId.value = config.client_id; googleEnabled.value = config.enabled; googleConfigured.value = true
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load Google SSO'
    if (msg === 'Google SSO not configured') { googleClientId.value = ''; googleEnabled.value = false; googleConfigured.value = false; return }
    googleError.value = msg
  }
}

async function loadMicrosoftConfig() {
  microsoftError.value = null; microsoftClientSecret.value = ''
  try {
    const config = await getMicrosoftSSOConfig(orgId.value)
    microsoftTenantId.value = config.tenant_id; microsoftClientId.value = config.client_id; microsoftEnabled.value = config.enabled; microsoftConfigured.value = true
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load Microsoft SSO'
    if (msg === 'Microsoft SSO not configured') { microsoftTenantId.value = ''; microsoftClientId.value = ''; microsoftEnabled.value = false; microsoftConfigured.value = false; return }
    microsoftError.value = msg
  }
}

async function loadSSOConfigs() {
  ssoLoading.value = true; resetSSOMessages()
  await Promise.all([loadGoogleConfig(), loadMicrosoftConfig()])
  ssoLoading.value = false
}

function openSsoProvider(provider: SsoProviderKey) { ssoDialogOpen.value = true; ssoStep.value = 'form'; activeSsoProvider.value = provider; resetSSOMessages() }
function closeSsoDialog() { ssoDialogOpen.value = false; ssoStep.value = 'picker'; activeSsoProvider.value = null; resetSSOMessages() }

async function handleSaveGoogleSSO() {
  if (!isAdmin.value) return
  const cId = googleClientId.value.trim(); const cSecret = googleClientSecret.value.trim()
  if (!cId) { googleError.value = 'Client ID is required'; return }
  if (!cSecret) { googleError.value = 'Client secret is required'; return }
  googleSaving.value = true; googleError.value = null; ssoNotice.value = null
  try {
    const updated = await updateGoogleSSOConfig(orgId.value, { client_id: cId, client_secret: cSecret, enabled: googleEnabled.value })
    googleClientId.value = updated.client_id; googleEnabled.value = updated.enabled; googleConfigured.value = true; googleClientSecret.value = ''
    ssoNotice.value = 'Google SSO settings saved'
  } catch (e) {
    googleError.value = e instanceof Error ? e.message : 'Failed to save Google SSO settings'
  } finally {
    googleSaving.value = false
  }
}

async function handleSaveMicrosoftSSO() {
  if (!isAdmin.value) return
  const tId = microsoftTenantId.value.trim(); const cId = microsoftClientId.value.trim(); const cSecret = microsoftClientSecret.value.trim()
  if (!tId) { microsoftError.value = 'Tenant ID is required'; return }
  if (!cId) { microsoftError.value = 'Client ID is required'; return }
  if (!cSecret) { microsoftError.value = 'Client secret is required'; return }
  microsoftSaving.value = true; microsoftError.value = null; ssoNotice.value = null
  try {
    const updated = await updateMicrosoftSSOConfig(orgId.value, { tenant_id: tId, client_id: cId, client_secret: cSecret, enabled: microsoftEnabled.value })
    microsoftTenantId.value = updated.tenant_id; microsoftClientId.value = updated.client_id; microsoftEnabled.value = updated.enabled; microsoftConfigured.value = true; microsoftClientSecret.value = ''
    ssoNotice.value = 'Microsoft SSO settings saved'
  } catch (e) {
    microsoftError.value = e instanceof Error ? e.message : 'Failed to save Microsoft SSO settings'
  } finally {
    microsoftSaving.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 min-h-0" :style="{ color: 'var(--color-on-surface)' }">
    <!-- Vertical tab navigation -->
    <nav
      class="flex flex-col w-[200px] shrink-0 py-6 px-3 gap-1"
      :style="{ backgroundColor: 'var(--color-surface-container-low)' }"
      data-testid="settings-nav"
    >
      <h2 class="text-xs font-semibold uppercase tracking-wider px-3 mb-3" :style="{ color: 'var(--color-outline)' }">Settings</h2>
      <button
        v-for="section in settingsSections"
        :key="section.key"
        class="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition bg-transparent border-none text-left"
        :style="{
          backgroundColor: activeSection === section.key ? 'var(--color-surface-container-high)' : 'transparent',
          color: activeSection === section.key ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
        }"
        :data-testid="`settings-nav-${section.key}`"
        @click="navigateToSection(section.key)"
      >
        <component :is="section.icon" :size="16" />
        {{ section.label }}
      </button>
    </nav>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto px-8 py-6">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-8" :style="{ color: 'var(--color-outline)' }">Loading...</div>
      <div v-else-if="error" class="text-center py-8" :style="{ color: 'var(--color-error)' }">{{ error }}</div>
      <div v-else-if="!orgId" class="text-center py-8" :style="{ color: 'var(--color-outline)' }">No organization selected.</div>

      <template v-else>
        <!-- General Section -->
        <section v-if="activeSection === 'general'" class="flex flex-col gap-6 max-w-2xl" data-testid="settings-general">
          <div class="rounded-lg p-6" :style="{ backgroundColor: 'var(--color-surface-container-low)' }">
            <div class="flex justify-between items-center mb-4">
              <h2 class="flex items-center gap-2 m-0 text-base font-semibold font-display" :style="{ color: 'var(--color-on-surface)' }">General</h2>
              <button
                v-if="isAdmin && !editMode"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium cursor-pointer transition"
                :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
                data-testid="org-edit-btn"
                @click="startEdit"
              >
                <Edit2 :size="16" /> Edit
              </button>
            </div>

            <div v-if="editMode" class="p-4 rounded-lg mb-4" :style="{ backgroundColor: 'var(--color-surface-container-high)' }">
              <div class="mb-4">
                <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Organization Name</label>
                <input v-model="editName" type="text" data-testid="org-name-input"
                  class="w-full px-3 py-2.5 rounded-sm text-sm font-mono focus:outline-none"
                  :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
                  :disabled="editLoading" />
              </div>
              <div class="mb-4">
                <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">URL Slug</label>
                <input v-model="editSlug" data-testid="org-slug-input" type="text"
                  class="w-full px-3 py-2.5 rounded-sm text-sm font-mono focus:outline-none"
                  :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
                  :disabled="editLoading" />
              </div>
              <div v-if="editError" class="px-3.5 py-2.5 rounded-sm text-sm mt-3" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">{{ editError }}</div>
              <div class="flex justify-end gap-3 mt-4">
                <button class="px-4 py-2.5 rounded-sm text-sm font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" data-testid="org-edit-cancel-btn" @click="cancelEdit" :disabled="editLoading">Cancel</button>
                <button class="px-4 py-2.5 rounded-sm text-sm font-medium cursor-pointer transition" :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff', border: 'none' }" data-testid="org-edit-save-btn" @click="saveEdit" :disabled="editLoading">{{ editLoading ? 'Saving...' : 'Save Changes' }}</button>
              </div>
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">Name</span>
                <span class="text-sm" :style="{ color: 'var(--color-on-surface)' }">{{ org?.name }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">Slug</span>
                <span class="text-sm font-mono" :style="{ color: 'var(--color-on-surface)' }">{{ org?.slug }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">Your Role</span>
                <span class="text-sm font-mono capitalize" :style="{ color: 'var(--color-primary)' }">{{ org?.role }}</span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">Created</span>
                <span class="text-sm font-mono" :style="{ color: 'var(--color-on-surface)' }">{{ org ? new Date(org.created_at).toLocaleDateString() : '' }}</span>
              </div>
            </div>
          </div>

          <!-- Danger Zone -->
          <div v-if="isAdmin" class="rounded-lg p-6" :style="{ backgroundColor: 'var(--color-surface-container-low)', border: '1px solid var(--color-error)' }">
            <h2 class="flex items-center gap-2 m-0 mb-4 text-base font-semibold" :style="{ color: 'var(--color-error)' }"><Shield :size="20" /> Danger Zone</h2>
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <strong class="block text-sm mb-1" :style="{ color: 'var(--color-on-surface)' }">Delete Organization</strong>
                <p class="m-0 text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">Permanently delete this organization and all its data.</p>
              </div>
              <button class="px-4 py-2.5 rounded-sm text-sm font-semibold cursor-pointer transition" :style="{ backgroundColor: 'var(--color-error)', color: '#fff', border: 'none' }" data-testid="org-delete-btn" @click="showDeleteConfirm = true">Delete Organization</button>
            </div>
          </div>
        </section>

        <!-- Members Section -->
        <section v-if="activeSection === 'members'" class="flex flex-col gap-4 max-w-2xl" data-testid="settings-members">
          <div class="rounded-lg p-6" :style="{ backgroundColor: 'var(--color-surface-container-low)' }">
            <div class="flex justify-between items-center mb-4">
              <h2 class="flex items-center gap-2 m-0 text-base font-semibold font-display" :style="{ color: 'var(--color-on-surface)' }"><Users :size="20" /> Members ({{ members.length }})</h2>
              <button
                v-if="isAdmin"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-semibold cursor-pointer transition"
                :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff', border: 'none' }"
                data-testid="org-invite-btn"
                @click="showInviteForm = !showInviteForm"
              >
                <UserPlus :size="16" /> Invite
              </button>
            </div>

            <!-- Invite form -->
            <div v-if="showInviteForm && isAdmin" class="p-4 rounded-lg mb-4" :style="{ backgroundColor: 'var(--color-surface-container-high)' }">
              <div class="flex flex-col md:flex-row gap-3">
                <input v-model="inviteEmail" type="email" placeholder="Email address" data-testid="org-invite-email-input"
                  class="flex-1 px-3 py-2.5 rounded-sm text-sm focus:outline-none"
                  :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
                  :disabled="inviteLoading" />
                <select v-model="inviteRole" data-testid="org-invite-role-select"
                  class="w-full md:w-[120px] px-3 py-2.5 rounded-sm text-sm cursor-pointer focus:outline-none"
                  :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }"
                  :disabled="inviteLoading">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <button class="px-4 py-2.5 rounded-sm text-sm font-semibold cursor-pointer transition" :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff', border: 'none' }" data-testid="org-invite-submit-btn" @click="handleInvite" :disabled="inviteLoading">{{ inviteLoading ? 'Sending...' : 'Send Invite' }}</button>
              </div>
              <div v-if="inviteError" class="px-3.5 py-2.5 rounded-sm text-sm mt-3" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">{{ inviteError }}</div>
              <div v-if="inviteSuccess" class="px-3.5 py-2.5 rounded-sm text-sm mt-3 break-all" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', color: 'var(--color-primary)' }">{{ inviteSuccess }}</div>
            </div>

            <!-- Members list -->
            <div class="flex flex-col gap-2">
              <div
                v-for="member in members"
                :key="member.id"
                :data-testid="`member-row-${member.id}`"
                class="flex items-center gap-3 p-3 rounded-lg"
                :style="{ backgroundColor: 'var(--color-surface-container-high)' }"
              >
                <div class="w-9 h-9 flex items-center justify-center rounded-sm text-sm font-semibold shrink-0" :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff' }">
                  {{ (member.name || member.email).charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <span class="block text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">{{ member.name || member.email }}</span>
                  <span class="block text-xs whitespace-nowrap overflow-hidden text-ellipsis" :style="{ color: 'var(--color-on-surface-variant)' }">{{ member.email }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <select
                    v-if="isAdmin"
                    :value="member.role"
                    :data-testid="`member-role-${member.id}`"
                    @change="handleRoleChange(member, ($event.target as HTMLSelectElement).value as MembershipRole)"
                    class="w-auto px-2 py-1.5 text-xs rounded-sm cursor-pointer focus:outline-none"
                    :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <span v-else class="text-xs font-mono capitalize" :style="{ color: 'var(--color-primary)' }">{{ member.role }}</span>
                  <button
                    v-if="isAdmin"
                    class="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-sm cursor-pointer transition"
                    :style="{ color: 'var(--color-on-surface-variant)' }"
                    :data-testid="`member-remove-${member.id}`"
                    @click="handleRemoveMember(member)" title="Remove member">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Groups Section -->
        <section v-if="activeSection === 'groups'" class="flex flex-col gap-4 max-w-2xl" data-testid="settings-groups">
          <div class="rounded-lg p-6" :style="{ backgroundColor: 'var(--color-surface-container-low)' }">
            <div class="flex justify-between items-center mb-4">
              <h2 class="flex items-center gap-2 m-0 text-base font-semibold font-display" :style="{ color: 'var(--color-on-surface)' }"><Shield :size="20" /> Groups ({{ groups.length }})</h2>
              <button v-if="isAdmin && !showCreateGroupForm"
                class="px-3 py-1.5 rounded-sm text-sm font-semibold cursor-pointer transition"
                :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff', border: 'none' }"
                data-testid="new-group-button" @click="startCreateGroup">New Group</button>
            </div>

            <div v-if="groupMessage" class="px-3.5 py-2.5 rounded-sm text-sm mt-3 break-all" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', color: 'var(--color-primary)' }">{{ groupMessage }}</div>
            <div v-if="groupActionError" class="px-3.5 py-2.5 rounded-sm text-sm mt-3" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">{{ groupActionError }}</div>

            <div v-if="showCreateGroupForm && isAdmin" class="p-4 rounded-lg mb-4" :style="{ backgroundColor: 'var(--color-surface-container-high)' }">
              <div class="mb-4">
                <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Group Name</label>
                <input v-model="createGroupName" type="text" data-testid="create-group-name" class="w-full px-3 py-2.5 rounded-sm text-sm focus:outline-none" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :disabled="createGroupLoading" />
              </div>
              <div class="mb-4">
                <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Description (optional)</label>
                <input v-model="createGroupDescription" type="text" data-testid="create-group-description" class="w-full px-3 py-2.5 rounded-sm text-sm focus:outline-none" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :disabled="createGroupLoading" />
              </div>
              <div class="flex justify-end gap-3 mt-4">
                <button class="px-4 py-2.5 rounded-sm text-sm font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" @click="cancelCreateGroup" :disabled="createGroupLoading">Cancel</button>
                <button class="px-4 py-2.5 rounded-sm text-sm font-semibold cursor-pointer transition" :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff', border: 'none' }" data-testid="create-group-submit" @click="handleCreateGroup" :disabled="createGroupLoading">{{ createGroupLoading ? 'Creating...' : 'Create Group' }}</button>
              </div>
            </div>

            <div v-if="groupsLoading" class="p-3.5 rounded-sm text-sm" :style="{ color: 'var(--color-outline)' }">Loading groups...</div>
            <div v-else-if="groupsError" class="px-3.5 py-2.5 rounded-sm text-sm mt-3" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">{{ groupsError }}</div>
            <div v-else-if="groups.length === 0" class="p-3.5 rounded-sm text-sm" :style="{ color: 'var(--color-outline)' }">No groups yet.</div>
            <div v-else class="flex flex-col gap-3">
              <article v-for="group in groups" :key="group.id" class="rounded-lg p-3.5" :style="{ backgroundColor: 'var(--color-surface-container-high)' }" :data-testid="`group-card-${group.id}`">
                <div class="flex flex-col md:flex-row justify-between gap-3 items-start">
                  <div class="min-w-0">
                    <h3 class="m-0 text-sm" :style="{ color: 'var(--color-on-surface)' }">{{ group.name }}</h3>
                    <p class="my-1 text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">{{ group.description || 'No description' }}</p>
                    <span class="text-xs font-mono" :style="{ color: 'var(--color-outline)' }">{{ groupMemberCount(group.id) }} members</span>
                  </div>
                  <div class="flex gap-2 flex-wrap">
                    <button class="px-3 py-1.5 rounded-sm text-xs font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :data-testid="`toggle-group-members-${group.id}`" @click="toggleGroupMembers(group.id)">{{ isGroupExpanded(group.id) ? 'Hide Members' : 'Show Members' }}</button>
                    <template v-if="isAdmin && editingGroupId !== group.id">
                      <button class="px-3 py-1.5 rounded-sm text-xs font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :data-testid="`rename-group-${group.id}`" @click="startEditGroup(group)">Rename</button>
                      <button class="px-3 py-1.5 rounded-sm text-xs font-semibold cursor-pointer transition" :style="{ backgroundColor: 'var(--color-error)', color: '#fff', border: 'none' }" :data-testid="`delete-group-${group.id}`" @click="handleDeleteGroup(group)" :disabled="groupMemberActionLoading[group.id]">Delete</button>
                    </template>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <!-- Data Sources Section -->
        <section v-if="activeSection === 'datasources'" class="flex flex-col gap-4 max-w-3xl" data-testid="settings-datasources">
          <div class="rounded-lg p-6" :style="{ backgroundColor: 'var(--color-surface-container-low)' }">
            <h2 class="flex items-center gap-2 m-0 mb-2 text-base font-semibold font-display" :style="{ color: 'var(--color-on-surface)' }"><Database :size="20" /> Data Sources</h2>
            <p class="m-0 mb-4 text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">Configure connections to Prometheus, Loki, Tempo, VictoriaMetrics, and other data sources.</p>
            <DataSourceSettingsPanel v-if="orgId" :org-id="orgId" />
          </div>
        </section>

        <!-- AI Configuration Section (stub) -->
        <section v-if="activeSection === 'ai'" class="flex flex-col gap-4 max-w-2xl" data-testid="settings-ai">
          <div class="rounded-lg p-6" :style="{ backgroundColor: 'var(--color-surface-container-low)' }">
            <h2 class="flex items-center gap-2 m-0 mb-2 text-base font-semibold font-display" :style="{ color: 'var(--color-on-surface)' }"><Bot :size="20" /> AI Configuration</h2>
            <p class="m-0 mb-4 text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">Configure AI assistant settings for automated insights and anomaly detection.</p>
            <GitHubAppSettings v-if="orgId" :org-id="orgId" :is-admin="isAdmin ?? false" />
          </div>
        </section>

        <!-- SSO / Auth Section (stub) -->
        <section v-if="activeSection === 'sso'" class="flex flex-col gap-4 max-w-2xl" data-testid="settings-sso">
          <div class="rounded-lg p-6" :style="{ backgroundColor: 'var(--color-surface-container-low)' }">
            <h2 class="flex items-center gap-2 m-0 mb-2 text-base font-semibold font-display" :style="{ color: 'var(--color-on-surface)' }"><Lock :size="20" /> SSO / Auth</h2>
            <p class="m-0 mb-4 text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">Configure SSO providers and authentication settings for your organization.</p>

            <div v-if="ssoLoading" class="p-3.5 text-sm" :style="{ color: 'var(--color-outline)' }">Loading SSO settings...</div>
            <div v-else class="flex flex-col gap-3">
              <!-- Email/Password -->
              <article class="rounded-lg p-3.5 flex flex-col gap-2.5" :style="{ backgroundColor: 'var(--color-surface-container-high)' }" data-testid="sso-provider-password">
                <div>
                  <h3 class="m-0 text-sm" :style="{ color: 'var(--color-on-surface)' }">Email/Password</h3>
                  <p class="mt-1 mb-0 text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">Built-in authentication method available for all organizations.</p>
                </div>
                <span class="inline-flex px-2 py-0.5 rounded-sm text-xs font-medium w-fit" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-secondary) 15%, transparent)', color: 'var(--color-secondary)' }">Enabled</span>
              </article>

              <!-- Configured providers -->
              <article
                v-for="provider in configuredSsoProviders"
                :key="provider.key"
                class="rounded-lg p-3.5 flex flex-col gap-2.5"
                :style="{ backgroundColor: 'var(--color-surface-container-high)' }"
                :data-testid="`sso-provider-${provider.key}`"
              >
                <div>
                  <h3 class="m-0 text-sm" :style="{ color: 'var(--color-on-surface)' }">{{ provider.name }}</h3>
                  <p class="mt-1 mb-0 text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">{{ provider.configured ? 'Configured for this org.' : 'Not configured yet.' }}</p>
                </div>
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <span class="inline-flex px-2 py-0.5 rounded-sm text-xs font-medium" :style="{ backgroundColor: provider.enabled ? 'color-mix(in srgb, var(--color-secondary) 15%, transparent)' : 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)', color: provider.enabled ? 'var(--color-secondary)' : 'var(--color-tertiary)' }">{{ provider.enabled ? 'Enabled' : 'Disabled' }}</span>
                  <button v-if="isAdmin" class="px-3 py-1.5 rounded-sm text-xs font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :data-testid="`edit-sso-${provider.key}`" @click="openSsoProvider(provider.key)">
                    <Edit2 :size="14" class="inline mr-1" /> Settings
                  </button>
                </div>
              </article>

              <div v-if="configuredSsoProviders.length === 0" class="p-3.5 rounded-sm text-sm" :style="{ color: 'var(--color-outline)' }">No external authentication methods configured yet.</div>
            </div>

            <div v-if="ssoNotice" class="px-3.5 py-2.5 rounded-sm text-sm mt-3 break-all" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', color: 'var(--color-primary)' }">{{ ssoNotice }}</div>
          </div>
        </section>
      </template>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 flex items-center justify-center z-[1000]" :style="{ backgroundColor: 'rgba(0,0,0,0.5)' }" data-testid="org-delete-modal" @click.self="showDeleteConfirm = false">
      <div class="rounded-lg p-6 max-w-[400px]" :style="{ backgroundColor: 'var(--color-surface-bright)', border: '1px solid var(--color-outline-variant)' }">
        <h3 class="m-0 mb-3 text-lg font-semibold" :style="{ color: 'var(--color-on-surface)' }">Delete Organization?</h3>
        <p class="m-0 mb-6 text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">
          This will permanently delete <strong>{{ org?.name }}</strong> and all its dashboards, panels, and settings.
        </p>
        <div class="flex justify-end gap-3">
          <button class="px-4 py-2.5 rounded-sm text-sm font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" data-testid="org-delete-cancel-btn" @click="showDeleteConfirm = false" :disabled="deleteLoading">Cancel</button>
          <button class="px-4 py-2.5 rounded-sm text-sm font-semibold cursor-pointer transition" :style="{ backgroundColor: 'var(--color-error)', color: '#fff', border: 'none' }" data-testid="org-delete-confirm-btn" @click="handleDelete" :disabled="deleteLoading">{{ deleteLoading ? 'Deleting...' : 'Delete Organization' }}</button>
        </div>
      </div>
    </div>

    <!-- SSO Config Modal -->
    <div v-if="ssoDialogOpen" class="fixed inset-0 flex items-center justify-center z-[1000]" :style="{ backgroundColor: 'rgba(0,0,0,0.5)' }" data-testid="sso-config-modal" @click.self="closeSsoDialog">
      <div class="rounded-lg p-6 w-[min(640px,calc(100vw-2rem))] max-w-[640px]" :style="{ backgroundColor: 'var(--color-surface-bright)', border: '1px solid var(--color-outline-variant)' }">
        <div class="flex justify-between items-start gap-4 mb-3">
          <div>
            <h3 class="m-0 mb-1 text-base" :style="{ color: 'var(--color-on-surface)' }">{{ activeSsoLabel }} SSO Settings</h3>
            <p class="m-0 mb-3 text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">Update credentials and enable status for this provider.</p>
          </div>
          <button class="px-3 py-1.5 rounded-sm text-xs font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" data-testid="close-sso-config" @click="closeSsoDialog">Close</button>
        </div>

        <div class="rounded-lg p-4" :style="{ backgroundColor: 'var(--color-surface-container-high)' }" data-testid="sso-config-panel">
          <div v-if="activeSsoProvider === 'google'" data-testid="google-sso-card">
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Client ID</label>
              <input v-model="googleClientId" type="text" data-testid="google-client-id" class="w-full px-3 py-2.5 rounded-sm text-sm font-mono focus:outline-none" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :disabled="!isAdmin || googleSaving" />
            </div>
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Client Secret</label>
              <input v-model="googleClientSecret" type="password" data-testid="google-client-secret" placeholder="Enter to update" class="w-full px-3 py-2.5 rounded-sm text-sm font-mono focus:outline-none" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :disabled="!isAdmin || googleSaving" />
            </div>
            <label class="inline-flex items-center gap-2 m-0 text-sm" :style="{ color: 'var(--color-on-surface)' }">
              <input v-model="googleEnabled" type="checkbox" data-testid="google-enabled" class="w-auto m-0" :disabled="!isAdmin || googleSaving" />
              Enable Google SSO
            </label>
            <div v-if="googleError" class="px-3.5 py-2.5 rounded-sm text-sm mt-3" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">{{ googleError }}</div>
            <div v-if="isAdmin" class="flex justify-end gap-3 mt-3">
              <button class="px-4 py-2.5 rounded-sm text-sm font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" @click="closeSsoDialog">Cancel</button>
              <button class="px-4 py-2.5 rounded-sm text-sm font-semibold cursor-pointer transition" :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff', border: 'none' }" data-testid="save-google-sso" :disabled="googleSaving" @click="handleSaveGoogleSSO">{{ googleSaving ? 'Saving...' : 'Save Google SSO' }}</button>
            </div>
          </div>

          <div v-else-if="activeSsoProvider === 'microsoft'" data-testid="microsoft-sso-card">
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Tenant ID</label>
              <input v-model="microsoftTenantId" type="text" data-testid="microsoft-tenant-id" class="w-full px-3 py-2.5 rounded-sm text-sm font-mono focus:outline-none" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :disabled="!isAdmin || microsoftSaving" />
            </div>
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Client ID</label>
              <input v-model="microsoftClientId" type="text" data-testid="microsoft-client-id" class="w-full px-3 py-2.5 rounded-sm text-sm font-mono focus:outline-none" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :disabled="!isAdmin || microsoftSaving" />
            </div>
            <div class="mb-4">
              <label class="block mb-1.5 text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Client Secret</label>
              <input v-model="microsoftClientSecret" type="password" data-testid="microsoft-client-secret" placeholder="Enter to update" class="w-full px-3 py-2.5 rounded-sm text-sm font-mono focus:outline-none" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" :disabled="!isAdmin || microsoftSaving" />
            </div>
            <label class="inline-flex items-center gap-2 m-0 text-sm" :style="{ color: 'var(--color-on-surface)' }">
              <input v-model="microsoftEnabled" type="checkbox" data-testid="microsoft-enabled" class="w-auto m-0" :disabled="!isAdmin || microsoftSaving" />
              Enable Microsoft SSO
            </label>
            <div v-if="microsoftError" class="px-3.5 py-2.5 rounded-sm text-sm mt-3" :style="{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }">{{ microsoftError }}</div>
            <div v-if="isAdmin" class="flex justify-end gap-3 mt-3">
              <button class="px-4 py-2.5 rounded-sm text-sm font-medium cursor-pointer transition" :style="{ backgroundColor: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)' }" @click="closeSsoDialog">Cancel</button>
              <button class="px-4 py-2.5 rounded-sm text-sm font-semibold cursor-pointer transition" :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))', color: '#fff', border: 'none' }" data-testid="save-microsoft-sso" :disabled="microsoftSaving" @click="handleSaveMicrosoftSSO">{{ microsoftSaving ? 'Saving...' : 'Save Microsoft SSO' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
