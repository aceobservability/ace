import type { OrganizationMembership } from '@/api/auth'
import { create } from 'zustand'

const CURRENT_ORG_KEY = 'current_org_id'

type OrgState = {
  currentOrgId: string | null
  initializeFromMemberships: (memberships: OrganizationMembership[]) => void
  selectOrganization: (orgId: string) => void
  clear: () => void
}

function readStoredOrgId(): string | null {
  return localStorage.getItem(CURRENT_ORG_KEY)
}

function persistOrgId(orgId: string | null): void {
  if (orgId) {
    localStorage.setItem(CURRENT_ORG_KEY, orgId)
  } else {
    localStorage.removeItem(CURRENT_ORG_KEY)
  }
}

function resolveOrgId(memberships: OrganizationMembership[]): string | null {
  if (memberships.length === 0) return null

  const stored = readStoredOrgId()
  if (stored && memberships.some(org => org.id === stored)) {
    return stored
  }

  return memberships[0]?.id ?? null
}

export const useOrgStore = create<OrgState>(set => ({
  currentOrgId: readStoredOrgId(),

  initializeFromMemberships(memberships) {
    const orgId = resolveOrgId(memberships)
    persistOrgId(orgId)
    set({ currentOrgId: orgId })
  },

  selectOrganization(orgId) {
    persistOrgId(orgId)
    set({ currentOrgId: orgId })
  },

  clear() {
    persistOrgId(null)
    set({ currentOrgId: null })
  },
}))