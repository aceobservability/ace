import { Star } from 'lucide-react'
import { SidebarSectionLabel } from '@/components/sidebar/SidebarSectionLabel'
import type { SubNavItem } from '@/components/sidebar/navigationConfig'
import type { FavoriteItem } from '@/lib/favorites'
import { favoriteRoute } from '@/lib/favorites'

type SidebarSectionFlyoutProps = {
  favorites: FavoriteItem[]
  subNav: SubNavItem[]
  highlightedIndex: number
  favoritesOffset: number
  query: string
  hasAnyResults: boolean
  currentPath: string
  onNavigate: (path: string) => void
}

function isSubNavActive(currentPath: string, item: SubNavItem): boolean {
  return currentPath === item.path || currentPath.startsWith(`${item.path}/`)
}

export function SidebarSectionFlyout({
  favorites,
  subNav,
  highlightedIndex,
  favoritesOffset,
  query,
  hasAnyResults,
  currentPath,
  onNavigate,
}: SidebarSectionFlyoutProps) {
  return (
    <>
      {favorites.length > 0 && (
        <div role="group" aria-labelledby="sidebar-section-favorites-label">
          <SidebarSectionLabel id="sidebar-section-favorites-label">Favorites</SidebarSectionLabel>
          {favorites.map((fav, idx) => (
            <button
              key={fav.id}
              type="button"
              data-testid={`sidebar-fav-${fav.id}`}
              className={`sidebar-subnav-item ${highlightedIndex === idx ? 'highlighted' : ''}`}
              onClick={() => onNavigate(favoriteRoute(fav))}
            >
              <Star size={14} fill="currentColor" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span className="flex-1 truncate">{fav.title}</span>
            </button>
          ))}
          <div style={{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }} />
        </div>
      )}

      {subNav.map((item, idx) => {
        const subActive = isSubNavActive(currentPath, item)
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`sidebar-subnav-${item.id}`}
            aria-current={subActive ? 'page' : undefined}
            className={`sidebar-subnav-item ${highlightedIndex === favoritesOffset + idx ? 'highlighted' : ''}`}
            style={{
              fontWeight: subActive ? '500' : '400',
              color: subActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              backgroundColor: subActive ? 'var(--color-primary-muted)' : 'transparent',
              borderLeft: subActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
            onClick={() => onNavigate(item.path)}
          >
            {item.label}
          </button>
        )
      })}

      {query && !hasAnyResults && (
        <div data-testid="sidebar-no-results" className="sidebar-empty-hint">
          <span>No matches</span>
        </div>
      )}
    </>
  )
}