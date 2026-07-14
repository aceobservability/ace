import type { Organization } from '@/types/organization'

export function resolveCurrentOrg(
  organizations: Organization[],
  currentOrgId: string | null,
): Organization | null {
  if (organizations.length === 0) return null
  if (!currentOrgId) return organizations[0] ?? null
  return organizations.find(org => org.id === currentOrgId) ?? organizations[0] ?? null
}

export function isValidOrgId(organizations: Organization[], orgId: string): boolean {
  return organizations.some(org => org.id === orgId)
}