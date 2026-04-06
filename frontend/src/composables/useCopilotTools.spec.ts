import { describe, expect, it, vi } from 'vitest'

// --- Hoisted mocks (must be before any imports that use them) ---

vi.mock('../api/datasources', () => ({
  fetchDataSourceMetricNames: vi.fn(),
  fetchDataSourceLabels: vi.fn(),
  fetchDataSourceLabelValues: vi.fn(),
  fetchDataSourceTraceServices: vi.fn(),
  listDataSources: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./useQueryEditor', () => ({
  useQueryEditor: () => ({
    hasEditor: () => false,
    setQuery: vi.fn(),
    execute: vi.fn(),
  }),
}))

import {
  fetchDataSourceLabels,
  fetchDataSourceLabelValues,
  fetchDataSourceMetricNames,
  fetchDataSourceTraceServices,
  listDataSources,
} from '../api/datasources'
import type { DataSource } from '../types/datasource'
import type { ToolCall } from './useAIProvider'
import {
  getMetricsTools,
  getToolsForDatasourceType,
  useCopilotToolExecutor,
} from './useCopilotTools'

// --- Helper ---

function makeToolCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    id: 'tc-1',
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  }
}

// --- Existing Task 1 tests ---

describe('getMetricsTools', () => {
  // T14: getMetricsTools includes generate_dashboard
  it('includes a generate_dashboard tool definition', () => {
    const tools = getMetricsTools()

    const generateDashboard = tools.find((t) => t.function.name === 'generate_dashboard')
    expect(generateDashboard).toBeDefined()
    expect(generateDashboard!.type).toBe('function')
    expect(generateDashboard!.function.description).toBeTruthy()
    expect(generateDashboard!.function.parameters).toBeDefined()
  })

  it('generate_dashboard tool requires title and panels parameters', () => {
    const tools = getMetricsTools()
    const generateDashboard = tools.find((t) => t.function.name === 'generate_dashboard')

    const params = generateDashboard!.function.parameters as {
      required?: string[]
      properties?: Record<string, unknown>
    }
    expect(params.required).toContain('title')
    expect(params.required).toContain('panels')
    expect(params.properties).toHaveProperty('title')
    expect(params.properties).toHaveProperty('panels')
    expect(params.properties).toHaveProperty('description')
  })

  it('returns all expected tool names', () => {
    const tools = getMetricsTools()
    const names = tools.map((t) => t.function.name)

    expect(names).toContain('get_metrics')
    expect(names).toContain('get_labels')
    expect(names).toContain('get_label_values')
    expect(names).toContain('write_query')
    expect(names).toContain('run_query')
    expect(names).toContain('generate_dashboard')
  })
})

describe('getToolsForDatasourceType', () => {
  it('includes list_datasources for all types', () => {
    for (const type of ['victoriametrics', 'prometheus', 'loki', 'victorialogs', 'tempo', '']) {
      const tools = getToolsForDatasourceType(type)
      expect(tools.find((t) => t.function.name === 'list_datasources')).toBeDefined()
    }
  })

  it('includes get_metrics for metrics datasource types', () => {
    for (const type of ['victoriametrics', 'prometheus']) {
      const tools = getToolsForDatasourceType(type)
      expect(tools.find((t) => t.function.name === 'get_metrics')).toBeDefined()
    }
  })

  it('excludes get_metrics for logs datasource types', () => {
    for (const type of ['loki', 'victorialogs', 'elasticsearch', 'clickhouse']) {
      const tools = getToolsForDatasourceType(type)
      expect(tools.find((t) => t.function.name === 'get_metrics')).toBeUndefined()
    }
  })

  it('includes get_trace_services for trace datasource types', () => {
    for (const type of ['tempo', 'victoriatraces']) {
      const tools = getToolsForDatasourceType(type)
      expect(tools.find((t) => t.function.name === 'get_trace_services')).toBeDefined()
    }
  })

  it('includes generate_dashboard only for metrics types', () => {
    const metricsTools = getToolsForDatasourceType('victoriametrics')
    expect(metricsTools.find((t) => t.function.name === 'generate_dashboard')).toBeDefined()

    const logsTools = getToolsForDatasourceType('loki')
    expect(logsTools.find((t) => t.function.name === 'generate_dashboard')).toBeUndefined()
  })

  it('includes all tool types when datasource type is empty', () => {
    const tools = getToolsForDatasourceType('')
    const names = tools.map((t) => t.function.name)
    expect(names).toContain('list_datasources')
    expect(names).toContain('get_metrics')
    expect(names).toContain('get_labels')
    expect(names).toContain('get_label_values')
    expect(names).toContain('get_trace_services')
    expect(names).toContain('write_query')
    expect(names).toContain('run_query')
    expect(names).toContain('generate_dashboard')
  })

  it('get_metrics has optional datasource_id parameter', () => {
    const tools = getToolsForDatasourceType('victoriametrics')
    const getMetrics = tools.find((t) => t.function.name === 'get_metrics')
    const props = getMetrics!.function.parameters as { properties?: Record<string, unknown> }
    expect(props.properties).toHaveProperty('datasource_id')
  })

  it('get_labels has optional datasource_id parameter', () => {
    const tools = getToolsForDatasourceType('victoriametrics')
    const getLabels = tools.find((t) => t.function.name === 'get_labels')
    const props = getLabels!.function.parameters as { properties?: Record<string, unknown> }
    expect(props.properties).toHaveProperty('datasource_id')
  })

  it('get_label_values has optional datasource_id parameter', () => {
    const tools = getToolsForDatasourceType('victoriametrics')
    const getLabelValues = tools.find((t) => t.function.name === 'get_label_values')
    const props = getLabelValues!.function.parameters as { properties?: Record<string, unknown> }
    expect(props.properties).toHaveProperty('datasource_id')
  })
})

// --- Task 2: useCopilotToolExecutor tests ---

describe('useCopilotToolExecutor', () => {
  const mockDsId = () => 'ds-default'
  const mockOrgId = () => 'org-1'
  const mockDsType = () => 'victoriametrics'

  it('list_datasources returns datasource list as JSON', async () => {
    vi.mocked(listDataSources).mockResolvedValue([
      { id: 'ds-1', name: 'Prom', type: 'prometheus' } as unknown as DataSource,
    ])
    const { executeTool } = useCopilotToolExecutor(mockDsId, mockOrgId, mockDsType)
    const result = await executeTool(makeToolCall('list_datasources'))
    expect(result).toContain('ds-1')
    expect(result).toContain('Prom')
    expect(listDataSources).toHaveBeenCalledWith('org-1')
  })

  it('list_datasources returns error when orgId is empty', async () => {
    const { executeTool } = useCopilotToolExecutor(mockDsId, () => '', mockDsType)
    const result = await executeTool(makeToolCall('list_datasources'))
    expect(result).toContain('Error')
    expect(result).toContain('no organization')
  })

  it('get_metrics uses override datasource_id when provided', async () => {
    vi.mocked(fetchDataSourceMetricNames).mockResolvedValue(['up', 'http_requests_total'])
    const { executeTool } = useCopilotToolExecutor(mockDsId, mockOrgId, mockDsType)
    await executeTool(makeToolCall('get_metrics', { datasource_id: 'ds-override' }))
    expect(fetchDataSourceMetricNames).toHaveBeenCalledWith('ds-override', undefined)
  })

  it('get_metrics falls back to context datasource_id', async () => {
    vi.mocked(fetchDataSourceMetricNames).mockResolvedValue(['up'])
    const { executeTool } = useCopilotToolExecutor(mockDsId, mockOrgId, mockDsType)
    await executeTool(makeToolCall('get_metrics'))
    expect(fetchDataSourceMetricNames).toHaveBeenCalledWith('ds-default', undefined)
  })

  it('get_metrics returns error when no datasource available', async () => {
    const { executeTool } = useCopilotToolExecutor(() => '', mockOrgId, mockDsType)
    const result = await executeTool(makeToolCall('get_metrics'))
    expect(result).toContain('Error')
    expect(result).toContain('no datasource')
  })

  it('get_labels uses override datasource_id', async () => {
    vi.mocked(fetchDataSourceLabels).mockResolvedValue(['job', 'instance'])
    const { executeTool } = useCopilotToolExecutor(mockDsId, mockOrgId, mockDsType)
    await executeTool(makeToolCall('get_labels', { datasource_id: 'ds-2' }))
    expect(fetchDataSourceLabels).toHaveBeenCalledWith('ds-2', undefined)
  })

  it('get_label_values uses override datasource_id', async () => {
    vi.mocked(fetchDataSourceLabelValues).mockResolvedValue(['node1', 'node2'])
    const { executeTool } = useCopilotToolExecutor(mockDsId, mockOrgId, mockDsType)
    await executeTool(
      makeToolCall('get_label_values', { label: 'instance', datasource_id: 'ds-3' }),
    )
    expect(fetchDataSourceLabelValues).toHaveBeenCalledWith('ds-3', 'instance', undefined)
  })

  it('get_trace_services returns services list', async () => {
    vi.mocked(fetchDataSourceTraceServices).mockResolvedValue(['frontend', 'api', 'db'])
    const { executeTool } = useCopilotToolExecutor(mockDsId, mockOrgId, mockDsType)
    const result = await executeTool(makeToolCall('get_trace_services'))
    expect(result).toContain('frontend')
    expect(result).toContain('api')
    expect(fetchDataSourceTraceServices).toHaveBeenCalledWith('ds-default')
  })
})
