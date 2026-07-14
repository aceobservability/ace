import type { FavoriteItem, RecentDashboard } from '@/lib/favorites'
import { favoriteRoute } from '@/lib/favorites'
import type { SubNavItem } from '@/components/sidebar/navigationConfig'

export type NavigableItem = { path: string }

export function filterByQuery<T extends { title?: string; label?: string }>(
  items: T[],
  query: string,
  labelKey: 'title' | 'label' = 'title',
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(item => {
    const text = labelKey === 'label' ? item.label : item.title
    return text?.toLowerCase().includes(q)
  })
}

export function buildDashboardNavigableItems(
  favorites: FavoriteItem[],
  recents: RecentDashboard[],
): NavigableItem[] {
  const items: NavigableItem[] = []
  for (const fav of favorites) items.push({ path: `/app/dashboards/${fav.id}` })
  for (const recent of recents) items.push({ path: `/app/dashboards/${recent.id}` })
  items.push({ path: '/app/dashboards' })
  return items
}

export function buildSectionNavigableItems(
  favorites: FavoriteItem[],
  subNav: SubNavItem[],
): NavigableItem[] {
  const items: NavigableItem[] = []
  for (const fav of favorites) items.push({ path: favoriteRoute(fav) })
  for (const item of subNav) items.push({ path: item.path })
  return items
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}