import { ref } from 'vue'

const FAVORITES_KEY = 'ace-favorites'
const RECENTS_KEY = 'ace-recents'
const MAX_RECENTS = 10

export interface RecentDashboard {
  id: string
  title: string
  visitedAt: number
}

function readFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY)
    return stored ? JSON.parse(stored) : []
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

const favorites = ref<string[]>(readFavorites())
const recentDashboards = ref<RecentDashboard[]>(readRecents())

function persistFavorites(): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.value))
}

function persistRecents(): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recentDashboards.value))
}

function toggleFavorite(id: string): void {
  const index = favorites.value.indexOf(id)
  if (index >= 0) {
    favorites.value = favorites.value.filter((fav) => fav !== id)
  } else {
    favorites.value = [...favorites.value, id]
  }
  persistFavorites()
}

function isFavorite(id: string): boolean {
  return favorites.value.includes(id)
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
    _reset,
  }
}
