import { Suspense, useEffect, useMemo, useState } from 'react'
import { Outlet, useMatches, useNavigate } from 'react-router'
import { AiFab } from '@/components/AiFab'
import { AiSidebar } from '@/components/AiSidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { CmdKModal } from '@/components/CmdKModal'
import { CookieConsentBanner } from '@/components/CookieConsentBanner'
import { ShortcutsOverlay } from '@/components/ShortcutsOverlay'
import { ToastNotification } from '@/components/ToastNotification'
import { useDatasources } from '@/hooks/useDatasources'
import { useOrgBranding } from '@/hooks/useOrgBranding'
import { useRouteSeo } from '@/hooks/useRouteSeo'
import { useKeyboardShortcutsStore } from '@/lib/keyboardShortcuts'
import type { RouteMeta } from '@/router'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'
import { useOrgStore } from '@/stores/orgStore'
import { useSidebarStore } from '@/stores/sidebarStore'

function NarrowViewportOverlay() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
      data-testid="narrow-viewport-overlay"
    >
      <div className="max-w-md p-8 text-center">
        <p
          className="mb-2 text-lg font-semibold"
          style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }}
        >
          Best experienced on a wider screen
        </p>
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Please use a screen at least 1280px wide for the best experience.
        </p>
      </div>
    </div>
  )
}

export function AppLayout() {
  const matches = useMatches()
  const navigate = useNavigate()
  const meta = matches.at(-1)?.handle as RouteMeta | undefined
  const expandedSection = useSidebarStore(state => state.expandedSection)
  const isPinned = useSidebarStore(state => state.isPinned)
  const aiSidebarOpen = useAiSidebarStore(state => state.isOpen)
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const registerShortcut = useKeyboardShortcutsStore(state => state.register)

  const [viewportTooNarrow, setViewportTooNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1280,
  )
  const [cmdKOpen, setCmdKOpen] = useState(false)

  useOrgBranding()
  useRouteSeo(meta)
  useDatasources(currentOrgId)

  useEffect(() => {
    function checkViewport() {
      setViewportTooNarrow(window.innerWidth < 1280)
    }
    checkViewport()
    window.addEventListener('resize', checkViewport)
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

  useEffect(() => {
    const unregisterCmdK = registerShortcut(
      'Cmd+K',
      () => setCmdKOpen(true),
      'Open command palette',
      'General',
    )
    const unregisterNew = registerShortcut(
      'Cmd+Shift+N',
      () => {
        void navigate('/app/dashboards/new/ai')
      },
      'New dashboard',
      'Actions',
    )
    return () => {
      unregisterCmdK()
      unregisterNew()
    }
  }, [navigate, registerShortcut])

  const mainMargin = useMemo(() => {
    const isExpanded =
      isPinned || (expandedSection !== null && expandedSection !== 'home')
    return {
      marginLeft: isExpanded ? 'var(--sidebar-flyout-width)' : 'var(--sidebar-rail-width)',
      marginRight: aiSidebarOpen ? '340px' : '0',
      transition: 'margin-left 200ms ease, margin-right 200ms ease',
    }
  }, [expandedSection, isPinned, aiSidebarOpen])

  return (
    <div className="relative flex min-h-screen w-full overflow-x-hidden bg-surface text-on-surface">
      <AppSidebar />

      <main
        className="flex min-h-screen min-w-0 flex-1 flex-col transition-[margin-left] duration-200"
        style={mainMargin}
      >
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-on-surface-variant">
              Loading…
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <AiSidebar />
      <AiFab />
      <CmdKModal isOpen={cmdKOpen} onClose={() => setCmdKOpen(false)} />
      <ShortcutsOverlay />
      <ToastNotification />
      <CookieConsentBanner />

      {viewportTooNarrow && <NarrowViewportOverlay />}
    </div>
  )
}