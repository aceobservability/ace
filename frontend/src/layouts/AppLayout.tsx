import { Suspense, useEffect, useMemo, useState } from 'react'
import { Outlet, useMatches } from 'react-router-dom'
import { AppSidebar } from '@/components/AppSidebar'
import { ShortcutsOverlay } from '@/components/ShortcutsOverlay'
import { ToastNotification } from '@/components/ToastNotification'
import { useOrgBranding } from '@/hooks/useOrgBranding'
import type { RouteMeta } from '@/router'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'
import { useDatasourceStore } from '@/stores/datasourceStore'
import { useOrgStore } from '@/stores/orgStore'
import { registerSidebarKeydownListener, useSidebarStore } from '@/stores/sidebarStore'

function applySeoMetadata(meta: RouteMeta | undefined) {
  const title = meta?.title ?? 'Ace'
  const description =
    meta?.description ??
    'Ace Observability is an open-source monitoring dashboard with multi-datasource support for Prometheus, Loki, Tempo, and VictoriaMetrics.'
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}`

  document.title = title

  const upsertMeta = (attribute: 'name' | 'property', key: string, content: string) => {
    const selector = `meta[${attribute}="${key}"]`
    let tag = document.querySelector(selector)
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute(attribute, key)
      document.head.append(tag)
    }
    tag.setAttribute('content', content)
  }

  upsertMeta('name', 'description', description)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:url', url)
  upsertMeta('name', 'twitter:title', title)
  upsertMeta('name', 'twitter:description', description)

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.append(canonical)
  }
  canonical.setAttribute('href', url)
}

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
  const meta = matches.at(-1)?.handle as RouteMeta | undefined
  const expandedSection = useSidebarStore(state => state.expandedSection)
  const isPinned = useSidebarStore(state => state.isPinned)
  const aiSidebarOpen = useAiSidebarStore(state => state.isOpen)
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const fetchDatasources = useDatasourceStore(state => state.fetchDatasources)

  const [viewportTooNarrow, setViewportTooNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1280,
  )

  useOrgBranding()

  useEffect(() => {
    registerSidebarKeydownListener()
  }, [])

  useEffect(() => {
    applySeoMetadata(meta)
  }, [meta])

  useEffect(() => {
    function checkViewport() {
      setViewportTooNarrow(window.innerWidth < 1280)
    }
    checkViewport()
    window.addEventListener('resize', checkViewport)
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

  useEffect(() => {
    if (currentOrgId) {
      void fetchDatasources(currentOrgId)
    }
  }, [currentOrgId, fetchDatasources])

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

      <ShortcutsOverlay />
      <ToastNotification />

      {viewportTooNarrow && <NarrowViewportOverlay />}
    </div>
  )
}