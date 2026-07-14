type SidebarSectionLabelProps = {
  id: string
  children: string
}

export function SidebarSectionLabel({ id, children }: SidebarSectionLabelProps) {
  return (
    <div
      id={id}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-outline)',
        padding: '6px 10px 4px',
      }}
    >
      {children}
    </div>
  )
}