import { useRouter } from 'vue-router'
import {
  fetchDataSourceLabels,
  fetchDataSourceLabelValues,
  fetchDataSourceMetricNames,
  fetchDataSourceTraceServices,
  listDataSources,
} from '../api/datasources'
import type { ToolCall, ToolDefinition } from './useAIProvider'
import { useQueryEditor } from './useQueryEditor'

// --- Named tool definition constants ---

const datasourceIdParam = {
  datasource_id: {
    type: 'string',
    description: 'Override the default datasource. Use an ID from list_datasources.',
  },
} as const

const listDatasourcesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_datasources',
    description:
      'List all datasources available in the current organization. Use this to discover datasource IDs before querying metrics or labels.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

const getMetricsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_metrics',
    description:
      'List available metric names from the datasource. Use this to discover what metrics exist before writing a query.',
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Optional search filter to narrow down metric names',
        },
        ...datasourceIdParam,
      },
    },
  },
}

const getLabelsTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_labels',
    description:
      'List available label names from the datasource. Optionally filter to labels for a specific metric.',
    parameters: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          description: 'Optional metric name to filter labels for',
        },
        ...datasourceIdParam,
      },
    },
  },
}

const getLabelValuesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_label_values',
    description:
      'List values for a specific label from the datasource. Optionally filter to values for a specific metric.',
    parameters: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'The label name to get values for (required)',
        },
        metric: {
          type: 'string',
          description: 'Optional metric name to filter label values for',
        },
        ...datasourceIdParam,
      },
      required: ['label'],
    },
  },
}

const writeQueryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_query',
    description:
      'Write a query into the query editor on the current page. Supports PromQL/MetricsQL for metrics, LogQL for logs, and TraceQL for traces. The user can then review it before running.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The query expression to write (PromQL/MetricsQL, LogQL, TraceQL, etc.)',
        },
      },
      required: ['query'],
    },
  },
}

const runQueryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_query',
    description:
      'Execute the query currently in the editor. Use after write_query to run the query and show results to the user.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

const generateDashboardTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_dashboard',
    description:
      'Generate a complete dashboard from the discovered metrics. Call this after using get_metrics, get_labels, and get_label_values to understand the available data. The dashboard will be previewed for the user before saving.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Dashboard title',
        },
        description: {
          type: 'string',
          description: 'Brief dashboard description',
        },
        panels: {
          type: 'array',
          description: 'Array of panel specifications',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Panel title' },
              type: {
                type: 'string',
                enum: ['line_chart', 'bar_chart', 'gauge', 'stat', 'table', 'pie'],
                description: 'Visualization type',
              },
              grid_pos: {
                type: 'object',
                properties: {
                  x: { type: 'number', description: 'Column position (0-11)' },
                  y: { type: 'number', description: 'Row position' },
                  w: { type: 'number', description: 'Width in columns (1-12)' },
                  h: { type: 'number', description: 'Height in rows' },
                },
                required: ['x', 'y', 'w', 'h'],
              },
              query: {
                type: 'object',
                description: 'Query configuration for this panel',
                properties: {
                  expr: { type: 'string', description: 'PromQL/MetricsQL query expression' },
                  legend_format: { type: 'string', description: 'Optional legend format string' },
                },
                required: ['expr'],
              },
            },
            required: ['title', 'type', 'grid_pos', 'query'],
          },
        },
      },
      required: ['title', 'panels'],
    },
  },
}

const getTraceServicesTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_trace_services',
    description:
      'List service names from a tracing datasource. Use this to discover what services are reporting traces.',
    parameters: {
      type: 'object',
      properties: {
        ...datasourceIdParam,
      },
    },
  },
}

// --- Tool set composition by datasource type ---

const METRICS_TYPES = ['victoriametrics', 'prometheus']
const LOGS_TYPES = ['loki', 'victorialogs', 'elasticsearch', 'clickhouse']
const TRACES_TYPES = ['tempo', 'victoriatraces']

const commonTools: ToolDefinition[] = [
  listDatasourcesTool,
  getLabelsTool,
  getLabelValuesTool,
  writeQueryTool,
  runQueryTool,
]

export function getToolsForDatasourceType(datasourceType: string): ToolDefinition[] {
  if (METRICS_TYPES.includes(datasourceType)) {
    return [...commonTools, getMetricsTool, generateDashboardTool]
  }

  if (LOGS_TYPES.includes(datasourceType)) {
    return [...commonTools]
  }

  if (TRACES_TYPES.includes(datasourceType)) {
    return [...commonTools, getTraceServicesTool]
  }

  // Empty or unknown type: include ALL tools
  return [...commonTools, getMetricsTool, getTraceServicesTool, generateDashboardTool]
}

/** @deprecated Use getToolsForDatasourceType instead */
export function getMetricsTools(): ToolDefinition[] {
  return getToolsForDatasourceType('victoriametrics')
}

function resolveDatasourceId(args: Record<string, unknown>, defaultId: string): string | null {
  const id = (args.datasource_id as string) || defaultId
  return id || null
}

export function useCopilotToolExecutor(
  datasourceId: () => string,
  orgId: () => string,
  datasourceType: () => string,
) {
  const queryEditor = useQueryEditor()
  const router = useRouter()

  async function executeTool(toolCall: ToolCall): Promise<string> {
    const args = JSON.parse(toolCall.function.arguments || '{}')

    switch (toolCall.function.name) {
      case 'list_datasources': {
        const org = orgId()
        if (!org) return 'Error: no organization selected'
        const sources = await listDataSources(org)
        return JSON.stringify(sources.map((ds) => ({ id: ds.id, name: ds.name, type: ds.type })))
      }

      case 'get_metrics': {
        const dsId = resolveDatasourceId(args, datasourceId())
        if (!dsId)
          return 'Error: no datasource selected. Call list_datasources first to get a datasource ID.'
        const metrics = await fetchDataSourceMetricNames(dsId, args.search as string | undefined)
        if (metrics.length === 0) return 'No metrics found'
        if (metrics.length > 100) {
          return `Found ${metrics.length} metrics. Showing first 100:\n${metrics.slice(0, 100).join('\n')}`
        }
        return metrics.join('\n')
      }

      case 'get_labels': {
        const dsId = resolveDatasourceId(args, datasourceId())
        if (!dsId)
          return 'Error: no datasource selected. Call list_datasources first to get a datasource ID.'
        const labels = await fetchDataSourceLabels(dsId, args.metric as string | undefined)
        if (labels.length === 0) return 'No labels found'
        return labels.join('\n')
      }

      case 'get_label_values': {
        if (!args.label) return 'Error: label parameter is required'
        const dsId = resolveDatasourceId(args, datasourceId())
        if (!dsId)
          return 'Error: no datasource selected. Call list_datasources first to get a datasource ID.'
        const values = await fetchDataSourceLabelValues(
          dsId,
          args.label as string,
          args.metric as string | undefined,
        )
        if (values.length === 0) return `No values found for label "${args.label}"`
        if (values.length > 100) {
          return `Found ${values.length} values for "${args.label}". Showing first 100:\n${values.slice(0, 100).join('\n')}`
        }
        return values.join('\n')
      }

      case 'get_trace_services': {
        const dsId = resolveDatasourceId(args, datasourceId())
        if (!dsId)
          return 'Error: no datasource selected. Call list_datasources first to get a datasource ID.'
        const services = await fetchDataSourceTraceServices(dsId)
        if (services.length === 0) return 'No services found'
        return services.join('\n')
      }

      case 'write_query': {
        if (!args.query) return 'Error: query parameter is required'
        if (queryEditor.hasEditor()) {
          queryEditor.setQuery(args.query as string)
          return `Query written to editor: ${args.query}`
        }
        const dsType = datasourceType()
        let route = '/app/explore/metrics'
        if (['loki', 'victorialogs'].includes(dsType)) route = '/app/explore/logs'
        else if (['tempo', 'victoriatraces'].includes(dsType)) route = '/app/explore/traces'
        await router.push(route)
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (queryEditor.hasEditor()) {
          queryEditor.setQuery(args.query as string)
          return `Navigated to Explore and wrote query: ${args.query}`
        }
        return `Navigated to Explore but editor not ready. Query: ${args.query}`
      }

      case 'run_query': {
        if (queryEditor.hasEditor()) {
          queryEditor.execute()
          return 'Query executed'
        }
        return 'No query editor available to execute'
      }

      default:
        return `Unknown tool: ${toolCall.function.name}`
    }
  }

  return { executeTool }
}
