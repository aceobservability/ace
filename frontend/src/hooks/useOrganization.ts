import { useCallback, useMemo } from 'react'
import { useOrganizations } from '@/hooks/useOrganizations'
import { isValidOrgId, resolveCurrentOrg } from '@/lib/org'
import { useOrgStore } from '@/stores/orgStore'

export function useOrganization() {
  const { data: organizations = [], isLoading, error } = useOrganizations()
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const setOrgId = useOrgStore(state => state.selectOrganization)

  const currentOrg = useMemo(
    () => resolveCurrentOrg(organizations, currentOrgId),
    [organizations, currentOrgId],
  )

  const selectOrganization = useCallback(
    (orgId: string) => {
      if (!isValidOrgId(organizations, orgId)) return false
      setOrgId(orgId)
      return true
    },
    [organizations, setOrgId],
  )

  return {
    organizations,
    currentOrg,
    currentOrgId,
    selectOrganization,
    isLoading,
    error,
  }
}