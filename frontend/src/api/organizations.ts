import { trackEvent } from '../analytics'
import type {
  CreateInvitationRequest,
  CreateOrganizationRequest,
  Invitation,
  Member,
  Organization,
  UpdateBrandingRequest,
  UpdateMemberRoleRequest,
  UpdateOrganizationRequest,
} from '../types/organization'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function listOrganizations(): Promise<Organization[]> {
  const response = await fetch(`${API_BASE}/api/orgs`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired, please log in again')
    }
    throw new Error('Failed to fetch organizations')
  }
  return response.json()
}

export async function getOrganization(id: string): Promise<Organization> {
  const response = await fetch(`${API_BASE}/api/orgs/${id}`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired, please log in again')
    }
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    if (response.status === 404) {
      throw new Error('Organization not found')
    }
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to load organization')
  }
  return response.json()
}

export async function createOrganization(data: CreateOrganizationRequest): Promise<Organization> {
  const response = await fetch(`${API_BASE}/api/orgs`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    if (response.status === 409) {
      throw new Error('Organization slug already exists')
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create organization')
  }
  return response.json()
}

export async function updateOrganization(
  id: string,
  data: UpdateOrganizationRequest,
): Promise<Organization> {
  const response = await fetch(`${API_BASE}/api/orgs/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('organization_update_failed', {
      org_id: id,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 409) {
      throw new Error('Organization slug already exists')
    }
    throw new Error('Failed to update organization')
  }
  const organization = await response.json()
  trackEvent('organization_updated', {
    org_id: id,
    updated_fields: Object.keys(data),
  })
  return organization
}

export async function deleteOrganization(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/orgs/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error('Failed to delete organization')
  }
}

export async function createInvitation(
  orgId: string,
  data: CreateInvitationRequest,
): Promise<Invitation> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/invitations`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('organization_invite_failed', {
      org_id: orgId,
      role: data.role,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 409) {
      throw new Error('User is already a member')
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create invitation')
  }
  const invitation = await response.json()
  trackEvent('organization_invite_created', {
    org_id: orgId,
    role: data.role,
  })
  return invitation
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/members`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired, please log in again')
    }
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    throw new Error('Failed to fetch members')
  }
  return response.json()
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  data: UpdateMemberRoleRequest,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/members/${userId}/role`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('organization_member_role_update_failed', {
      org_id: orgId,
      user_id: userId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 400) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'Cannot update role')
    }
    throw new Error('Failed to update member role')
  }

  trackEvent('organization_member_role_updated', {
    org_id: orgId,
    user_id: userId,
    role: data.role,
  })
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/members/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    trackEvent('organization_member_remove_failed', {
      org_id: orgId,
      user_id: userId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 400) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'Cannot remove member')
    }
    throw new Error('Failed to remove member')
  }

  trackEvent('organization_member_removed', {
    org_id: orgId,
    user_id: userId,
  })
}

async function updateOrgBranding(
  orgId: string,
  data: UpdateBrandingRequest,
): Promise<Organization> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/branding`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update branding')
  }
  trackEvent('organization_branding_updated', {
    org_id: orgId,
  })
  return response.json()
}
