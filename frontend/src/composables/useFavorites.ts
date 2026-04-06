import { ref } from 'vue'

const FAVORITES_KEY = 'ace-favorites'
const RECENTS_KEY = 'ace-recents'
const MAX_RECENTS = 10

export interface FavoriteItem {
  id: string
  title: string
  type: 'dashboard' | 'service' | 'alert' | 'explore'
}

export interface RecentDashboard {
  id: string
  title: string
  visitedAt: number
}

function readFavorites(): FavoriteItem[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    // Migration: bare strings → tuples
    if (parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated: FavoriteItem[] = parsed.map((id: string) => ({
        id,
        title: '(untitled)',
        type: 'dashboard' as const,
      }))
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(migrated))
      return migrated
    }

    return parsed
  } catch {
    return []
  }
}

function readRecents(): RecentDashboard[] {
  try {
    const stored = localStorage.getItem(RECENTS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

const favorites = ref<FavoriteItem[]>(readFavorites())
const recentDashboards = ref<RecentDashboard[]>(readRecents())

function persistFavorites(): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.value))
}

function persistRecents(): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recentDashboards.value))
}

function toggleFavorite(item: { id: string; title: string; type?: string }): void {
  const index = favorites.value.findIndex((fav) => fav.id === item.id)
  if (index >= 0) {
    favorites.value = favorites.value.filter((fav) => fav.id !== item.id)
  } else {
    favorites.value = [...favorites.value, {
      id: item.id,
      title: item.title,
      type: (item.type || 'dashboard') as FavoriteItem['type'],
    }]
  }
  persistFavorites()
}

function isFavorite(id: string): boolean {
  return favorites.value.some((fav) => fav.id === id)
}

function addRecent(dashboard: RecentDashboard): void {
  // Remove existing entry for same id
  const filtered = recentDashboards.value.filter((d) => d.id !== dashboard.id)
  // Add to front (most recent first)
  const updated = [dashboard, ...filtered]
  // Keep only last N
  recentDashboards.value = updated.slice(0, MAX_RECENTS)
  persistRecents()
}

function favoriteRoute(item: FavoriteItem): string {
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

function favoritesForType(type: FavoriteItem['type']): FavoriteItem[] {
  return favorites.value.filter((f) => f.type === type)
}

/** Re-read from localStorage. Exposed for testing. */
function _reset(): void {
  favorites.value = readFavorites()
  recentDashboards.value = readRecents()
}

export function useFavorites() {
  return {
    favorites,
    recentDashboards,
    toggleFavorite,
    isFavorite,
    addRecent,
    favoriteRoute,
    favoritesForType,
    _reset,
  }
}
