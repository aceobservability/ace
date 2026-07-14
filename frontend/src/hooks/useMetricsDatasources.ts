import { useMemo } from 'react'
import { useDatasources } from '@/hooks/useDatasources'
import { isMetricsType } from '@/types/datasource'

export function useMetricsDatasources(orgId: string | null) {
  const query = useDatasources(orgId)

  const metricsDatasources = useMemo(
    () => (query.data ?? []).filter(ds => isMetricsType(ds.type)),
    [query.data],
  )

  return {
    ...query,
    metricsDatasources,
  }
}