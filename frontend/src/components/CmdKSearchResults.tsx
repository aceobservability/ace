import { LayoutGrid, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { listDashboards } from '@/api/dashboards'
import { useAIProvider } from '@/hooks/useAIProvider'
import { useOrganization } from '@/hooks/useOrganization'
import type { Dashboard } from '@/types/dashboard'

type CmdKSearchResultsProps = {
  query: string
  onNavigate: (path: string) => void
  onEnterChat: (query: string) => void
}

export function CmdKSearchResults({ query, onNavigate, onEnterChat }: CmdKSearchResultsProps) {
  const { providers } = useAIProvider()
  const { currentOrgId } = useOrganization()
  const [dashboards, setDashboards] = useState<Dashboard[]>([])

  useEffect(() => {
    if (!currentOrgId) return
    let cancelled = false
    void listDashboards(currentOrgId)
      .then(list => {
        if (!cancelled) setDashboards(list)
      })
      .catch(() => {
        if (!cancelled) setDashboards([])
      })
    return () => {
      cancelled = true
    }
  }, [currentOrgId])

  const filteredDashboards = useMemo(() => {
    if (!query) return dashboards
    const q = query.toLowerCase()
    return dashboards.filter(d => {
      const title = d.title.toLowerCase()
      const description = (d.description ?? '').toLowerCase()
      return title.includes(q) || description.includes(q)
    })
  }, [dashboards, query])

  const showAskCopilot = providers.length > 0 && query.length > 0

  return (
    <div>
      <div className="max-h-[300px] overflow-y-auto">
        {filteredDashboards.length > 0 ? (
          filteredDashboards.map(d => (
            <button
              key={d.id}
              type="button"
              data-testid={`search-result-${d.id}`}
              className="flex w-full cursor-pointer items-center gap-3 border-none text-left transition-colors duration-150"
              style={{
                padding: '10px 16px',
                backgroundColor: 'transparent',
                color: 'var(--color-on-surface)',
                fontSize: '13px',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--color-surface-container-high)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              onClick={() => onNavigate(`/app/dashboards/${d.id}`)}
            >
              <LayoutGrid
                size={18}
                style={{ color: 'var(--color-on-surface-variant)', flexShrink: 0 }}
                aria-hidden
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium" style={{ color: 'var(--color-on-surface)' }}>
                  {d.title}
                </span>
                {d.description ? (
                  <span
                    className="truncate text-xs"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  >
                    {d.description}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        ) : (
          <div
            data-testid="search-empty"
            className="flex items-center justify-center py-8"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <span className="text-sm">No results found</span>
          </div>
        )}
      </div>

      {showAskCopilot ? (
        <button
          type="button"
          data-testid="ask-copilot-option"
          className="flex w-full cursor-pointer items-center gap-3 border-none text-left transition-colors duration-150"
          style={{
            padding: '10px 16px',
            backgroundColor: 'transparent',
            color: 'var(--color-primary)',
            fontSize: '13px',
            borderTop: '1px solid var(--color-outline-variant)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = 'var(--color-surface-container-high)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          onClick={() => onEnterChat(query)}
        >
          <Sparkles size={18} style={{ flexShrink: 0 }} aria-hidden />
          <span>Ask Copilot</span>
        </button>
      ) : null}
    </div>
  )
}
