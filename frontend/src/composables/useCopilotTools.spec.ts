import { describe, expect, it } from 'vitest'
import { getMetricsTools } from './useCopilotTools'

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
