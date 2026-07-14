import type { LucideIcon } from 'lucide-react'

type SidebarNavButtonProps = {
  testId: string
  icon: LucideIcon
  label?: string
  active: boolean
  expanded: boolean
  color?: string
  title?: string
  onClick: () => void
}

export function SidebarNavButton({
  testId,
  icon: Icon,
  label,
  active,
  expanded,
  color = 'var(--color-outline)',
  title,
  onClick,
}: SidebarNavButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      className={`relative flex shrink-0 cursor-pointer items-center border-none transition-all duration-150 ${expanded ? 'w-full gap-3 rounded-lg px-3' : 'mx-auto justify-center rounded-lg'}`}
      style={{
        width: expanded ? '100%' : '44px',
        height: '40px',
        borderRadius: '8px',
        backgroundColor: active ? 'var(--color-primary-muted)' : 'transparent',
        color: active ? color : 'var(--color-outline)',
      }}
      onClick={onClick}
    >
      {active && (
        <div
          data-testid="sidebar-accent-bar"
          className="absolute top-2 bottom-2"
          style={{
            left: expanded ? '0px' : '-2px',
            width: '3px',
            backgroundColor: 'var(--color-primary)',
            borderRadius: '2px',
          }}
        />
      )}
      <Icon size={18} className="shrink-0" />
      {expanded && label && (
        <span className="truncate text-sm" style={{ fontWeight: active ? '500' : '400' }}>
          {label}
        </span>
      )}
    </button>
  )
}