import { ArrowRight, Clock, Star } from 'lucide-react'
import { SidebarSectionLabel } from '@/components/sidebar/SidebarSectionLabel'
import type { FavoriteItem, RecentDashboard } from '@/lib/favorites'
import { formatTimeAgo } from '@/lib/sidebarFilter'

type SidebarDashboardFlyoutProps = {
  favorites: FavoriteItem[]
  recents: RecentDashboard[]
  highlightedIndex: number
  favoritesOffset: number
  query: string
  hasAnyResults: boolean
  currentPath: string
  onNavigate: (path: string) => void
}

export function SidebarDashboardFlyout({
  favorites,
  recents,
  highlightedIndex,
  favoritesOffset,
  query,
  hasAnyResults,
  currentPath,
  onNavigate,
}: SidebarDashboardFlyoutProps) {
  return (
    <>
      <div role="group" aria-labelledby="sidebar-favorites-label">
        <SidebarSectionLabel id="sidebar-favorites-label">Favorites</SidebarSectionLabel>
        {favorites.length > 0 ? (
          favorites.map((fav, idx) => (
            <button
              key={fav.id}
              type="button"
              data-testid={`sidebar-fav-${fav.id}`}
              className={`sidebar-subnav-item ${highlightedIndex === idx ? 'highlighted' : ''}`}
              onClick={() => onNavigate(`/app/dashboards/${fav.id}`)}
            >
              <Star size={14} fill="currentColor" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span className="flex-1 truncate">{fav.title}</span>
            </button>
          ))
        ) : !query ? (
          <div data-testid="sidebar-empty-favorites" className="sidebar-empty-hint">
            <Star size={18} style={{ opacity: 0.3, color: 'var(--color-outline)' }} />
            <span>Star dashboards to pin them here</span>
          </div>
        ) : null}
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }} />

      <div role="group" aria-labelledby="sidebar-recents-label">
        <SidebarSectionLabel id="sidebar-recents-label">Recents</SidebarSectionLabel>
        {recents.length > 0 ? (
          recents.map((recent, rIdx) => (
            <button
              key={recent.id}
              type="button"
              data-testid={`sidebar-recent-${recent.id}`}
              className={`sidebar-subnav-item ${highlightedIndex === favoritesOffset + rIdx ? 'highlighted' : ''}`}
              onClick={() => onNavigate(`/app/dashboards/${recent.id}`)}
            >
              <Clock size={14} style={{ color: 'var(--color-outline)', flexShrink: 0 }} />
              <span className="flex-1 truncate">{recent.title}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--color-outline)',
                  flexShrink: 0,
                }}
              >
                {formatTimeAgo(recent.visitedAt)}
              </span>
            </button>
          ))
        ) : !query ? (
          <div data-testid="sidebar-empty-recents" className="sidebar-empty-hint">
            <Clock size={18} style={{ opacity: 0.3, color: 'var(--color-outline)' }} />
            <span>Recently visited dashboards appear here</span>
          </div>
        ) : null}
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }} />

      <button
        type="button"
        data-testid="sidebar-nav-all-dashboards"
        className={`sidebar-subnav-item ${highlightedIndex === favoritesOffset + recents.length ? 'highlighted' : ''}`}
        aria-current={currentPath === '/app/dashboards' ? 'page' : undefined}
        onClick={() => onNavigate('/app/dashboards')}
      >
        <span className="flex-1">All Dashboards</span>
        <ArrowRight size={14} style={{ color: 'var(--color-outline)' }} />
      </button>

      {query && !hasAnyResults && (
        <div data-testid="sidebar-no-results" className="sidebar-empty-hint">
          <span>No matches</span>
        </div>
      )}
    </>
  )
}