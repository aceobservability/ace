import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OrganizationSettings from './OrganizationSettings.vue'

const mockRouteParams = { id: 'org-1', section: 'general' }
const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockBack = vi.fn()

const mockFetchOrganizations = vi.hoisted(() => vi.fn())

const mockGetOrganization = vi.hoisted(() => vi.fn())
const mockUpdateOrganization = vi.hoisted(() => vi.fn())
const mockDeleteOrganization = vi.hoisted(() => vi.fn())
const mockListMembers = vi.hoisted(() => vi.fn())
const mockCreateInvitation = vi.hoisted(() => vi.fn())
const mockUpdateMemberRole = vi.hoisted(() => vi.fn())
const mockRemoveMember = vi.hoisted(() => vi.fn())

const mockListGroups = vi.hoisted(() => vi.fn())
const mockCreateGroup = vi.hoisted(() => vi.fn())
const mockUpdateGroup = vi.hoisted(() => vi.fn())
const mockDeleteGroup = vi.hoisted(() => vi.fn())
const mockListGroupMembers = vi.hoisted(() => vi.fn())
const mockAddGroupMember = vi.hoisted(() => vi.fn())
const mockRemoveGroupMember = vi.hoisted(() => vi.fn())

const mockGetGoogleSSOConfig = vi.hoisted(() => vi.fn())
const mockUpdateGoogleSSOConfig = vi.hoisted(() => vi.fn())
const mockGetMicrosoftSSOConfig = vi.hoisted(() => vi.fn())
const mockUpdateMicrosoftSSOConfig = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    fetchOrganizations: mockFetchOrganizations,
  }),
}))

vi.mock('../api/organizations', () => ({
  getOrganization: mockGetOrganization,
  updateOrganization: mockUpdateOrganization,
  deleteOrganization: mockDeleteOrganization,
  listMembers: mockListMembers,
  createInvitation: mockCreateInvitation,
  updateMemberRole: mockUpdateMemberRole,
  removeMember: mockRemoveMember,
}))

vi.mock('../api/groups', () => ({
  listGroups: mockListGroups,
  createGroup: mockCreateGroup,
  updateGroup: mockUpdateGroup,
  deleteGroup: mockDeleteGroup,
  listGroupMembers: mockListGroupMembers,
  addGroupMember: mockAddGroupMember,
  removeGroupMember: mockRemoveGroupMember,
}))

vi.mock('../api/sso', () => ({
  getGoogleSSOConfig: mockGetGoogleSSOConfig,
  updateGoogleSSOConfig: mockUpdateGoogleSSOConfig,
  getMicrosoftSSOConfig: mockGetMicrosoftSSOConfig,
  updateMicrosoftSSOConfig: mockUpdateMicrosoftSSOConfig,
}))

const baseOrg = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  role: 'admin',
  created_at: '2026-02-08T00:00:00Z',
  updated_at: '2026-02-08T00:00:00Z',
}

const baseMembers = [
  {
    id: 'mem-1',
    user_id: 'user-1',
    email: 'owner@example.com',
    name: 'Owner',
    role: 'admin',
    created_at: '2026-02-08T00:00:00Z',
  },
  {
    id: 'mem-2',
    user_id: 'user-2',
    email: 'editor@example.com',
    name: 'Editor',
    role: 'editor',
    created_at: '2026-02-08T00:00:00Z',
  },
]

const baseGroup = {
  id: 'group-1',
  organization_id: 'org-1',
  name: 'Platform Team',
  description: 'Infra owners',
  created_by: 'user-1',
  created_at: '2026-02-08T00:00:00Z',
  updated_at: '2026-02-08T00:00:00Z',
}

describe('OrganizationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteParams.section = 'general'

    mockGetOrganization.mockResolvedValue({ ...baseOrg })
    mockUpdateOrganization.mockResolvedValue({ ...baseOrg })
    mockDeleteOrganization.mockResolvedValue(undefined)
    mockListMembers.mockResolvedValue([...baseMembers])
    mockCreateInvitation.mockResolvedValue({ token: 'abc' })
    mockUpdateMemberRole.mockResolvedValue(undefined)
    mockRemoveMember.mockResolvedValue(undefined)

    mockListGroups.mockResolvedValue([{ ...baseGroup }])
    mockCreateGroup.mockResolvedValue({ ...baseGroup })
    mockUpdateGroup.mockResolvedValue({ ...baseGroup, name: 'Renamed Team' })
    mockDeleteGroup.mockResolvedValue(undefined)
    mockListGroupMembers.mockResolvedValue([
      {
        id: 'membership-1',
        organization_id: 'org-1',
        group_id: 'group-1',
        user_id: 'user-1',
        email: 'owner@example.com',
        name: 'Owner',
        created_at: '2026-02-08T00:00:00Z',
        updated_at: '2026-02-08T00:00:00Z',
      },
    ])
    mockAddGroupMember.mockResolvedValue({})
    mockRemoveGroupMember.mockResolvedValue(undefined)

    mockGetGoogleSSOConfig.mockResolvedValue({
      client_id: 'google-client-id',
      enabled: true,
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    })
    mockUpdateGoogleSSOConfig.mockResolvedValue({
      client_id: 'google-client-id-updated',
      enabled: false,
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    })
    mockGetMicrosoftSSOConfig.mockResolvedValue({
      tenant_id: 'tenant-1',
      client_id: 'microsoft-client-id',
      enabled: false,
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    })
    mockUpdateMicrosoftSSOConfig.mockResolvedValue({
      tenant_id: 'tenant-2',
      client_id: 'microsoft-client-id-updated',
      enabled: true,
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    })

    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('alert', vi.fn(() => undefined))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lets admins create, rename, delete groups and manage memberships', async () => {
    mockRouteParams.section = 'groups'

    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(wrapper.text()).toContain('Groups (1)')
    expect(wrapper.text()).toContain('Platform Team')

    await wrapper.get('[data-testid="new-group-button"]').trigger('click')
    await wrapper.get('[data-testid="create-group-name"]').setValue('SRE Team')
    await wrapper.get('[data-testid="create-group-description"]').setValue('Reliability')
    await wrapper.get('[data-testid="create-group-submit"]').trigger('click')
    await flushPromises()

    expect(mockCreateGroup).toHaveBeenCalledWith('org-1', {
      name: 'SRE Team',
      description: 'Reliability',
    })

    await wrapper.get('[data-testid="rename-group-group-1"]').trigger('click')
    await wrapper.get('[data-testid="edit-group-name"]').setValue('Renamed Team')
    await wrapper.get('[data-testid="save-group-group-1"]').trigger('click')
    await flushPromises()

    expect(mockUpdateGroup).toHaveBeenCalledWith('org-1', 'group-1', {
      name: 'Renamed Team',
      description: 'Infra owners',
    })

    await wrapper.get('[data-testid="toggle-group-members-group-1"]').trigger('click')
    await flushPromises()

    expect(mockListGroupMembers).toHaveBeenCalledWith('org-1', 'group-1')

    await wrapper.get('[data-testid="add-member-select-group-1"]').setValue('user-2')
    await wrapper.get('[data-testid="add-member-button-group-1"]').trigger('click')
    await flushPromises()

    expect(mockAddGroupMember).toHaveBeenCalledWith('org-1', 'group-1', { user_id: 'user-2' })

    await wrapper.get('[data-testid="remove-member-group-1-user-1"]').trigger('click')
    await flushPromises()

    expect(mockRemoveGroupMember).toHaveBeenCalledWith('org-1', 'group-1', 'user-1')

    await wrapper.get('[data-testid="delete-group-group-1"]').trigger('click')
    await flushPromises()

    expect(mockDeleteGroup).toHaveBeenCalledWith('org-1', 'group-1')
  })

  it('shows read-only groups UI for non-admin members', async () => {
    mockRouteParams.section = 'groups'

    mockGetOrganization.mockResolvedValueOnce({
      ...baseOrg,
      role: 'viewer',
    })

    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(wrapper.find('[data-testid="new-group-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="rename-group-group-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="delete-group-group-1"]').exists()).toBe(false)

    await wrapper.get('[data-testid="toggle-group-members-group-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="add-member-button-group-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="remove-member-group-1-user-1"]').exists()).toBe(false)
  })

  it('shows empty and error states for groups section', async () => {
    mockRouteParams.section = 'groups'

    mockListGroups.mockResolvedValueOnce([])

    const emptyWrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(emptyWrapper.text()).toContain('No groups yet.')

    mockListGroups.mockRejectedValueOnce(new Error('Failed to fetch groups'))
    const errorWrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(errorWrapper.text()).toContain('Failed to fetch groups')
  })

  it('navigates between settings sections with active sidebar state', async () => {
    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    const generalLink = wrapper.get('[data-testid="settings-section-general"]')
    const membersLink = wrapper.get('[data-testid="settings-section-members"]')
    const groupsLink = wrapper.get('[data-testid="settings-section-groups"]')

    expect(generalLink.classes()).toContain('text-emerald-600')
    expect(wrapper.text()).toContain('Single Sign-On')

    await membersLink.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/settings/org/org-1/members')

    await groupsLink.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/settings/org/org-1/groups')
  })

  it('redirects invalid sections to general', async () => {
    mockRouteParams.section = 'invalid-section'

    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(mockReplace).toHaveBeenCalledWith('/settings/org/org-1/general')
    expect(wrapper.text()).toContain('Single Sign-On')
  })

  it('loads and saves Google and Microsoft SSO settings for admins', async () => {
    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(mockGetGoogleSSOConfig).toHaveBeenCalledWith('org-1')
    expect(mockGetMicrosoftSSOConfig).toHaveBeenCalledWith('org-1')
    expect(wrapper.find('[data-testid="sso-provider-password"]').exists()).toBe(true)

    await wrapper.get('[data-testid="edit-sso-google"]').trigger('click')
    await flushPromises()

    expect((wrapper.get('[data-testid="google-client-id"]').element as HTMLInputElement).value).toBe(
      'google-client-id',
    )

    await wrapper.get('[data-testid="back-sso-provider-picker"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-provider-option-microsoft"]').trigger('click')
    await flushPromises()
    expect((wrapper.get('[data-testid="microsoft-tenant-id"]').element as HTMLInputElement).value).toBe('tenant-1')

    await wrapper.get('[data-testid="back-sso-provider-picker"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-provider-option-google"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="google-client-id"]').setValue('google-client-id-updated')
    await wrapper.get('[data-testid="google-client-secret"]').setValue('google-secret')
    await wrapper.get('[data-testid="google-enabled"]').setValue(false)
    await wrapper.get('[data-testid="save-google-sso"]').trigger('click')
    await flushPromises()

    expect(mockUpdateGoogleSSOConfig).toHaveBeenCalledWith('org-1', {
      client_id: 'google-client-id-updated',
      client_secret: 'google-secret',
      enabled: false,
    })

    await wrapper.get('[data-testid="back-sso-provider-picker"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-provider-option-microsoft"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="microsoft-tenant-id"]').setValue('tenant-2')
    await wrapper.get('[data-testid="microsoft-client-id"]').setValue('microsoft-client-id-updated')
    await wrapper.get('[data-testid="microsoft-client-secret"]').setValue('microsoft-secret')
    await wrapper.get('[data-testid="microsoft-enabled"]').setValue(true)
    await wrapper.get('[data-testid="save-microsoft-sso"]').trigger('click')
    await flushPromises()

    expect(mockUpdateMicrosoftSSOConfig).toHaveBeenCalledWith('org-1', {
      tenant_id: 'tenant-2',
      client_id: 'microsoft-client-id-updated',
      client_secret: 'microsoft-secret',
      enabled: true,
    })
  })

  it('starts add-provider flow from picker and only shows unconfigured providers', async () => {
    mockGetMicrosoftSSOConfig.mockRejectedValueOnce(new Error('Microsoft SSO not configured'))

    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(wrapper.find('[data-testid="sso-provider-password"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sso-provider-google"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sso-provider-microsoft"]').exists()).toBe(false)

    await wrapper.get('[data-testid="add-authentication"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="sso-provider-option-google"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sso-provider-option-microsoft"]').exists()).toBe(true)

    await wrapper.get('[data-testid="sso-provider-option-microsoft"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="microsoft-sso-card"]').exists()).toBe(true)
  })

  it('shows read-only SSO controls for non-admin members', async () => {
    mockGetOrganization.mockResolvedValueOnce({
      ...baseOrg,
      role: 'viewer',
    })

    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(wrapper.text()).toContain('Only organization admins can update SSO settings.')
    expect(wrapper.find('[data-testid="add-authentication"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edit-sso-google"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="edit-sso-microsoft"]').exists()).toBe(false)
  })

  it('renders SSO save API errors for both providers', async () => {
    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    mockUpdateGoogleSSOConfig.mockRejectedValueOnce(new Error('Failed to save Google config'))
    await wrapper.get('[data-testid="edit-sso-google"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="google-client-id"]').setValue('google-client-id-updated')
    await wrapper.get('[data-testid="google-client-secret"]').setValue('google-secret')
    await wrapper.get('[data-testid="save-google-sso"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to save Google config')

    mockUpdateMicrosoftSSOConfig.mockRejectedValueOnce(new Error('Failed to save Microsoft config'))
    await wrapper.get('[data-testid="back-sso-provider-picker"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-provider-option-microsoft"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="microsoft-tenant-id"]').setValue('tenant-2')
    await wrapper.get('[data-testid="microsoft-client-id"]').setValue('microsoft-client-id-updated')
    await wrapper.get('[data-testid="microsoft-client-secret"]').setValue('microsoft-secret')
    await wrapper.get('[data-testid="save-microsoft-sso"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to save Microsoft config')
  })

  it('shows provider-specific SSO load errors', async () => {
    mockGetGoogleSSOConfig.mockRejectedValueOnce(new Error('Admin access required'))
    mockGetMicrosoftSSOConfig.mockRejectedValueOnce(new Error('Microsoft provider unavailable'))

    const wrapper = mount(OrganizationSettings)
    await flushPromises()

    expect(wrapper.text()).toContain('Admin access required')
    expect(wrapper.text()).toContain('Microsoft provider unavailable')
  })
})
