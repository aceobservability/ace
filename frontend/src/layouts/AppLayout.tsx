import { Suspense, useEffect } from 'react'
import { Outlet, useMatches } from 'react-router-dom'
import type { RouteMeta } from '@/router'

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

export function AppLayout() {
  const matches = useMatches()
  const meta = matches.at(-1)?.handle as RouteMeta | undefined

  useEffect(() => {
    applySeoMetadata(meta)
  }, [meta])

  return (
    <div className="flex min-h-screen w-full bg-surface text-on-surface">
      <main className="flex min-h-screen flex-1 flex-col" style={{ marginLeft: 'var(--sidebar-rail-width)' }}>
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
    </div>
  )
}