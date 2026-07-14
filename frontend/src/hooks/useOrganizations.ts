import { useQuery } from '@tanstack/react-query'
import { listOrganizations } from '@/api/organizations'
import { useAuthStore } from '@/stores/authStore'

export const organizationsQueryKey = ['organizations'] as const

export function useOrganizations() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)

  return useQuery({
    queryKey: organizationsQueryKey,
    queryFn: listOrganizations,
    enabled: isAuthenticated,
  })
}