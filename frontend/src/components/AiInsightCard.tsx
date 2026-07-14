type InsightType = 'anomaly' | 'optimization' | 'forecast'

type AiInsightCardProps = {
  title: string
  description: string
  timestamp: string
  type: InsightType
}

const colorMap: Record<InsightType, { border: string; bg: string }> = {
  anomaly: { border: '#C9960F', bg: 'rgba(201,150,15,0.05)' },
  optimization: { border: '#4D8BBD', bg: 'rgba(77,139,189,0.05)' },
  forecast: { border: '#D4A11E', bg: 'rgba(212,161,30,0.05)' },
}

export function AiInsightCard({ title, description, timestamp, type }: AiInsightCardProps) {
  const colors = colorMap[type]

  return (
    <div
      data-testid="ai-insight-card"
      style={{
        borderLeft: `2px solid ${colors.border}`,
        backgroundColor: colors.bg,
        borderRadius: '0 8px 8px 0',
        padding: '10px 12px',
      }}
    >
      <h4 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
        {title}
      </h4>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        {description}
      </p>
      <time className="mt-1 block text-xs" style={{ color: 'var(--color-outline)' }} dateTime={timestamp}>
        {timestamp}
      </time>
    </div>
  )
}