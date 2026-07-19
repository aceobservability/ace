import {
  CheckCircle2,
  Database,
  Edit2,
  Loader2,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteDataSource,
  listDataSources,
  testDataSourceConnection,
} from '@/api/datasources'
import type { DataSource } from '@/types/datasource'
import { dataSourceTypeLabels } from '@/types/datasource'
import { dataSourceTypeLogos } from '@/utils/datasourceLogos'

type DataSourceSettingsPanelProps = {
  orgId: string
}

export function DataSourceSettingsPanel({ orgId }: DataSourceSettingsPanelProps) {
  const [datasources, setDatasources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'ok' | 'error'>>({})

  const fetchDatasources = useCallback(async () => {
    setLoading(true)
    try {
      setDatasources(await listDataSources(orgId))
    } catch {
      setDatasources([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void fetchDatasources()
  }, [fetchDatasources])

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this data source?')) return
    await deleteDataSource(id)
    await fetchDatasources()
  }

  async function handleTest(id: string) {
    setTestStatus(prev => ({ ...prev, [id]: 'testing' }))
    try {
      await testDataSourceConnection(id)
      setTestStatus(prev => ({ ...prev, [id]: 'ok' }))
    } catch {
      setTestStatus(prev => ({ ...prev, [id]: 'error' }))
    }
    window.setTimeout(() => {
      setTestStatus(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, 4000)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" data-testid="ds-panel-loading">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-sm"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
          />
        ))}
      </div>
    )
  }

  if (datasources.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 px-8 py-12 text-center"
        data-testid="ds-panel-empty"
      >
        <Database size={40} style={{ color: 'var(--color-outline)' }} />
        <h3 className="m-0 text-base" style={{ color: 'var(--color-on-surface)' }}>
          No data sources configured
        </h3>
        <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Add a data source to start visualising your metrics, logs, and traces.
        </p>
        <Link
          to={`/app/datasources/new?orgId=${orgId}`}
          data-testid="ds-panel-add-empty-btn"
          className="inline-flex items-center gap-1.5 rounded-sm px-3.5 py-2 text-sm font-medium text-white no-underline transition"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Add data source
        </Link>
      </div>
    )
  }

  return (
    <div data-testid="ds-panel-list">
      <div className="mb-3 flex items-center justify-between">
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          {datasources.length} data source{datasources.length !== 1 ? 's' : ''}
        </span>
        <Link
          to={`/app/datasources/new?orgId=${orgId}`}
          data-testid="ds-panel-add-btn"
          className="inline-flex items-center gap-1.5 rounded-sm px-3.5 py-2 text-sm font-medium text-white no-underline transition"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Add data source
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {datasources.map(ds => (
          <div
            key={ds.id}
            data-testid={`ds-panel-row-${ds.id}`}
            className="flex items-center justify-between gap-4 rounded px-4 py-3 transition-colors"
            style={{ backgroundColor: 'var(--color-surface-container-high)' }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex items-center gap-2">
                {dataSourceTypeLogos[ds.type] ? (
                  <img
                    src={dataSourceTypeLogos[ds.type]}
                    alt={ds.type}
                    className="h-5 w-5 shrink-0 object-contain"
                  />
                ) : null}
                <span
                  className="inline-flex rounded-sm px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide uppercase whitespace-nowrap"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                    color: 'var(--color-primary)',
                    border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)',
                  }}
                >
                  {dataSourceTypeLabels[ds.type]}
                </span>
              </div>
              <span
                className="overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap"
                style={{ color: 'var(--color-on-surface)' }}
              >
                {ds.name}
              </span>
              <span
                className="overflow-hidden text-xs text-ellipsis whitespace-nowrap"
                style={{ color: 'var(--color-outline)' }}
              >
                {ds.url}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {testStatus[ds.id] === 'testing' ? (
                <span
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  <Loader2 size={12} className="animate-spin" /> Testing…
                </span>
              ) : null}
              {testStatus[ds.id] === 'ok' ? (
                <span
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <CheckCircle2 size={12} /> Connected
                </span>
              ) : null}
              {testStatus[ds.id] === 'error' ? (
                <span
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                    color: 'var(--color-error)',
                  }}
                >
                  <XCircle size={12} /> Failed
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleTest(ds.id)}
                data-testid={`ds-panel-test-${ds.id}`}
                disabled={testStatus[ds.id] === 'testing'}
                className="inline-flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-sm border border-transparent bg-transparent p-0 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: 'var(--color-on-surface-variant)' }}
                title="Test connection"
              >
                <Zap size={14} />
              </button>
              <Link
                to={`/app/datasources/${ds.id}/edit`}
                data-testid={`ds-panel-edit-${ds.id}`}
                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-transparent bg-transparent p-0 no-underline transition-all"
                style={{ color: 'var(--color-on-surface-variant)' }}
                title="Edit"
              >
                <Edit2 size={14} />
              </Link>
              <button
                type="button"
                onClick={() => void handleDelete(ds.id)}
                data-testid={`ds-panel-delete-${ds.id}`}
                className="inline-flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-sm border border-transparent bg-transparent p-0 transition-all"
                style={{ color: 'var(--color-on-surface-variant)' }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
