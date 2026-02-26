import { trackEvent } from '../analytics'
import type {
  CreateDataSourceRequest,
  DataSource,
  DataSourceLogStreamRequest,
  DataSourceQueryRequest,
  DataSourceQueryResult,
  LogEntry,
  Trace,
  TraceDatasource,
  TraceSearchRequest,
  TraceServiceGraph,
  TraceSummary,
  UpdateDataSourceRequest,
} from '../types/datasource'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function listDataSources(orgId: string): Promise<DataSource[]> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/datasources`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Not a member of this organization')
    }
    throw new Error('Failed to fetch datasources')
  }
  return response.json()
}

export async function getDataSource(id: string): Promise<DataSource> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error('Datasource not found')
  }
  return response.json()
}

export async function createDataSource(
  orgId: string,
  data: CreateDataSourceRequest,
): Promise<DataSource> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/datasources`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('datasource_create_failed', {
      org_id: orgId,
      datasource_type: data.type,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Only admins can create datasources')
    }
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create datasource')
  }

  const datasource = await response.json()
  trackEvent('datasource_created', {
    datasource_id: datasource.id,
    datasource_type: datasource.type,
    org_id: orgId,
  })
  return datasource
}

export async function updateDataSource(
  id: string,
  data: UpdateDataSourceRequest,
): Promise<DataSource> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    trackEvent('datasource_update_failed', {
      datasource_id: id,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Only admins can update datasources')
    }
    throw new Error('Failed to update datasource')
  }

  const datasource = await response.json()
  trackEvent('datasource_updated', {
    datasource_id: id,
    datasource_type: datasource.type,
    updated_fields: Object.keys(data),
  })
  return datasource
}

export async function deleteDataSource(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    trackEvent('datasource_delete_failed', {
      datasource_id: id,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Only admins can delete datasources')
    }
    throw new Error('Failed to delete datasource')
  }

  trackEvent('datasource_deleted', {
    datasource_id: id,
  })
}

export async function queryDataSource(
  id: string,
  data: DataSourceQueryRequest,
): Promise<DataSourceQueryResult> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}/query`, {
    method: 'POST',
    cache: 'no-store',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    trackEvent('datasource_query_failed', {
      datasource_id: id,
      status_code: response.status,
      query_length: data.query.length,
    })
    throw new Error(err.error || 'Query failed')
  }

  const result = await response.json()
  trackEvent('datasource_query_succeeded', {
    datasource_id: id,
    query_length: data.query.length,
    result_status: result.status,
  })
  return result
}

interface TraceResponse {
  status: 'success' | 'error'
  data?: Trace
  error?: string
}

interface TraceSearchResponse {
  status: 'success' | 'error'
  data?: TraceSummary[]
  error?: string
}

interface TraceServiceGraphResponse {
  status: 'success' | 'error'
  data?: TraceServiceGraph
  error?: string
}

export async function fetchDataSourceTrace(id: string, traceId: string): Promise<Trace> {
  const response = await fetch(
    `${API_BASE}/api/datasources/${id}/traces/${encodeURIComponent(traceId)}`,
    {
      headers: getAuthHeaders(),
    },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch trace')
  }

  const body = (await response.json()) as TraceResponse
  if (body.status === 'error' || !body.data) {
    throw new Error(body.error || 'Failed to fetch trace')
  }

  return body.data
}

export async function fetchDataSourceTraceServiceGraph(
  id: string,
  traceId: string,
): Promise<TraceServiceGraph> {
  const response = await fetch(
    `${API_BASE}/api/datasources/${id}/traces/${encodeURIComponent(traceId)}/service-graph`,
    {
      headers: getAuthHeaders(),
    },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch trace service graph')
  }

  const body = (await response.json()) as TraceServiceGraphResponse
  if (body.status === 'error' || !body.data) {
    throw new Error(body.error || 'Failed to fetch trace service graph')
  }

  return body.data
}

export async function searchDataSourceTraces(
  id: string,
  request: TraceSearchRequest,
): Promise<TraceSummary[]> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}/traces/search`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to search traces')
  }

  const body = (await response.json()) as TraceSearchResponse
  if (body.status === 'error') {
    throw new Error(body.error || 'Failed to search traces')
  }

  return body.data || []
}

interface TraceServicesResponse {
  status: 'success' | 'error'
  data?: string[]
  error?: string
}

export async function fetchDataSourceTraceServices(id: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}/traces/services`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch trace services')
  }

  const body = (await response.json()) as TraceServicesResponse
  if (body.status === 'error') {
    throw new Error(body.error || 'Failed to fetch trace services')
  }

  return body.data || []
}

export async function testDataSourceConnection(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    trackEvent('datasource_test_failed', {
      datasource_id: id,
      status_code: response.status,
    })
    throw new Error(err.error || 'Connection test failed')
  }

  trackEvent('datasource_test_succeeded', {
    datasource_id: id,
  })
}

export async function testDataSourceDraftConnection(
  orgId: string,
  data: CreateDataSourceRequest,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/orgs/${orgId}/datasources/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    trackEvent('datasource_draft_test_failed', {
      org_id: orgId,
      datasource_type: data.type,
      status_code: response.status,
    })
    if (response.status === 403) {
      throw new Error('Only admins can test datasource connections')
    }
    throw new Error(err.error || 'Connection test failed')
  }

  trackEvent('datasource_draft_test_succeeded', {
    org_id: orgId,
    datasource_type: data.type,
  })
}

interface ParsedSSEEvent {
  event: string
  data: string
}

interface StatusEventPayload {
  status?: string
  message?: string
}

interface ErrorEventPayload {
  error?: string
  message?: string
}

interface DataSourceLogStreamHandlers {
  onLog: (log: LogEntry) => void
  onStatus?: (status: string, message?: string) => void
  onHeartbeat?: () => void
  onError?: (message: string) => void
}

function parseSSEEvent(rawEvent: string): ParsedSSEEvent | null {
  const lines = rawEvent.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function handleSSEEventPayload(parsed: ParsedSSEEvent, handlers: DataSourceLogStreamHandlers) {
  let payload: unknown
  try {
    payload = JSON.parse(parsed.data)
  } catch {
    handlers.onError?.('Received malformed stream payload')
    return
  }

  if (parsed.event === 'log') {
    handlers.onLog(payload as LogEntry)
    return
  }

  if (parsed.event === 'heartbeat') {
    handlers.onHeartbeat?.()
    return
  }

  if (parsed.event === 'status') {
    const statusPayload = payload as StatusEventPayload
    handlers.onStatus?.(statusPayload.status || 'unknown', statusPayload.message)
    return
  }

  if (parsed.event === 'error') {
    const errorPayload = payload as ErrorEventPayload
    handlers.onError?.(errorPayload.error || errorPayload.message || 'Live stream failed')
  }
}

export async function streamDataSourceLogs(
  id: string,
  data: DataSourceLogStreamRequest,
  handlers: DataSourceLogStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    let message = 'Failed to start live stream'
    if (body) {
      try {
        const parsed = JSON.parse(body) as ErrorEventPayload
        message = parsed.error || parsed.message || message
      } catch {
        message = body
      }
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Streaming is not supported by this browser')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)

        const parsedEvent = parseSSEEvent(rawEvent)
        if (parsedEvent) {
          handleSSEEventPayload(parsedEvent, handlers)
        }

        separatorIndex = buffer.indexOf('\n\n')
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      return
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  if (!signal?.aborted) {
    throw new Error('Live stream disconnected')
  }
}

interface LabelsResponse {
  status: 'success' | 'error'
  data?: string[]
  error?: string
}

export async function fetchTraceDatasources(orgId: string, datasourceId: string): Promise<TraceDatasource[]> {
  const response = await fetch(
    `${API_BASE}/api/orgs/${orgId}/datasources/${datasourceId}/trace-datasources`,
    {
      headers: getAuthHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error('Failed to fetch trace datasources')
  }

  return response.json()
}

export async function fetchDataSourceLabels(id: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/api/datasources/${id}/labels`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch labels')
  }

  const body = (await response.json()) as LabelsResponse
  if (body.status === 'error') {
    throw new Error(body.error || 'Failed to fetch labels')
  }

  return body.data || []
}

export async function fetchDataSourceLabelValues(id: string, labelName: string): Promise<string[]> {
  const response = await fetch(
    `${API_BASE}/api/datasources/${id}/labels/${encodeURIComponent(labelName)}/values`,
    {
      headers: getAuthHeaders(),
    },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch label values')
  }

  const body = (await response.json()) as LabelsResponse
  if (body.status === 'error') {
    throw new Error(body.error || 'Failed to fetch label values')
  }

  return body.data || []
}
