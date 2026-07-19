import { useMemo } from 'react'
import { useDatasources } from '@/hooks/useDatasources'
import { isAlertingType } from '@/types/datasource'

export function useAlertingDatasources(orgId: string | null) {
  const query = useDatasources(orgId)

  const alertingDatasources = useMemo(
    () => (query.data ?? []).filter(ds => isAlertingType(ds.type)),
    [query.data],
  )

  return {
    ...query,
    alertingDatasources,
  }
}
