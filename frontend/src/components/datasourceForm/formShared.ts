import type { DataSourceType } from '@/types/datasource'

export type AuthType = 'none' | 'basic' | 'bearer' | 'api_key'

export type AuthFields = {
  authType: AuthType
  basicUsername: string
  basicPassword: string
  bearerToken: string
  apiKeyHeader: string
  apiKeyValue: string
  database: string
  cloudWatchRegion: string
  cloudWatchMetricNamespace: string
  cloudWatchLogGroup: string
  cloudWatchAccessKeyId: string
  cloudWatchSecretAccessKey: string
  cloudWatchSessionToken: string
  elasticsearchIndex: string
  elasticsearchTimestampField: string
  elasticsearchMessageField: string
  elasticsearchLevelField: string
  traceIdField: string
  linkedTraceDatasourceId: string | null
}

export const TYPE_OPTIONS: Array<{ value: DataSourceType; label: string }> = [
  { value: 'prometheus', label: 'Prometheus (PromQL)' },
  { value: 'victoriametrics', label: 'VictoriaMetrics (PromQL)' },
  { value: 'loki', label: 'Loki (LogQL)' },
  { value: 'victorialogs', label: 'Victoria Logs (LogsQL)' },
  { value: 'tempo', label: 'Tempo (Tracing)' },
  { value: 'victoriatraces', label: 'VictoriaTraces (Tracing)' },
  { value: 'clickhouse', label: 'ClickHouse (SQL)' },
  { value: 'cloudwatch', label: 'CloudWatch (Metrics + Logs)' },
  { value: 'elasticsearch', label: 'Elasticsearch (ELK)' },
  { value: 'vmalert', label: 'VMAlert (Alerting)' },
  { value: 'alertmanager', label: 'AlertManager (Alerting)' },
]

export const inputClass =
  'w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition border-none'
export const labelClass = 'block text-sm font-medium text-[var(--color-on-surface-variant)] mb-1.5'
export const sectionClass = 'rounded-lg bg-[var(--color-surface-container-low)] p-6'
export const selectClass =
  "w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2.5 text-sm text-[var(--color-on-surface)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition border-none appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-9"

export function emptyAuthFields(): AuthFields {
  return {
    authType: 'none',
    basicUsername: '',
    basicPassword: '',
    bearerToken: '',
    apiKeyHeader: 'X-API-Key',
    apiKeyValue: '',
    database: '',
    cloudWatchRegion: '',
    cloudWatchMetricNamespace: '',
    cloudWatchLogGroup: '',
    cloudWatchAccessKeyId: '',
    cloudWatchSecretAccessKey: '',
    cloudWatchSessionToken: '',
    elasticsearchIndex: '',
    elasticsearchTimestampField: '',
    elasticsearchMessageField: '',
    elasticsearchLevelField: '',
    traceIdField: 'trace_id',
    linkedTraceDatasourceId: null,
  }
}

export type PatchAuth = (patch: Partial<AuthFields>) => void
