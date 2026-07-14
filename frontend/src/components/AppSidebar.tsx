import { Pin, PinOff, Settings, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SidebarUserMenu } from '@/components/SidebarUserMenu'
import { SidebarDashboardFlyout } from '@/components/sidebar/SidebarDashboardFlyout'
import { SidebarNavButton } from '@/components/sidebar/SidebarNavButton'
import { SidebarOrgSwitcher } from '@/components/sidebar/SidebarOrgSwitcher'
import { SidebarSectionFlyout } from '@/components/sidebar/SidebarSectionFlyout'
import { navItems, sectionRoutes } from '@/components/sidebar/navigationConfig'
import { useSidebarFlyout } from '@/components/sidebar/useSidebarFlyout'
import { useOrganization } from '@/hooks/useOrganization'
import { useSidebarKeyboardShortcuts } from '@/hooks/useSidebarKeyboardShortcuts'
import { routeToSection } from '@/lib/navigation'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useToastStore } from '@/stores/toastStore'

export function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const user = useAuthStore(state => state.user)
  const { organizations, currentOrg, selectOrganization } = useOrganization()
  const expandedSection = useSidebarStore(state => state.expandedSection)
  const isPinned = useSidebarStore(state => state.isPinned)
  const toggleSection = useSidebarStore(state => state.toggleSection)
  const togglePin = useSidebarStore(state => state.togglePin)
  const syncPinnedRoute = useSidebarStore(state => state.syncPinnedRoute)
  const favorites = useFavoritesStore(state => state.favorites)
  const recentDashboards = useFavoritesStore(state => state.recentDashboards)
  const favoritesForType = useFavoritesStore(state => state.favoritesForType)
  const showToast = useToastStore(state => state.show)
  const aiSidebarOpen = useAiSidebarStore(state => state.isOpen)
  const toggleAiSidebar = useAiSidebarStore(state => state.toggle)

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)

  const routeSection = routeToSection(location.pathname)
  const isExpanded = expandedSection !== null && expandedSection !== 'home'
  const activeSection = expandedSection || routeSection

  useSidebarKeyboardShortcuts(location.pathname)

  useEffect(() => {
    syncPinnedRoute(location.pathname)
  }, [location.pathname, syncPinnedRoute])

  useEffect(() => {
    if (expandedSection && expandedSection !== 'home') {
      searchInputRef.current?.focus()
    }
  }, [expandedSection])

  const flyout = useSidebarFlyout({
    expandedSection,
    favorites,
    recentDashboards,
    favoritesForType,
  })

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

  function isActive(id: string) {
    return activeSection === id
  }

  function handleNavSelect(sectionId: typeof routeSection) {
    if (sectionId !== routeSection) {
      navigate(sectionRoutes[sectionId] || '/app')
    }
    toggleSection(sectionId)
    flyout.resetSearch()
  }

  function handleSelectOrg(orgId: string) {
    const previousOrgId = currentOrg?.id
    const org = organizations.find(o => o.id === orgId)
    if (!selectOrganization(orgId)) return
    setOrgMenuOpen(false)
    if (orgId !== previousOrgId && org) {
      showToast(`Switched to ${org.name}`, 'success')
    }
  }

  function handleFlyoutKeydown(e: React.KeyboardEvent) {
    if (!isExpanded) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      flyout.moveHighlight(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      flyout.moveHighlight(-1)
    } else if (e.key === 'Enter' && flyout.highlightedIndex >= 0) {
      e.preventDefault()
      const item = flyout.allNavigableItems[flyout.highlightedIndex]
      if (item) navigate(item.path)
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
      onKeyDown={handleFlyoutKeydown}
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
                onClick={() => togglePin(location.pathname)}
              >
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
            </>
          )}
        </div>

        <SidebarOrgSwitcher
          organizations={organizations}
          currentOrg={currentOrg}
          expanded={isExpanded}
          open={orgMenuOpen}
          onOpenChange={open => {
            setOrgMenuOpen(open)
            if (open) setUserMenuOpen(false)
          }}
          onSelect={handleSelectOrg}
        />
      </div>

      <div className={`flex flex-col gap-0.5 px-1 ${isExpanded ? 'px-2' : ''}`}>
        {navItems.map(item => (
          <SidebarNavButton
            key={item.id}
            testId={`sidebar-nav-${item.id}`}
            icon={item.icon}
            label={item.label}
            active={isActive(item.id)}
            expanded={isExpanded}
            color={item.colorVar}
            onClick={() => handleNavSelect(item.id)}
          />
        ))}
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
              value={flyout.searchQuery}
              onChange={e => flyout.setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-3">
            {expandedSection === 'dashboards' ? (
              <SidebarDashboardFlyout
                favorites={flyout.filteredFavorites}
                recents={flyout.filteredRecents}
                highlightedIndex={flyout.highlightedIndex}
                favoritesOffset={flyout.filteredFavorites.length}
                query={flyout.query}
                hasAnyResults={flyout.hasAnyResults}
                currentPath={location.pathname}
                onNavigate={path => navigate(path)}
              />
            ) : (
              <SidebarSectionFlyout
                favorites={flyout.filteredSectionFavorites}
                subNav={flyout.filteredSubNav}
                highlightedIndex={flyout.highlightedIndex}
                favoritesOffset={flyout.filteredSectionFavorites.length}
                query={flyout.query}
                hasAnyResults={flyout.hasAnyResults}
                currentPath={location.pathname}
                onNavigate={path => navigate(path)}
              />
            )}
          </div>
        </>
      )}

      {!isExpanded && <div className="flex-1" />}

      <div className={`flex shrink-0 flex-col items-center ${isExpanded ? 'items-start px-2' : ''}`}>
        <div className="relative">
          <SidebarNavButton
            testId="sidebar-ai-toggle"
            icon={Sparkles}
            label="Copilot"
            active={aiSidebarOpen}
            expanded={isExpanded}
            color="var(--color-primary)"
            title="AI Copilot"
            onClick={toggleAiSidebar}
          />
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
        </div>
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

        <SidebarNavButton
          testId="sidebar-settings"
          icon={Settings}
          label="Settings"
          active={isActive('settings')}
          expanded={isExpanded}
          color="var(--color-on-surface-variant)"
          onClick={() => handleNavSelect('settings')}
        />

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
    </nav>
  )
}