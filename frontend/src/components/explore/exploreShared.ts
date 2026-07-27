import type { DataSourceType } from '@/types/datasource'
import { dataSourceTypeLogos } from '@/utils/datasourceLogos'

export type DatasourceHealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

export type ExploreDatasourceChanged = {
  id: string
  name: string
  type: string
}

export const TRACE_NAVIGATION_MAX_AGE_MS = 5 * 60 * 1000
export const MAX_QUERY_HISTORY = 10

export function getTypeLogo(type_: DataSourceType): string | undefined {
  return dataSourceTypeLogos[type_]
}

export function readQueryHistory(storageKey: string): string[] {
  try {
    const stored = sessionStorage.getItem(storageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function writeQueryHistory(storageKey: string, history: string[]): void {
  sessionStorage.setItem(storageKey, JSON.stringify(history))
}

export function pushQueryHistory(
  storageKey: string,
  current: string[],
  query: string,
  max = MAX_QUERY_HISTORY,
): string[] {
  if (!query.trim()) return current
  const filtered = current.filter(item => item !== query)
  const next = [query, ...filtered].slice(0, max)
  writeQueryHistory(storageKey, next)
  return next
}

export function healthLabel(status: DatasourceHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'unhealthy':
      return 'Unhealthy'
    case 'checking':
      return 'Checking...'
    default:
      return 'Unknown'
  }
}
