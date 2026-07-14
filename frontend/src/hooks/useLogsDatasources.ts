import { useMemo } from 'react'
import { useDatasources } from '@/hooks/useDatasources'
import { isLogsType } from '@/types/datasource'

export function useLogsDatasources(orgId: string | null) {
  const query = useDatasources(orgId)

  const logsDatasources = useMemo(
    () => (query.data ?? []).filter(ds => isLogsType(ds.type)),
    [query.data],
  )

  return {
    ...query,
    logsDatasources,
  }
}