import { create } from 'zustand'

const FAVORITES_KEY = 'ace-favorites'
const RECENTS_KEY = 'ace-recents'
const MAX_RECENTS = 10

export type FavoriteItem = {
  id: string
  title: string
  type: 'dashboard' | 'service' | 'alert' | 'explore'
}

export type RecentDashboard = {
  id: string
  title: string
  visitedAt: number
}

function readFavorites(): FavoriteItem[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated: FavoriteItem[] = parsed.map((id: string) => ({
        id,
        title: '(untitled)',
        type: 'dashboard' as const,
      }))
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(migrated))
      return migrated
    }

    return parsed as FavoriteItem[]
  } catch {
    return []
  }
}

function readRecents(): RecentDashboard[] {
  try {
    const stored = localStorage.getItem(RECENTS_KEY)
    return stored ? (JSON.parse(stored) as RecentDashboard[]) : []
  } catch {
    return []
  }
}

function persistFavorites(favorites: FavoriteItem[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
}

function persistRecents(recents: RecentDashboard[]): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents))
}

export function favoriteRoute(item: FavoriteItem): string {
  switch (item.type) {
    case 'dashboard':
      return `/app/dashboards/${item.id}`
    case 'service':
      return '/app/services'
    case 'alert':
      return '/app/alerts'
    case 'explore': {
      const [, exploreType, ...queryParts] = item.id.split('::')
      const query = queryParts.join('::')
      return `/app/explore/${exploreType || 'metrics'}?q=${encodeURIComponent(query || '')}`
    }
    default:
      return '/app'
  }
}

type FavoritesState = {
  favorites: FavoriteItem[]
  recentDashboards: RecentDashboard[]
  toggleFavorite: (item: { id: string; title: string; type?: string }) => void
  isFavorite: (id: string) => boolean
  addRecent: (dashboard: RecentDashboard) => void
  favoritesForType: (type: FavoriteItem['type']) => FavoriteItem[]
  _reset: () => void
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: readFavorites(),
  recentDashboards: readRecents(),

  toggleFavorite(item) {
    const { favorites } = get()
    const index = favorites.findIndex(fav => fav.id === item.id)
    const next =
      index >= 0
        ? favorites.filter(fav => fav.id !== item.id)
        : [
            ...favorites,
            {
              id: item.id,
              title: item.title,
              type: (item.type || 'dashboard') as FavoriteItem['type'],
            },
          ]
    persistFavorites(next)
    set({ favorites: next })
  },

  isFavorite(id) {
    return get().favorites.some(fav => fav.id === id)
  },

  addRecent(dashboard) {
    const filtered = get().recentDashboards.filter(d => d.id !== dashboard.id)
    const updated = [dashboard, ...filtered].slice(0, MAX_RECENTS)
    persistRecents(updated)
    set({ recentDashboards: updated })
  },

  favoritesForType(type) {
    return get().favorites.filter(f => f.type === type)
  },

  _reset() {
    set({ favorites: readFavorites(), recentDashboards: readRecents() })
  },
}))