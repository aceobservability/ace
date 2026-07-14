import {
  type FavoriteItem,
  type RecentDashboard,
  persistFavorites,
  persistRecents,
  readFavorites,
  readRecents,
} from '@/lib/favorites'
import { create } from 'zustand'

export type { FavoriteItem, RecentDashboard } from '@/lib/favorites'
export { favoriteRoute } from '@/lib/favorites'

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
    const updated = [dashboard, ...filtered].slice(0, 10)
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