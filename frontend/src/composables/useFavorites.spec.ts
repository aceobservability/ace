import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFavorites } from './useFavorites'
import type { RecentDashboard } from './useFavorites'

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear()
    const { _reset } = useFavorites()
    _reset()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('toggleFavorite', () => {
    it('adds an id to favorites when not already favorited', () => {
      const { favorites, toggleFavorite } = useFavorites()
      toggleFavorite('dash-1')
      expect(favorites.value).toContain('dash-1')
    })

    it('removes an id from favorites when already favorited', () => {
      const { favorites, toggleFavorite } = useFavorites()
      toggleFavorite('dash-1')
      expect(favorites.value).toContain('dash-1')

      toggleFavorite('dash-1')
      expect(favorites.value).not.toContain('dash-1')
    })

    it('handles multiple favorites', () => {
      const { favorites, toggleFavorite } = useFavorites()
      toggleFavorite('dash-1')
      toggleFavorite('dash-2')
      toggleFavorite('dash-3')

      expect(favorites.value).toEqual(['dash-1', 'dash-2', 'dash-3'])
    })
  })

  describe('isFavorite', () => {
    it('returns true for favorited id', () => {
      const { isFavorite, toggleFavorite } = useFavorites()
      toggleFavorite('dash-1')
      expect(isFavorite('dash-1')).toBe(true)
    })

    it('returns false for non-favorited id', () => {
      const { isFavorite } = useFavorites()
      expect(isFavorite('dash-999')).toBe(false)
    })
  })

  describe('recentDashboards', () => {
    it('tracks visited dashboards', () => {
      const { recentDashboards, addRecent } = useFavorites()
      const dashboard: RecentDashboard = {
        id: 'dash-1',
        title: 'Test Dashboard',
        visitedAt: Date.now(),
      }
      addRecent(dashboard)

      expect(recentDashboards.value).toHaveLength(1)
      expect(recentDashboards.value[0]).toEqual(dashboard)
    })

    it('keeps only the last 10 visited dashboards', () => {
      const { recentDashboards, addRecent } = useFavorites()

      for (let i = 0; i < 12; i++) {
        addRecent({
          id: `dash-${i}`,
          title: `Dashboard ${i}`,
          visitedAt: Date.now() + i,
        })
      }

      expect(recentDashboards.value).toHaveLength(10)
      // Most recent should be first
      expect(recentDashboards.value[0].id).toBe('dash-11')
      expect(recentDashboards.value[9].id).toBe('dash-2')
    })

    it('moves existing dashboard to the top when re-visited', () => {
      const { recentDashboards, addRecent } = useFavorites()
      const now = Date.now()

      addRecent({ id: 'dash-1', title: 'Dashboard 1', visitedAt: now })
      addRecent({ id: 'dash-2', title: 'Dashboard 2', visitedAt: now + 1 })
      addRecent({ id: 'dash-3', title: 'Dashboard 3', visitedAt: now + 2 })

      // Re-visit dash-1
      addRecent({ id: 'dash-1', title: 'Dashboard 1', visitedAt: now + 3 })

      expect(recentDashboards.value).toHaveLength(3)
      expect(recentDashboards.value[0].id).toBe('dash-1')
      expect(recentDashboards.value[0].visitedAt).toBe(now + 3)
    })
  })

  describe('localStorage persistence', () => {
    it('persists favorites to localStorage', () => {
      const { toggleFavorite } = useFavorites()
      toggleFavorite('dash-1')
      toggleFavorite('dash-2')

      const stored = JSON.parse(localStorage.getItem('ace-favorites') ?? '[]')
      expect(stored).toEqual(['dash-1', 'dash-2'])
    })

    it('persists recents to localStorage', () => {
      const { addRecent } = useFavorites()
      const dashboard: RecentDashboard = {
        id: 'dash-1',
        title: 'Test Dashboard',
        visitedAt: 1000,
      }
      addRecent(dashboard)

      const stored = JSON.parse(localStorage.getItem('ace-recents') ?? '[]')
      expect(stored).toEqual([dashboard])
    })

    it('reads favorites from localStorage on init', () => {
      localStorage.setItem('ace-favorites', JSON.stringify(['dash-a', 'dash-b']))
      const { _reset } = useFavorites()
      _reset()
      const { favorites } = useFavorites()
      expect(favorites.value).toEqual(['dash-a', 'dash-b'])
    })

    it('reads recents from localStorage on init', () => {
      const recents: RecentDashboard[] = [
        { id: 'dash-1', title: 'Dash 1', visitedAt: 1000 },
      ]
      localStorage.setItem('ace-recents', JSON.stringify(recents))
      const { _reset } = useFavorites()
      _reset()
      const { recentDashboards } = useFavorites()
      expect(recentDashboards.value).toEqual(recents)
    })
  })
})
