import { useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useOrgStore } from '@/stores/orgStore'

export function useOrganization() {
  const organizations = useAuthStore(state => state.userOrganizations)
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const selectOrganization = useOrgStore(state => state.selectOrganization)

  const currentOrg = useMemo(() => {
    if (!currentOrgId) return organizations[0] ?? null
    return organizations.find(org => org.id === currentOrgId) ?? organizations[0] ?? null
  }, [organizations, currentOrgId])

  return { organizations, currentOrg, currentOrgId, selectOrganization }
}