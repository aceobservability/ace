import { useQuery } from '@tanstack/react-query'
import { listDataSources } from '@/api/datasources'

export function datasourcesQueryKey(orgId: string | null) {
  return ['datasources', orgId] as const
}

export function useDatasources(orgId: string | null) {
  return useQuery({
    queryKey: datasourcesQueryKey(orgId),
    queryFn: () => listDataSources(orgId!),
    enabled: Boolean(orgId),
  })
}