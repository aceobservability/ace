import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardList } from '@/components/DashboardList'
import { useFavoritesStore } from '@/stores/favoritesStore'

export function DashboardsPage() {
  const navigate = useNavigate()
  const favorites = useFavoritesStore(state => state.favorites)
  const [searchQuery, setSearchQuery] = useState('')

  const dashboardCountLabel = useMemo(() => {
    const count = favorites.length
    if (count === 0) return 'Explore your dashboards'
    return `${count} pinned dashboard${count === 1 ? '' : 's'}`
  }, [favorites.length])

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="font-display text-2xl font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Dashboards
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            {dashboardCountLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              backgroundColor: 'var(--color-surface-container-low)',
              border: 'none',
            }}
          >
            <Search size={16} style={{ color: 'var(--color-outline)' }} />
            <input
              type="search"
              placeholder="Search dashboards..."
              data-testid="dashboard-search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="w-48 border-none bg-transparent text-sm focus:outline-none"
              style={{ color: 'var(--color-on-surface)' }}
            />
          </div>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }}
            data-testid="new-dashboard-btn"
            onClick={() => navigate('/app/dashboards/new/ai')}
          >
            <Plus size={16} />
            New Dashboard
          </button>
        </div>
      </header>

      <DashboardList searchQuery={searchQuery} />
    </div>
  )
}