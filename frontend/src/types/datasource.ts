export type DataSourceType =
  | 'prometheus'
  | 'loki'
  | 'victorialogs'
  | 'victoriametrics'
  | 'tempo'
  | 'victoriatraces'
  | 'clickhouse'
  | 'cloudwatch'
  | 'elasticsearch'
  | 'vmalert'
  | 'alertmanager'

export interface DataSource {
  id: string
  organization_id: string
  name: string
  type: DataSourceType
  url: string
  is_default: boolean
  auth_type: string
  auth_config?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CreateDataSourceRequest {
  name: string
  type: DataSourceType
  url: string
  is_default?: boolean
  auth_type?: string
  auth_config?: Record<string, unknown>
}

export interface UpdateDataSourceRequest {
  name?: string
  type?: DataSourceType
  url?: string
  is_default?: boolean
  auth_type?: string
  auth_config?: Record<string, unknown>
}

export interface DataSourceQueryRequest {
  query: string
  signal?: 'logs' | 'metrics' | 'traces'
  start: number
  end: number
  step?: number
  limit?: number
}

export interface DataSourceLogStreamRequest {
  query: string
  start?: number
  limit?: number
}

export interface MetricResult {
  metric: Record<string, string>
  values: [number, string][]
}

export interface LogEntry {
  timestamp: string
  line: string
  labels?: Record<string, string>
  level?: string
}

export interface TraceLog {
  timestampUnixNano: number
  fields?: Record<string, string>
}

export interface TraceSpan {
  spanId: string
  parentSpanId?: string
  operationName: string
  serviceName: string
  startTimeUnixNano: number
  durationNano: number
  tags?: Record<string, string>
  logs?: TraceLog[]
  status?: string
}

export interface Trace {
  traceId: string
  spans: TraceSpan[]
  services: string[]
  startTimeUnixNano: number
  durationNano: number
}

export interface TraceServiceGraphNode {
  serviceName: string
  requestCount: number
  errorCount: number
  errorRate: number
  averageDurationNano: number
}

export interface TraceServiceGraphEdge {
  source: string
  target: string
  requestCount: number
  errorCount: number
  errorRate: number
  averageDurationNano: number
}

export interface TraceServiceGraph {
  nodes: TraceServiceGraphNode[]
  edges: TraceServiceGraphEdge[]
  totalRequests: number
  totalErrorCount: number
}

export interface TraceSummary {
  traceId: string
  rootServiceName?: string
  rootOperationName?: string
  startTimeUnixNano: number
  durationNano: number
  spanCount: number
  serviceCount: number
  errorSpanCount: number
}

export interface TraceSearchRequest {
  query?: string
  service?: string
  operation?: string
  tags?: Record<string, string>
  minDuration?: string
  maxDuration?: string
  start?: number
  end?: number
  limit?: number
}

export interface DataSourceQueryResult {
  status: 'success' | 'error'
  data?: {
    resultType: string
    result?: MetricResult[]
    logs?: LogEntry[]
    traces?: TraceSpan[]
  }
  error?: string
  resultType: 'metrics' | 'logs' | 'traces'
}

export function isMetricsType(type_: DataSourceType): boolean {
  return type_ === 'prometheus' || type_ === 'victoriametrics' || type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch'
}

export function isLogsType(type_: DataSourceType): boolean {
  return type_ === 'loki' || type_ === 'victorialogs' || type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch'
}

export function isTracingType(type_: DataSourceType): boolean {
  return type_ === 'tempo' || type_ === 'victoriatraces' || type_ === 'clickhouse'
}

export interface VMAlertAlert {
  state: string
  name: string
  value: string
  labels: Record<string, string>
  annotations: Record<string, string>
  activeAt: string
  expression?: string
}

export interface VMAlertAlertsResponse {
  status: string
  data: {
    alerts: VMAlertAlert[]
  }
}

export interface VMAlertRule {
  state: string
  name: string
  query: string
  duration: number
  labels: Record<string, string>
  annotations: Record<string, string>
  lastError?: string
  health?: string
  type: string
  alerts?: VMAlertAlert[]
}

export interface VMAlertRuleGroup {
  name: string
  file: string
  rules: VMAlertRule[]
  interval: number
}

export interface VMAlertGroupsResponse {
  status: string
  data: {
    groups: VMAlertRuleGroup[]
  }
}

export function isAlertingType(type_: DataSourceType): boolean {
  return type_ === 'vmalert' || type_ === 'alertmanager'
}

export const dataSourceTypeLabels: Record<DataSourceType, string> = {
  prometheus: 'Prometheus',
  loki: 'Loki',
  victorialogs: 'Victoria Logs',
  victoriametrics: 'VictoriaMetrics',
  tempo: 'Tempo',
  victoriatraces: 'VictoriaTraces',
  clickhouse: 'ClickHouse',
  cloudwatch: 'CloudWatch',
  elasticsearch: 'Elasticsearch',
  vmalert: 'VMAlert',
  alertmanager: 'AlertManager',
}

export interface AMAlert {
  labels: Record<string, string>
  annotations: Record<string, string>
  startsAt: string
  endsAt: string
  generatorURL: string
  fingerprint: string
  status: {
    state: string
    silencedBy: string[]
    inhibitedBy: string[]
  }
  receivers: { name: string }[]
}

export interface AMMatcher {
  name: string
  value: string
  isRegex: boolean
  isEqual: boolean
}

export interface AMSilence {
  id: string
  matchers: AMMatcher[]
  startsAt: string
  endsAt: string
  createdBy: string
  comment: string
  status: {
    state: string
  }
  updatedAt: string
}

export interface AMSilenceCreate {
  matchers: AMMatcher[]
  startsAt: string
  endsAt: string
  createdBy: string
  comment: string
}

export interface AMReceiver {
  name: string
}
