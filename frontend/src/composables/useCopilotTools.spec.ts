import { describe, expect, it } from 'vitest'
import { getMetricsTools, getToolsForDatasourceType } from './useCopilotTools'

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
    for (const type of ['loki', 'victorialogs']) {
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
