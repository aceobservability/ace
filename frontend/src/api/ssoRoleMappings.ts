import { API_BASE, getAuthHeaders } from './sso'

export interface SSOConfigRoleMapping {
  id: string
  organization_id: string
  sso_config_id: string
  sso_group_name: string
  ace_role: string
  created_at: string
}

interface CreateSSOConfigRoleMappingRequest {
  sso_group_name: string
  ace_role: string
}

export async function listRoleMappings(
  orgId: string,
  provider: string,
): Promise<SSOConfigRoleMapping[]> {
  const res = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/${provider}/role-mappings`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load role mappings')
  return res.json()
}

export async function createRoleMapping(
  orgId: string,
  provider: string,
  req: CreateSSOConfigRoleMappingRequest,
): Promise<SSOConfigRoleMapping> {
  const res = await fetch(`${API_BASE}/api/orgs/${orgId}/sso/${provider}/role-mappings`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(req),
  })
  if (res.status === 409) throw new Error('This group is already mapped')
  if (!res.ok) throw new Error('Failed to create role mapping')
  return res.json()
}

export async function deleteRoleMapping(
  orgId: string,
  provider: string,
  mappingId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/orgs/${orgId}/sso/${provider}/role-mappings/${mappingId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    },
  )
  if (!res.ok) throw new Error('Failed to delete role mapping')
}
