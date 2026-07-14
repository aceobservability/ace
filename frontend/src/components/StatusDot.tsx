type StatusDotProps = {
  status: 'healthy' | 'warning' | 'critical' | 'info'
  pulse?: boolean
  size?: number
}

const colorMap: Record<StatusDotProps['status'], string> = {
  healthy: 'var(--color-secondary)',
  warning: 'var(--color-tertiary)',
  critical: 'var(--color-error)',
  info: 'var(--color-primary)',
}

const labelMap: Record<StatusDotProps['status'], string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  info: 'Info',
}

export function StatusDot({ status, size = 4 }: StatusDotProps) {
  return (
    <span
      role="status"
      aria-label={labelMap[status]}
      data-testid="status-dot"
      data-status={status}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: colorMap[status],
        borderRadius: '9999px',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}