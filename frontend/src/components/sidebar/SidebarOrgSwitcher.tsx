import { Check } from 'lucide-react'
import { useRef } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { Organization } from '@/types/organization'

type SidebarOrgSwitcherProps = {
  organizations: Organization[]
  currentOrg: Organization | null
  expanded: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (orgId: string) => void
}

export function SidebarOrgSwitcher({
  organizations,
  currentOrg,
  expanded,
  open,
  onOpenChange,
  onSelect,
}: SidebarOrgSwitcherProps) {
  const orgMenuRef = useRef<HTMLDivElement>(null)
  const orgSelectorRef = useRef<HTMLButtonElement>(null)

  useClickOutside(orgMenuRef, open, () => onOpenChange(false), [orgSelectorRef])

  const orgInitial = currentOrg?.name ? currentOrg.name.charAt(0).toUpperCase() : '?'

  return (
    <>
      <button
        ref={orgSelectorRef}
        type="button"
        data-testid="sidebar-org-selector"
        className={`flex shrink-0 cursor-pointer items-center transition-colors duration-150 ${expanded ? 'w-full gap-2 rounded-lg px-2 py-1.5' : 'justify-center rounded-md'}`}
        style={{
          width: expanded ? '100%' : '32px',
          height: expanded ? 'auto' : '32px',
          backgroundColor: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-stroke-subtle)',
          color: 'var(--color-on-surface-variant)',
          fontSize: '12px',
          fontWeight: '600',
          fontFamily: 'var(--font-display)',
        }}
        title={currentOrg?.name || 'Select organization'}
        onClick={() => onOpenChange(!open)}
      >
        <span className="shrink-0">{orgInitial}</span>
        {expanded && (
          <span className="flex-1 truncate text-left text-xs" style={{ color: 'var(--color-on-surface)' }}>
            {currentOrg?.name || 'Select org'}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={orgMenuRef}
          data-testid="org-switcher-popup"
          className="animate-fade-in fixed z-[60] overflow-hidden"
          style={{
            left: expanded
              ? 'calc(var(--sidebar-rail-width, 52px) + var(--sidebar-flyout-width, 196px) + 4px)'
              : 'calc(var(--sidebar-rail-width, 52px) + 4px)',
            top: 'calc(12px + 32px + 4px)',
            width: '220px',
            backgroundColor: 'var(--color-surface-bright)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            border: '1px solid var(--color-stroke-subtle)',
          }}
        >
          <div
            className="px-3 py-2 text-xs font-semibold tracking-wide uppercase"
            style={{
              color: 'var(--color-outline)',
              fontSize: '10px',
              borderBottom: '1px solid var(--color-stroke-subtle)',
            }}
          >
            Organizations
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {organizations.map(org => (
              <button
                key={org.id}
                type="button"
                data-testid={`org-switcher-${org.id}`}
                className="org-item flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-sm transition-colors"
                style={{
                  color: currentOrg?.id === org.id ? 'var(--color-primary)' : 'var(--color-on-surface)',
                }}
                onClick={() => onSelect(org.id)}
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
                  style={{
                    backgroundColor:
                      currentOrg?.id === org.id ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
                    color: currentOrg?.id === org.id ? '#0C0D0F' : 'var(--color-on-surface-variant)',
                  }}
                >
                  {org.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate text-left">{org.name}</span>
                {currentOrg?.id === org.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}