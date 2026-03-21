import { useRouter } from 'vue-router'
import {
  fetchDataSourceLabels,
  fetchDataSourceLabelValues,
  fetchDataSourceMetricNames,
} from '../api/datasources'
import type { ToolCall, ToolDefinition } from './useCopilot'
import { useQueryEditor } from './useQueryEditor'

export function getVictoriaMetricsTools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_metrics',
        description:
          'List available metric names from VictoriaMetrics. Use this to discover what metrics exist before writing a query.',
        parameters: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Optional search filter to narrow down metric names',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_labels',
        description:
          'List available label names from VictoriaMetrics. Optionally filter to labels for a specific metric.',
        parameters: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              description: 'Optional metric name to filter labels for',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_label_values',
        description:
          'List values for a specific label from VictoriaMetrics. Optionally filter to values for a specific metric.',
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
          },
          required: ['label'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_query',
        description:
          'Write a MetricsQL query into the query editor on the current page. The user can then review it before running.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The MetricsQL query expression to write',
            },
          },
          required: ['query'],
        },
      },
    },
    {
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
    },
    {
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
    },
  ]
}

export function useCopilotToolExecutor(datasourceId: () => string) {
  const queryEditor = useQueryEditor()
  const router = useRouter()

  async function executeTool(toolCall: ToolCall): Promise<string> {
    const args = JSON.parse(toolCall.function.arguments || '{}')
    const dsId = datasourceId()

    switch (toolCall.function.name) {
      case 'get_metrics': {
        const metrics = await fetchDataSourceMetricNames(dsId, args.search)
        if (metrics.length === 0) return 'No metrics found'
        if (metrics.length > 100) {
          return `Found ${metrics.length} metrics. Showing first 100:\n${metrics.slice(0, 100).join('\n')}`
        }
        return metrics.join('\n')
      }

      case 'get_labels': {
        const labels = await fetchDataSourceLabels(dsId, args.metric)
        if (labels.length === 0) return 'No labels found'
        return labels.join('\n')
      }

      case 'get_label_values': {
        if (!args.label) return 'Error: label parameter is required'
        const values = await fetchDataSourceLabelValues(dsId, args.label, args.metric)
        if (values.length === 0) return `No values found for label "${args.label}"`
        if (values.length > 100) {
          return `Found ${values.length} values for "${args.label}". Showing first 100:\n${values.slice(0, 100).join('\n')}`
        }
        return values.join('\n')
      }

      case 'write_query': {
        if (!args.query) return 'Error: query parameter is required'
        if (queryEditor.hasEditor()) {
          queryEditor.setQuery(args.query)
          return `Query written to editor: ${args.query}`
        }
        await router.push('/app/explore/metrics')
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (queryEditor.hasEditor()) {
          queryEditor.setQuery(args.query)
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
