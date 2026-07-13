import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  LayoutGrid,
  Pin,
  PinOff,
  Search,
  Settings,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SidebarUserMenu } from '@/components/SidebarUserMenu'
import { useOrganization } from '@/hooks/useOrganization'
import { favoriteRoute, useFavoritesStore } from '@/stores/favoritesStore'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'
import { currentRouteSection, useSidebarStore } from '@/stores/sidebarStore'
import { useToastStore } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  colorVar: string
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Sparkles, colorVar: 'var(--color-primary)' },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutGrid, colorVar: 'var(--color-on-surface)' },
  { id: 'services', label: 'Services', icon: Activity, colorVar: 'var(--color-secondary)' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, colorVar: 'var(--color-error)' },
  { id: 'explore', label: 'Explore', icon: Search, colorVar: 'var(--color-tertiary)' },
]

interface SubNavItem {
  id: string
  label: string
  path: string
}

const sectionSubNav: Record<string, SubNavItem[]> = {
  dashboards: [],
  services: [{ id: 'all-services', label: 'All Services', path: '/app/services' }],
  alerts: [
    { id: 'active', label: 'Active', path: '/app/alerts' },
    { id: 'silenced', label: 'Silenced', path: '/app/alerts/silenced' },
    { id: 'rules', label: 'Rules', path: '/app/alerts/rules' },
  ],
  explore: [
    { id: 'metrics', label: 'Metrics', path: '/app/explore/metrics' },
    { id: 'logs', label: 'Logs', path: '/app/explore/logs' },
    { id: 'traces', label: 'Traces', path: '/app/explore/traces' },
  ],
  settings: [
    { id: 'general', label: 'General', path: '/app/settings/general' },
    { id: 'members', label: 'Members', path: '/app/settings/members' },
    { id: 'groups', label: 'Groups & Permissions', path: '/app/settings/groups' },
    { id: 'datasources', label: 'Data Sources', path: '/app/settings/datasources' },
    { id: 'ai', label: 'AI Configuration', path: '/app/settings/ai' },
    { id: 'sso', label: 'SSO / Auth', path: '/app/settings/sso' },
    { id: 'audit-log', label: 'Audit Log', path: '/app/audit-log' },
  ],
}

const sectionRoutes: Record<string, string> = {
  home: '/app',
  dashboards: '/app/dashboards',
  services: '/app/services',
  alerts: '/app/alerts',
  explore: '/app/explore/metrics',
  settings: '/app/settings',
}

const sectionTypeMap: Record<string, 'dashboard' | 'service' | 'alert' | 'explore'> = {
  services: 'service',
  alerts: 'alert',
  explore: 'explore',
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const { organizations, currentOrg, selectOrganization } = useOrganization()
  const expandedSection = useSidebarStore(state => state.expandedSection)
  const isPinned = useSidebarStore(state => state.isPinned)
  const toggleSection = useSidebarStore(state => state.toggleSection)
  const togglePin = useSidebarStore(state => state.togglePin)
  const setCurrentPath = useSidebarStore(state => state.setCurrentPath)
  const setNavigate = useSidebarStore(state => state.setNavigate)
  const favorites = useFavoritesStore(state => state.favorites)
  const recentDashboards = useFavoritesStore(state => state.recentDashboards)
  const favoritesForType = useFavoritesStore(state => state.favoritesForType)
  const showToast = useToastStore(state => state.show)
  const aiSidebarOpen = useAiSidebarStore(state => state.isOpen)
  const toggleAiSidebar = useAiSidebarStore(state => state.toggle)

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const orgMenuRef = useRef<HTMLDivElement>(null)
  const orgSelectorRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const routeSection = currentRouteSection(location.pathname)
  const isExpanded = expandedSection !== null && expandedSection !== 'home'
  const activeSection = expandedSection || routeSection

  useEffect(() => {
    setNavigate(navigate)
  }, [navigate, setNavigate])

  useEffect(() => {
    setCurrentPath(location.pathname)
  }, [location.pathname, setCurrentPath])

  useEffect(() => {
    if (isPinned) {
      const section = routeSection
      if (section !== 'home') {
        useSidebarStore.setState({ expandedSection: section })
      }
    }
  }, [isPinned, routeSection])

  useEffect(() => {
    if (expandedSection && expandedSection !== 'home') {
      searchInputRef.current?.focus()
    } else {
      setSearchQuery('')
      setHighlightedIndex(-1)
    }
  }, [expandedSection])

  useEffect(() => {
    function handleOrgMenuClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (orgSelectorRef.current?.contains(target)) return
      if (orgMenuRef.current && !orgMenuRef.current.contains(target)) {
        setOrgMenuOpen(false)
      }
    }
    document.addEventListener('click', handleOrgMenuClickOutside)
    return () => document.removeEventListener('click', handleOrgMenuClickOutside)
  }, [])

  const orgInitial = currentOrg?.name ? currentOrg.name.charAt(0).toUpperCase() : '?'

  const userInitials = useMemo(() => {
    if (!user) return '?'
    if (user.name) {
      return user.name
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return user.email.charAt(0).toUpperCase()
  }, [user])

  const currentSubNav = expandedSection ? (sectionSubNav[expandedSection] ?? []) : []

  const dashboardFavorites = useMemo(() => {
    if (expandedSection !== 'dashboards') return []
    return favorites.filter(f => f.type === 'dashboard').slice(0, 5)
  }, [expandedSection, favorites])

  const dashboardRecents = useMemo(() => {
    if (expandedSection !== 'dashboards') return []
    return recentDashboards.slice(0, 5)
  }, [expandedSection, recentDashboards])

  const sectionFavorites = useMemo(() => {
    if (!expandedSection || !sectionTypeMap[expandedSection]) return []
    return favoritesForType(sectionTypeMap[expandedSection]).slice(0, 5)
  }, [expandedSection, favoritesForType])

  const q = searchQuery.trim().toLowerCase()

  const filteredSubNav = q
    ? currentSubNav.filter(item => item.label.toLowerCase().includes(q))
    : currentSubNav

  const filteredFavorites = q
    ? dashboardFavorites.filter(f => f.title.toLowerCase().includes(q))
    : dashboardFavorites

  const filteredSectionFavorites = q
    ? sectionFavorites.filter(f => f.title.toLowerCase().includes(q))
    : sectionFavorites

  const filteredRecents = q
    ? dashboardRecents.filter(r => r.title.toLowerCase().includes(q))
    : dashboardRecents

  const hasAnyResults =
    expandedSection === 'dashboards'
      ? filteredFavorites.length > 0 || filteredRecents.length > 0 || !q
      : filteredSubNav.length > 0 || filteredSectionFavorites.length > 0

  const allNavigableItems = useMemo(() => {
    const items: { path: string }[] = []
    if (expandedSection === 'dashboards') {
      for (const f of filteredFavorites) items.push({ path: `/app/dashboards/${f.id}` })
      for (const r of filteredRecents) items.push({ path: `/app/dashboards/${r.id}` })
      items.push({ path: '/app/dashboards' })
    } else {
      for (const f of filteredSectionFavorites) items.push({ path: favoriteRoute(f) })
      for (const item of filteredSubNav) items.push({ path: item.path })
    }
    return items
  }, [expandedSection, filteredFavorites, filteredRecents, filteredSectionFavorites, filteredSubNav])

  function isActive(id: string) {
    return activeSection === id
  }

  function isSubNavActive(item: SubNavItem) {
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  }

  function handleNavSelect(sectionId: string) {
    if (sectionId !== routeSection) {
      navigate(sectionRoutes[sectionId] || '/app')
    }
    toggleSection(sectionId)
    setSearchQuery('')
    setHighlightedIndex(-1)
  }

  function handleSubNavNavigate(path: string) {
    navigate(path)
  }

  function handleSelectOrg(orgId: string) {
    const previousOrgId = currentOrg?.id
    const org = organizations.find(o => o.id === orgId)
    selectOrganization(orgId)
    setOrgMenuOpen(false)
    if (orgId !== previousOrgId && org) {
      showToast(`Switched to ${org.name}`, 'success')
    }
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if (!isExpanded) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (allNavigableItems.length > 0) {
        setHighlightedIndex(prev => Math.min(prev + 1, allNavigableItems.length - 1))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      const item = allNavigableItems[highlightedIndex]
      if (item) handleSubNavNavigate(item.path)
    }
  }

  return (
    <nav
      aria-label="Main navigation"
      data-testid="sidebar"
      className="fixed top-0 bottom-0 left-0 z-50 flex flex-col transition-[width] duration-200"
      style={{
        width: isExpanded ? 'var(--sidebar-flyout-width)' : 'var(--sidebar-rail-width)',
        backgroundColor: 'var(--color-surface)',
        borderRight: isExpanded ? '1px solid var(--color-stroke-subtle)' : 'none',
      }}
      onKeyDown={handleKeydown}
    >
      <div
        className={`flex shrink-0 flex-col items-center gap-1 py-3 ${isExpanded ? 'items-start px-3' : ''}`}
      >
        <div className={`mb-2 flex items-center gap-3 ${isExpanded ? 'w-full' : ''}`}>
          <div
            data-testid="sidebar-logo"
            className="flex shrink-0 items-center justify-center"
            style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              borderRadius: '8px',
              color: '#0B0D0F',
              fontWeight: '700',
              fontSize: '14px',
              fontFamily: 'var(--font-display)',
            }}
          >
            A
          </div>
          {isExpanded && (
            <>
              <span
                className="font-display flex-1 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)', letterSpacing: '-0.01em' }}
              >
                Ace
              </span>
              <button
                type="button"
                data-testid="sidebar-pin-toggle"
                className="flex shrink-0 cursor-pointer items-center justify-center border-none bg-transparent transition-colors duration-150"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  color: isPinned ? 'var(--color-primary)' : 'var(--color-outline)',
                  backgroundColor: isPinned ? 'var(--color-primary-muted)' : 'transparent',
                }}
                title={isPinned ? 'Unpin sidebar (⌘B)' : 'Pin sidebar open (⌘B)'}
                onClick={togglePin}
              >
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
            </>
          )}
        </div>

        <button
          ref={orgSelectorRef}
          type="button"
          data-testid="sidebar-org-selector"
          className={`flex shrink-0 cursor-pointer items-center transition-colors duration-150 ${isExpanded ? 'w-full gap-2 rounded-lg px-2 py-1.5' : 'justify-center rounded-md'}`}
          style={{
            width: isExpanded ? '100%' : '32px',
            height: isExpanded ? 'auto' : '32px',
            backgroundColor: 'var(--color-surface-container-high)',
            border: '1px solid var(--color-stroke-subtle)',
            color: 'var(--color-on-surface-variant)',
            fontSize: '12px',
            fontWeight: '600',
            fontFamily: 'var(--font-display)',
          }}
          title={currentOrg?.name || 'Select organization'}
          onClick={e => {
            e.stopPropagation()
            setOrgMenuOpen(prev => !prev)
            setUserMenuOpen(false)
          }}
        >
          <span className="shrink-0">{orgInitial}</span>
          {isExpanded && (
            <span className="flex-1 truncate text-left text-xs" style={{ color: 'var(--color-on-surface)' }}>
              {currentOrg?.name || 'Select org'}
            </span>
          )}
        </button>
      </div>

      <div className={`flex flex-col gap-0.5 px-1 ${isExpanded ? 'px-2' : ''}`}>
        {navItems.map(item => {
          const Icon = item.icon
          const active = isActive(item.id)
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`sidebar-nav-${item.id}`}
              className={`relative flex shrink-0 cursor-pointer items-center border-none transition-all duration-150 ${isExpanded ? 'w-full gap-3 rounded-lg px-3' : 'mx-auto justify-center rounded-lg'}`}
              style={{
                width: isExpanded ? '100%' : '44px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: active ? 'var(--color-primary-muted)' : 'transparent',
                color: active ? item.colorVar : 'var(--color-outline)',
              }}
              onClick={() => handleNavSelect(item.id)}
            >
              {active && (
                <div
                  data-testid="sidebar-accent-bar"
                  className="absolute top-2 bottom-2"
                  style={{
                    left: isExpanded ? '0px' : '-2px',
                    width: '3px',
                    backgroundColor: 'var(--color-primary)',
                    borderRadius: '2px',
                  }}
                />
              )}
              <Icon size={18} className="shrink-0" />
              {isExpanded && (
                <span className="truncate text-sm" style={{ fontWeight: active ? '500' : '400' }}>
                  {item.label}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isExpanded && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '8px 12px' }} />
          <div className="px-3 pb-2">
            <input
              ref={searchInputRef}
              data-testid="sidebar-search"
              type="text"
              placeholder="Filter..."
              aria-label="Filter navigation items"
              className="w-full border-none outline-none"
              style={{
                padding: '7px 10px',
                backgroundColor: 'var(--color-surface-container-high)',
                border: '1px solid var(--color-stroke-subtle)',
                borderRadius: '8px',
                color: 'var(--color-on-surface)',
                fontSize: '12px',
              }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-3">
            {expandedSection === 'dashboards' ? (
              <>
                <div role="group" aria-labelledby="sidebar-favorites-label">
                  <div
                    id="sidebar-favorites-label"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-outline)',
                      padding: '6px 10px 4px',
                    }}
                  >
                    Favorites
                  </div>
                  {filteredFavorites.length > 0 ? (
                    filteredFavorites.map((fav, idx) => (
                      <button
                        key={fav.id}
                        type="button"
                        data-testid={`sidebar-fav-${fav.id}`}
                        className={`sidebar-subnav-item ${highlightedIndex === idx ? 'highlighted' : ''}`}
                        onClick={() => handleSubNavNavigate(`/app/dashboards/${fav.id}`)}
                      >
                        <Star size={14} fill="currentColor" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                        <span className="flex-1 truncate">{fav.title}</span>
                      </button>
                    ))
                  ) : !q ? (
                    <div data-testid="sidebar-empty-favorites" className="sidebar-empty-hint">
                      <Star size={18} style={{ opacity: 0.3, color: 'var(--color-outline)' }} />
                      <span>Star dashboards to pin them here</span>
                    </div>
                  ) : null}
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }} />

                <div role="group" aria-labelledby="sidebar-recents-label">
                  <div
                    id="sidebar-recents-label"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-outline)',
                      padding: '6px 10px 4px',
                    }}
                  >
                    Recents
                  </div>
                  {filteredRecents.length > 0 ? (
                    filteredRecents.map((recent, rIdx) => (
                      <button
                        key={recent.id}
                        type="button"
                        data-testid={`sidebar-recent-${recent.id}`}
                        className={`sidebar-subnav-item ${highlightedIndex === filteredFavorites.length + rIdx ? 'highlighted' : ''}`}
                        onClick={() => handleSubNavNavigate(`/app/dashboards/${recent.id}`)}
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
                  ) : !q ? (
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
                  className={`sidebar-subnav-item ${highlightedIndex === filteredFavorites.length + filteredRecents.length ? 'highlighted' : ''}`}
                  aria-current={location.pathname === '/app/dashboards' ? 'page' : undefined}
                  onClick={() => handleSubNavNavigate('/app/dashboards')}
                >
                  <span className="flex-1">All Dashboards</span>
                  <ArrowRight size={14} style={{ color: 'var(--color-outline)' }} />
                </button>

                {q && !hasAnyResults && (
                  <div data-testid="sidebar-no-results" className="sidebar-empty-hint">
                    <span>No matches</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {expandedSection && sectionTypeMap[expandedSection] && filteredSectionFavorites.length > 0 && (
                  <div role="group" aria-labelledby="sidebar-section-favorites-label">
                    <div
                      id="sidebar-section-favorites-label"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--color-outline)',
                        padding: '6px 10px 4px',
                      }}
                    >
                      Favorites
                    </div>
                    {filteredSectionFavorites.map((fav, idx) => (
                      <button
                        key={fav.id}
                        type="button"
                        data-testid={`sidebar-fav-${fav.id}`}
                        className={`sidebar-subnav-item ${highlightedIndex === idx ? 'highlighted' : ''}`}
                        onClick={() => handleSubNavNavigate(favoriteRoute(fav))}
                      >
                        <Star size={14} fill="currentColor" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                        <span className="flex-1 truncate">{fav.title}</span>
                      </button>
                    ))}
                    <div style={{ height: '1px', backgroundColor: 'var(--color-stroke-subtle)', margin: '4px 10px' }} />
                  </div>
                )}

                {filteredSubNav.map((item, idx) => {
                  const subActive = isSubNavActive(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`sidebar-subnav-${item.id}`}
                      aria-current={subActive ? 'page' : undefined}
                      className={`sidebar-subnav-item ${highlightedIndex === filteredSectionFavorites.length + idx ? 'highlighted' : ''}`}
                      style={{
                        fontWeight: subActive ? '500' : '400',
                        color: subActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                        backgroundColor: subActive ? 'var(--color-primary-muted)' : 'transparent',
                        borderLeft: subActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                      }}
                      onClick={() => handleSubNavNavigate(item.path)}
                    >
                      {item.label}
                    </button>
                  )
                })}

                {q && !hasAnyResults && (
                  <div data-testid="sidebar-no-results" className="sidebar-empty-hint">
                    <span>No matches</span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {!isExpanded && <div className="flex-1" />}

      <div className={`flex shrink-0 flex-col items-center ${isExpanded ? 'items-start px-2' : ''}`}>
        <button
          type="button"
          data-testid="sidebar-ai-toggle"
          className={`relative flex shrink-0 cursor-pointer items-center border-none transition-all duration-150 ${isExpanded ? 'w-full gap-3 rounded-lg px-3' : 'mx-auto justify-center rounded-lg'}`}
          style={{
            width: isExpanded ? '100%' : '44px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: aiSidebarOpen ? 'var(--color-primary-muted)' : 'transparent',
            color: aiSidebarOpen ? 'var(--color-primary)' : 'var(--color-outline)',
          }}
          title="AI Copilot"
          onClick={toggleAiSidebar}
        >
          <Sparkles size={18} className="shrink-0" />
          {isExpanded && (
            <span className="text-sm" style={{ fontWeight: aiSidebarOpen ? '500' : '400' }}>
              Copilot
            </span>
          )}
          {!isExpanded && aiSidebarOpen && (
            <span
              className="absolute"
              style={{
                top: '6px',
                right: '6px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-primary)',
              }}
            />
          )}
        </button>
      </div>

      <div className={`flex shrink-0 flex-col items-center gap-1 pb-3 ${isExpanded ? 'items-start px-2' : ''}`}>
        <div
          style={{
            width: isExpanded ? 'calc(100% - 20px)' : '28px',
            height: '1px',
            backgroundColor: 'var(--color-stroke-subtle)',
            margin: isExpanded ? '0 10px 4px' : '0 auto 4px',
          }}
        />

        <button
          type="button"
          data-testid="sidebar-settings"
          className={`relative flex shrink-0 cursor-pointer items-center border-none transition-all duration-150 ${isExpanded ? 'w-full gap-3 rounded-lg px-3' : 'mx-auto justify-center rounded-lg'}`}
          style={{
            width: isExpanded ? '100%' : '44px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: isActive('settings') ? 'var(--color-primary-muted)' : 'transparent',
            color: isActive('settings') ? 'var(--color-on-surface-variant)' : 'var(--color-outline)',
          }}
          onClick={() => handleNavSelect('settings')}
        >
          {isActive('settings') && (
            <div
              data-testid="sidebar-accent-bar"
              className="absolute top-2 bottom-2"
              style={{
                left: isExpanded ? '0px' : '-2px',
                width: '3px',
                backgroundColor: 'var(--color-primary)',
                borderRadius: '2px',
              }}
            />
          )}
          <Settings size={18} className="shrink-0" />
          {isExpanded && <span className="text-sm">Settings</span>}
        </button>

        <button
          type="button"
          data-testid="sidebar-user-avatar"
          className={`mt-1 flex shrink-0 cursor-pointer items-center border-none ${isExpanded ? 'w-full gap-3 rounded-lg px-3 py-2' : 'justify-center'}`}
          style={{
            width: isExpanded ? '100%' : '30px',
            height: isExpanded ? 'auto' : '30px',
            borderRadius: isExpanded ? '8px' : '50%',
            backgroundColor: isExpanded ? 'transparent' : 'var(--color-surface-container-high)',
            border: isExpanded ? 'none' : '1px solid var(--color-stroke-subtle)',
            color: 'var(--color-on-surface-variant)',
            fontSize: '11px',
            fontWeight: '600',
          }}
          onClick={() => {
            setUserMenuOpen(prev => !prev)
            setOrgMenuOpen(false)
          }}
        >
          {isExpanded ? (
            <>
              <div
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-surface-container-high)',
                  border: '1px solid var(--color-stroke-subtle)',
                  fontSize: '11px',
                  fontWeight: '600',
                }}
              >
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium" style={{ color: 'var(--color-on-surface)' }}>
                  {user?.name || user?.email}
                </div>
              </div>
            </>
          ) : (
            userInitials
          )}
        </button>
      </div>

      <SidebarUserMenu isOpen={userMenuOpen} onClose={() => setUserMenuOpen(false)} />

      {orgMenuOpen && (
        <div
          ref={orgMenuRef}
          data-testid="org-switcher-popup"
          className="animate-fade-in fixed z-[60] overflow-hidden"
          style={{
            left: isExpanded ? '248px' : 'calc(52px + 4px)',
            top: 'calc(12px + 32px + 4px)',
            width: '220px',
            backgroundColor: 'var(--color-surface-bright)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            border: '1px solid var(--color-stroke-subtle)',
          }}
        >
          <div
            className="px-3 py-2 text-xs font-semibold tracking-wide uppercase"
            style={{
              color: 'var(--color-outline)',
              fontSize: '10px',
              borderBottom: '1px solid var(--color-stroke-subtle)',
            }}
          >
            Organizations
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {organizations.map(org => (
              <button
                key={org.id}
                type="button"
                data-testid={`org-switcher-${org.id}`}
                className="org-item flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-sm transition-colors"
                style={{
                  color: currentOrg?.id === org.id ? 'var(--color-primary)' : 'var(--color-on-surface)',
                }}
                onClick={() => handleSelectOrg(org.id)}
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
                  style={{
                    backgroundColor:
                      currentOrg?.id === org.id ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
                    color: currentOrg?.id === org.id ? '#0C0D0F' : 'var(--color-on-surface-variant)',
                  }}
                >
                  {org.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate text-left">{org.name}</span>
                {currentOrg?.id === org.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}