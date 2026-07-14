export const FAVORITES_KEY = 'ace-favorites'
export const RECENTS_KEY = 'ace-recents'
export const MAX_RECENTS = 10

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

export function readFavorites(): FavoriteItem[] {
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

export function readRecents(): RecentDashboard[] {
  try {
    const stored = localStorage.getItem(RECENTS_KEY)
    return stored ? (JSON.parse(stored) as RecentDashboard[]) : []
  } catch {
    return []
  }
}

export function persistFavorites(favorites: FavoriteItem[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
}

export function persistRecents(recents: RecentDashboard[]): void {
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