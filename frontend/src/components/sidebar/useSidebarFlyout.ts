import { useEffect, useMemo, useState } from 'react'
import {
  sectionSubNav,
  sectionTypeMap,
  type FavoriteNavType,
} from '@/components/sidebar/navigationConfig'
import type { FavoriteItem, RecentDashboard } from '@/lib/favorites'
import {
  buildDashboardNavigableItems,
  buildSectionNavigableItems,
  filterByQuery,
} from '@/lib/sidebarFilter'
import type { SidebarSectionId } from '@/lib/navigation'

type UseSidebarFlyoutOptions = {
  expandedSection: SidebarSectionId | null
  favorites: FavoriteItem[]
  recentDashboards: RecentDashboard[]
  favoritesForType: (type: FavoriteNavType) => FavoriteItem[]
}

export function useSidebarFlyout({
  expandedSection,
  favorites,
  recentDashboards,
  favoritesForType,
}: UseSidebarFlyoutOptions) {
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  useEffect(() => {
    setSearchQuery('')
    setHighlightedIndex(-1)
  }, [expandedSection])

  const query = searchQuery.trim().toLowerCase()
  const currentSubNav = expandedSection ? (sectionSubNav[expandedSection] ?? []) : []

  const dashboardFavorites = useMemo(() => {
    if (expandedSection !== 'dashboards') return []
    return favorites.filter(f => f.type === 'dashboard').slice(0, 5)
  }, [expandedSection, favorites])

  const dashboardRecents = useMemo(() => {
    if (expandedSection !== 'dashboards') return []
    return recentDashboards.slice(0, 5)
  }, [expandedSection, recentDashboards])

  const sectionFavoriteType = expandedSection ? sectionTypeMap[expandedSection] : undefined
  const sectionFavorites = useMemo(() => {
    if (!sectionFavoriteType) return []
    return favoritesForType(sectionFavoriteType).slice(0, 5)
  }, [sectionFavoriteType, favoritesForType])

  const filteredSubNav = filterByQuery(currentSubNav, query, 'label')
  const filteredFavorites = filterByQuery(dashboardFavorites, query, 'title')
  const filteredSectionFavorites = filterByQuery(sectionFavorites, query, 'title')
  const filteredRecents = filterByQuery(dashboardRecents, query, 'title')

  const hasAnyResults =
    expandedSection === 'dashboards'
      ? filteredFavorites.length > 0 || filteredRecents.length > 0 || !query
      : filteredSubNav.length > 0 || filteredSectionFavorites.length > 0

  const allNavigableItems = useMemo(() => {
    if (expandedSection === 'dashboards') {
      return buildDashboardNavigableItems(filteredFavorites, filteredRecents)
    }
    return buildSectionNavigableItems(filteredSectionFavorites, filteredSubNav)
  }, [expandedSection, filteredFavorites, filteredRecents, filteredSectionFavorites, filteredSubNav])

  function resetSearch() {
    setSearchQuery('')
    setHighlightedIndex(-1)
  }

  function moveHighlight(delta: number) {
    if (allNavigableItems.length === 0) return
    setHighlightedIndex(prev => Math.min(Math.max(prev + delta, -1), allNavigableItems.length - 1))
  }

  return {
    searchQuery,
    setSearchQuery,
    highlightedIndex,
    setHighlightedIndex,
    query,
    filteredSubNav,
    filteredFavorites,
    filteredSectionFavorites,
    filteredRecents,
    hasAnyResults,
    allNavigableItems,
    resetSearch,
    moveHighlight,
  }
}