import type { AMMatcher, VMAlertRule } from '@/types/datasource'

export type AlertStatusDot = 'healthy' | 'warning' | 'critical' | 'info'

export function stateToStatusDot(state: string): AlertStatusDot {
  switch (state) {
    case 'firing':
    case 'active':
      return 'critical'
    case 'pending':
    case 'suppressed':
      return 'warning'
    default:
      return 'healthy'
  }
}

export function formatAlertDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function formatAlertInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m`
}

export function truncateId(id: string): string {
  return id.length > 8 ? `${id.substring(0, 8)}...` : id
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function matcherOperator(m: AMMatcher): string {
  if (m.isEqual) return m.isRegex ? '=~' : '='
  return m.isRegex ? '!~' : '!='
}

/** Serialize a VMAlert rule into Prometheus-style YAML for copy/export. */
export function ruleToYaml(rule: VMAlertRule, groupName?: string): string {
  const lines: string[] = []
  if (groupName) {
    lines.push(`# group: ${groupName}`)
  }
  if (rule.type === 'recording') {
    lines.push(`- record: ${rule.name}`)
  } else {
    lines.push(`- alert: ${rule.name}`)
  }
  lines.push(`  expr: ${rule.query}`)
  if (rule.duration > 0 && rule.type !== 'recording') {
    lines.push(`  for: ${formatAlertDuration(rule.duration)}`)
  }
  const labels = Object.entries(rule.labels ?? {})
  if (labels.length > 0) {
    lines.push('  labels:')
    for (const [key, value] of labels) {
      lines.push(`    ${key}: ${JSON.stringify(value)}`)
    }
  }
  const annotations = Object.entries(rule.annotations ?? {})
  if (annotations.length > 0) {
    lines.push('  annotations:')
    for (const [key, value] of annotations) {
      lines.push(`    ${key}: ${JSON.stringify(value)}`)
    }
  }
  return lines.join('\n')
}
