import { useMemo } from 'react'
import { useDatasources } from '@/hooks/useDatasources'
import { isTracingType } from '@/types/datasource'

export function useTracingDatasources(orgId: string | null) {
  const query = useDatasources(orgId)

  const tracingDatasources = useMemo(
    () => (query.data ?? []).filter(ds => isTracingType(ds.type)),
    [query.data],
  )

  return {
    ...query,
    tracingDatasources,
  }
}