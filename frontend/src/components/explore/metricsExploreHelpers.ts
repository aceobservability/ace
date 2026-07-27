import type { DataSourceType } from '@/types/datasource'

export type TraceMetricsNavigationContext = {
  serviceName?: string
  startMs?: number
  endMs?: number
  createdAt?: number
}

export const METRICS_HISTORY_KEY = 'explore_query_history'
export const TRACE_METRICS_NAVIGATION_CONTEXT_KEY = 'trace_metrics_navigation'

function escapePromQLLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeForSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''")
}

export function getDefaultMetricsQuery(type_: DataSourceType): string {
  switch (type_) {
    case 'prometheus':
    case 'victoriametrics':
      return ''
    case 'clickhouse':
      return "SELECT\n  toStartOfInterval(TimeUnix, INTERVAL 1 minute) AS timestamp,\n  avg(Value) AS value,\n  MetricName AS metric\nFROM otel_metrics_gauge\nWHERE TimeUnix >= fromUnixTimestamp({start})\n  AND TimeUnix <= fromUnixTimestamp({end})\nGROUP BY timestamp, metric\nORDER BY timestamp"
    case 'elasticsearch':
      return '{"index":"ace-logs","aggs":{"timeseries":{"date_histogram":{"field":"@timestamp","fixed_interval":"1m","min_doc_count":0}}}}'
    case 'cloudwatch':
      return '{"namespace":"AWS/EC2","metric_name":"CPUUtilization","stat":"Average","period":60}'
    default:
      return ''
  }
}

export function buildServiceMetricsQuery(type_: DataSourceType, serviceName: string): string {
  if (type_ === 'clickhouse') {
    const escapedService = escapeForSingleQuotedValue(serviceName)
    if (!escapedService) {
      return 'SELECT timestamp, value, metric FROM metrics WHERE timestamp >= toDateTime({start}) AND timestamp <= toDateTime({end}) ORDER BY timestamp'
    }

    return `SELECT timestamp, value, metric\nFROM metrics\nWHERE timestamp >= toDateTime({start}) AND timestamp <= toDateTime({end})\nAND service_name = '${escapedService}'\nORDER BY timestamp`
  }

  if (type_ === 'cloudwatch') {
    return JSON.stringify(
      {
        namespace: 'AWS/ECS',
        metric_name: 'CPUUtilization',
        dimensions: serviceName ? { ServiceName: serviceName } : {},
        stat: 'Average',
        period: 60,
      },
      null,
      2,
    )
  }

  if (type_ === 'elasticsearch') {
    const serviceFilter = serviceName ? [{ term: { 'service.name.keyword': serviceName } }] : []

    return JSON.stringify(
      {
        index: 'ace-logs',
        query: {
          bool: {
            filter: serviceFilter,
          },
        },
        aggs: {
          timeseries: {
            date_histogram: {
              field: '@timestamp',
              fixed_interval: '30s',
              min_doc_count: 0,
            },
          },
        },
      },
      null,
      2,
    )
  }

  if (!serviceName) {
    return 'sum(rate(http_requests_total[5m]))'
  }

  const escapedService = escapePromQLLabelValue(serviceName)
  return `sum(rate(http_requests_total{service="${escapedService}"}[5m])) or sum(rate(http_requests_total{service_name="${escapedService}"}[5m]))`
}

export function getMetricsSmokeQuery(type_: DataSourceType): string {
  if (type_ === 'prometheus' || type_ === 'victoriametrics') {
    return 'up'
  }
  if (type_ === 'clickhouse') {
    return "SELECT now() AS timestamp, toFloat64(1) AS value, 'up' AS metric LIMIT 1"
  }
  if (type_ === 'cloudwatch') {
    return '{"namespace":"AWS/EC2","metric_name":"CPUUtilization","stat":"Average","period":60}'
  }
  if (type_ === 'elasticsearch') {
    return '{"index":"ace-logs","aggs":{"timeseries":{"date_histogram":{"field":"@timestamp","fixed_interval":"1m","min_doc_count":0}}}}'
  }
  if (type_ === 'loki') {
    return '{job=~".+"}'
  }
  return '*'
}

export function isPrometheusLike(type_: DataSourceType): boolean {
  return type_ === 'prometheus' || type_ === 'victoriametrics'
}
