import type {
  AddUserGroupMemberRequest,
  CreateUserGroupRequest,
  UpdateUserGroupRequest,
  UserGroup,
  UserGroupMembership,
} from '../types/rbac'
import { trackEvent } from '../analytics'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  const error = await response.json().catch(() => ({})) as { error?: string }
  return error.error || fallback
}

export async function listGroups(orgId: string): Promise<UserGroup[]> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/groups`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch groups'))
  }

  return response.json()
}

export async function createGroup(orgId: string, data: CreateUserGroupRequest): Promise<UserGroup> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/groups`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    trackEvent('settings_group_create_failed', {
      org_id: orgId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error(await getErrorMessage(response, 'Failed to create group'))
  }

  const group = await response.json()
  trackEvent('settings_group_created', {
    org_id: orgId,
    group_id: group.id,
  })
  return group
}

export async function updateGroup(
  orgId: string,
  groupId: string,
  data: UpdateUserGroupRequest,
): Promise<UserGroup> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/groups/${groupId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    trackEvent('settings_group_update_failed', {
      org_id: orgId,
      group_id: groupId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Group not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to update group'))
  }

  const group = await response.json()
  trackEvent('settings_group_updated', {
    org_id: orgId,
    group_id: groupId,
    updated_fields: Object.keys(data),
  })
  return group
}

export async function deleteGroup(orgId: string, groupId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/groups/${groupId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    trackEvent('settings_group_delete_failed', {
      org_id: orgId,
      group_id: groupId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Group not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to delete group'))
  }

  trackEvent('settings_group_deleted', {
    org_id: orgId,
    group_id: groupId,
  })
}

export async function listGroupMembers(orgId: string, groupId: string): Promise<UserGroupMembership[]> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/groups/${groupId}/members`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    if (response.status === 404) {
      throw new Error('Group not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to fetch group members'))
  }

  return response.json()
}

export async function addGroupMember(
  orgId: string,
  groupId: string,
  data: AddUserGroupMemberRequest,
): Promise<UserGroupMembership> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/groups/${groupId}/members`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    trackEvent('settings_group_member_add_failed', {
      org_id: orgId,
      group_id: groupId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Group not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to add group member'))
  }

  const membership = await response.json()
  trackEvent('settings_group_member_added', {
    org_id: orgId,
    group_id: groupId,
    user_id: data.user_id,
  })
  return membership
}

export async function removeGroupMember(orgId: string, groupId: string, userId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    trackEvent('settings_group_member_remove_failed', {
      org_id: orgId,
      group_id: groupId,
      user_id: userId,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    if (response.status === 404) {
      throw new Error('Group member not found')
    }
    throw new Error(await getErrorMessage(response, 'Failed to remove group member'))
  }

  trackEvent('settings_group_member_removed', {
    org_id: orgId,
    group_id: groupId,
    user_id: userId,
  })
}
