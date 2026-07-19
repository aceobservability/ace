import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as groupsApi from '@/api/groups'
import * as organizationsApi from '@/api/organizations'
import * as ssoApi from '@/api/sso'
import * as ssoRoleMappingsApi from '@/api/ssoRoleMappings'
import { SettingsPage } from '@/pages/SettingsPage'
import { useAuthStore } from '@/stores/authStore'
import { useOrgStore } from '@/stores/orgStore'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { Member, Organization } from '@/types/organization'
import type { UserGroup, UserGroupMembership } from '@/types/rbac'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: 'org-1',
    currentOrg: {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      role: 'admin' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    organizations: [],
    selectOrganization: vi.fn(),
    isLoading: false,
    error: null,
  }),
}))

const mockOrg: Organization = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  role: 'admin',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  branding: {
    primary_color: '#C9960F',
    app_title: 'Acme Ace',
  },
}

const mockMembers: Member[] = [
  {
    id: 'mem-1',
    user_id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'admin',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mem-2',
    user_id: 'user-2',
    email: 'bob@example.com',
    name: 'Bob',
    role: 'viewer',
    created_at: '2026-01-02T00:00:00Z',
  },
]

const multiAdminMembers: Member[] = [
  ...mockMembers,
  {
    id: 'mem-3',
    user_id: 'user-3',
    email: 'carol@example.com',
    name: 'Carol',
    role: 'admin',
    created_at: '2026-01-03T00:00:00Z',
  },
]

function renderSettings(initialPath = '/app/settings/members') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      { path: '/app/settings', element: <SettingsPage /> },
      { path: '/app/settings/:section', element: <SettingsPage /> },
      { path: '/app/dashboards', element: <div>Dashboards</div> },
    ],
    { initialEntries: [initialPath] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      userOrganizations: [],
      loading: false,
      initialized: true,
      isAuthenticated: true,
    })

    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(mockOrg)
    vi.spyOn(organizationsApi, 'listMembers').mockResolvedValue(mockMembers)
    vi.spyOn(groupsApi, 'listGroups').mockResolvedValue([])
    vi.spyOn(ssoApi, 'getGoogleSSOConfig').mockRejectedValue(new Error('Google SSO not configured'))
    vi.spyOn(ssoApi, 'getMicrosoftSSOConfig').mockRejectedValue(
      new Error('Microsoft SSO not configured'),
    )
    vi.spyOn(ssoApi, 'getOktaSSOConfig').mockResolvedValue(null)
    vi.spyOn(ssoRoleMappingsApi, 'listRoleMappings').mockResolvedValue([])
  })

  describe('members section', () => {
    it('renders member list with mocked API data', async () => {
      renderSettings('/app/settings/members')

      await waitFor(() => {
        expect(screen.getByTestId('settings-members')).toBeTruthy()
      })

      expect(screen.getByTestId('members-list')).toBeTruthy()
      expect(screen.getByTestId('member-row-mem-1')).toBeTruthy()
      expect(screen.getByTestId('member-row-mem-2')).toBeTruthy()
      expect(screen.getByText('Alice')).toBeTruthy()
      expect(screen.getByText('alice@example.com')).toBeTruthy()
      expect(screen.getByText('Bob')).toBeTruthy()
      expect(screen.getByText('bob@example.com')).toBeTruthy()
      expect(organizationsApi.listMembers).toHaveBeenCalledWith('org-1')
    })

    it('allows inviting a member without rendering the invite token', async () => {
      const user = userEvent.setup()
      vi.spyOn(organizationsApi, 'createInvitation').mockResolvedValue({
        token: 'invite-token-secret-xyz',
        email: 'carol@example.com',
        role: 'editor',
        expires_at: '2026-12-01T00:00:00Z',
      })

      renderSettings('/app/settings/members')

      await waitFor(() => {
        expect(screen.getByTestId('org-invite-btn')).toBeTruthy()
      })

      await user.click(screen.getByTestId('org-invite-btn'))
      await user.type(screen.getByTestId('org-invite-email-input'), 'carol@example.com')
      await user.selectOptions(screen.getByTestId('org-invite-role-select'), 'editor')
      await user.click(screen.getByTestId('org-invite-submit-btn'))

      await waitFor(() => {
        expect(organizationsApi.createInvitation).toHaveBeenCalledWith('org-1', {
          email: 'carol@example.com',
          role: 'editor',
        })
      })

      const success = await screen.findByTestId('org-invite-success')
      expect(success.textContent).toContain('Invitation sent to carol@example.com')
      expect(success.textContent).not.toContain('invite-token-secret-xyz')
      expect(screen.queryByText(/invite-token-secret-xyz/)).toBeNull()
    })

    it('updates member role via mocked API', async () => {
      const user = userEvent.setup()
      vi.spyOn(organizationsApi, 'updateMemberRole').mockResolvedValue(undefined)

      renderSettings('/app/settings/members')

      await waitFor(() => {
        expect(screen.getByTestId('member-role-mem-2')).toBeTruthy()
      })

      await user.selectOptions(screen.getByTestId('member-role-mem-2'), 'editor')

      await waitFor(() => {
        expect(organizationsApi.updateMemberRole).toHaveBeenCalledWith('org-1', 'user-2', {
          role: 'editor',
        })
      })
    })

    it('disables self-remove and last-admin demotion controls', async () => {
      renderSettings('/app/settings/members')

      await waitFor(() => {
        expect(screen.getByTestId('member-row-mem-1')).toBeTruthy()
      })

      const selfRemove = screen.getByTestId('member-remove-mem-1') as HTMLButtonElement
      const selfRole = screen.getByTestId('member-role-mem-1') as HTMLSelectElement
      expect(selfRemove.disabled).toBe(true)
      expect(selfRole.disabled).toBe(true)

      // Sole admin cannot be removed even if not self — Bob is not admin, so enabled.
      const bobRemove = screen.getByTestId('member-remove-mem-2') as HTMLButtonElement
      expect(bobRemove.disabled).toBe(false)
    })

    it('blocks demoting the last admin via disabled role control', async () => {
      vi.spyOn(organizationsApi, 'updateMemberRole').mockResolvedValue(undefined)

      renderSettings('/app/settings/members')

      await waitFor(() => {
        expect(screen.getByTestId('member-role-mem-1')).toBeTruthy()
      })

      const roleSelect = screen.getByTestId('member-role-mem-1') as HTMLSelectElement
      expect(roleSelect.disabled).toBe(true)
      expect(roleSelect.title).toMatch(/cannot change your own role|last admin/i)
      expect(organizationsApi.updateMemberRole).not.toHaveBeenCalled()
    })

    it('allows removing another admin when multiple admins exist', async () => {
      const user = userEvent.setup()
      vi.spyOn(organizationsApi, 'listMembers').mockResolvedValue(multiAdminMembers)
      vi.spyOn(organizationsApi, 'removeMember').mockResolvedValue(undefined)
      window.confirm = vi.fn(() => true)

      renderSettings('/app/settings/members')

      await waitFor(() => {
        expect(screen.getByTestId('member-remove-mem-3')).toBeTruthy()
      })

      const carolRemove = screen.getByTestId('member-remove-mem-3') as HTMLButtonElement
      expect(carolRemove.disabled).toBe(false)

      await user.click(carolRemove)

      await waitFor(() => {
        expect(organizationsApi.removeMember).toHaveBeenCalledWith('org-1', 'user-3')
      })
    })
  })

  describe('groups section', () => {
    const mockGroup: UserGroup = {
      id: 'group-1',
      organization_id: 'org-1',
      name: 'Engineering',
      description: 'Eng team',
      created_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const mockGroupMember: UserGroupMembership = {
      id: 'gm-1',
      organization_id: 'org-1',
      group_id: 'group-1',
      user_id: 'user-2',
      email: 'bob@example.com',
      name: 'Bob',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    it('adds and removes group members via mocked API', async () => {
      const user = userEvent.setup()
      vi.spyOn(groupsApi, 'listGroups').mockResolvedValue([mockGroup])
      vi.spyOn(groupsApi, 'listGroupMembers').mockResolvedValue([mockGroupMember])
      vi.spyOn(groupsApi, 'addGroupMember').mockResolvedValue({
        id: 'gm-2',
        organization_id: 'org-1',
        group_id: 'group-1',
        user_id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      })
      vi.spyOn(groupsApi, 'removeGroupMember').mockResolvedValue(undefined)
      window.confirm = vi.fn(() => true)

      renderSettings('/app/settings/groups')

      await waitFor(() => {
        expect(screen.getByTestId('group-card-group-1')).toBeTruthy()
      })

      await user.click(screen.getByTestId('toggle-group-members-group-1'))

      await waitFor(() => {
        expect(screen.getByTestId('group-member-group-1-user-2')).toBeTruthy()
      })

      await user.selectOptions(screen.getByTestId('add-group-member-select-group-1'), 'user-1')
      await user.click(screen.getByTestId('add-group-member-submit-group-1'))

      await waitFor(() => {
        expect(groupsApi.addGroupMember).toHaveBeenCalledWith('org-1', 'group-1', {
          user_id: 'user-1',
        })
      })

      await user.click(screen.getByTestId('remove-group-member-group-1-user-2'))

      await waitFor(() => {
        expect(groupsApi.removeGroupMember).toHaveBeenCalledWith('org-1', 'group-1', 'user-2')
      })
    })
  })

  describe('SSO config section', () => {
    it('renders SSO empty state and provider picker when no providers configured', async () => {
      const user = userEvent.setup()
      renderSettings('/app/settings/sso')

      await waitFor(() => {
        expect(screen.getByTestId('settings-sso')).toBeTruthy()
      })

      expect(screen.getByTestId('sso-provider-password')).toBeTruthy()
      expect(screen.getByTestId('sso-empty-state')).toBeTruthy()
      expect(screen.getByText(/Connect an identity provider/)).toBeTruthy()

      await user.click(screen.getByTestId('add-provider-empty-btn'))
      expect(screen.getByTestId('add-provider-empty-dropdown')).toBeTruthy()
      expect(screen.getByTestId('add-provider-empty-google')).toBeTruthy()
      expect(screen.getByTestId('add-provider-empty-microsoft')).toBeTruthy()
      expect(screen.getByTestId('add-provider-empty-okta')).toBeTruthy()
    })

    it('loads configured Google SSO and opens config modal', async () => {
      const user = userEvent.setup()
      vi.spyOn(ssoApi, 'getGoogleSSOConfig').mockResolvedValue({
        client_id: 'google-client-id',
        enabled: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })

      renderSettings('/app/settings/sso')

      await waitFor(() => {
        expect(screen.getByTestId('sso-provider-google')).toBeTruthy()
      })

      const googleCard = screen.getByTestId('sso-provider-google')
      expect(within(googleCard).getByText('Google')).toBeTruthy()
      expect(within(googleCard).getByText('Enabled')).toBeTruthy()

      await user.click(screen.getByTestId('edit-sso-google'))

      expect(await screen.findByTestId('sso-config-modal')).toBeTruthy()
      expect(screen.getByTestId('google-sso-card')).toBeTruthy()
      expect(screen.getByTestId('google-client-id')).toHaveProperty('value', 'google-client-id')
      expect(screen.getByTestId('google-enabled')).toHaveProperty('checked', true)
    })

    it('saves Google SSO config via mocked API', async () => {
      const user = userEvent.setup()
      vi.spyOn(ssoApi, 'getGoogleSSOConfig').mockResolvedValue({
        client_id: 'google-client-id',
        enabled: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })
      vi.spyOn(ssoApi, 'updateGoogleSSOConfig').mockResolvedValue({
        client_id: 'google-client-id-new',
        enabled: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      })

      renderSettings('/app/settings/sso')

      await waitFor(() => {
        expect(screen.getByTestId('edit-sso-google')).toBeTruthy()
      })

      await user.click(screen.getByTestId('edit-sso-google'))
      await screen.findByTestId('google-sso-card')

      await user.clear(screen.getByTestId('google-client-id'))
      await user.type(screen.getByTestId('google-client-id'), 'google-client-id-new')
      await user.type(screen.getByTestId('google-client-secret'), 'secret-value')
      await user.click(screen.getByTestId('google-enabled'))
      await user.click(screen.getByTestId('save-google-sso'))

      await waitFor(() => {
        expect(ssoApi.updateGoogleSSOConfig).toHaveBeenCalledWith('org-1', {
          client_id: 'google-client-id-new',
          client_secret: 'secret-value',
          enabled: true,
        })
      })

      expect(await screen.findByText('Google SSO settings saved')).toBeTruthy()
    })

    it('loads Okta SSO with role mappings', async () => {
      const user = userEvent.setup()
      vi.spyOn(ssoApi, 'getOktaSSOConfig').mockResolvedValue({
        tenant_id: 'dev-12345',
        client_id: 'okta-client',
        groups_claim_name: 'groups',
        default_role: 'viewer',
        enabled: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })
      vi.spyOn(ssoRoleMappingsApi, 'listRoleMappings').mockResolvedValue([
        {
          id: 'map-1',
          organization_id: 'org-1',
          sso_config_id: 'cfg-1',
          sso_group_name: 'Engineering',
          ace_role: 'editor',
          created_at: '2026-01-01T00:00:00Z',
        },
      ])

      renderSettings('/app/settings/sso')

      await waitFor(() => {
        expect(screen.getByTestId('sso-provider-okta')).toBeTruthy()
      })

      expect(screen.getByText('1 mapping')).toBeTruthy()
      await user.click(screen.getByTestId('edit-sso-okta'))

      expect(await screen.findByTestId('okta-sso-card')).toBeTruthy()
      expect(screen.getByTestId('okta-domain')).toHaveProperty('value', 'dev-12345')
      expect(screen.getByTestId('okta-role-mappings-section')).toBeTruthy()
      expect(screen.getByTestId('mapping-row-map-1')).toBeTruthy()
      expect(screen.getByText('Engineering')).toBeTruthy()
    })
  })

  describe('section navigation', () => {
    it('renders section navigation and switches sections', async () => {
      const user = userEvent.setup()
      const router = renderSettings('/app/settings/general')

      await waitFor(() => {
        expect(screen.getByTestId('settings-section-nav')).toBeTruthy()
      })

      expect(screen.getByTestId('settings-nav-general')).toBeTruthy()
      expect(screen.getByTestId('settings-nav-members')).toBeTruthy()
      expect(screen.getByTestId('settings-nav-sso')).toBeTruthy()
      expect(screen.getByTestId('settings-general')).toBeTruthy()
      expect(screen.getByTestId('settings-branding')).toBeTruthy()

      await user.click(screen.getByTestId('settings-nav-members'))

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/app/settings/members')
        expect(screen.getByTestId('settings-members')).toBeTruthy()
      })
    })
  })
})
