import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// Mock HTTP layer only — let composables work for real
vi.mock('../api/datasources', () => ({
  fetchDataSourceMetricNames: vi.fn().mockResolvedValue(['up', 'http_requests_total']),
  fetchDataSourceLabels: vi.fn().mockResolvedValue(['job', 'instance']),
  fetchDataSourceLabelValues: vi.fn().mockResolvedValue(['node1']),
  fetchDataSourceTraceServices: vi.fn().mockResolvedValue(['frontend', 'api']),
  listDataSources: vi.fn().mockResolvedValue([
    {
      id: 'ds-1',
      name: 'Prometheus',
      type: 'prometheus',
      organization_id: 'org-1',
      url: '',
      is_default: true,
      auth_type: 'none',
      trace_id_field: '',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'ds-2',
      name: 'Loki',
      type: 'loki',
      organization_id: 'org-1',
      url: '',
      is_default: false,
      auth_type: 'none',
      trace_id_field: '',
      created_at: '',
      updated_at: '',
    },
  ]),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({ currentOrg: ref({ id: 'org-1', name: 'Test' }) }),
}))

// Mock useAIProvider — controls the chat request/response loop
const mockSendChatRequest = vi.fn()
vi.mock('../composables/useAIProvider', () => ({
  useAIProvider: () => ({
    sendChatRequest: mockSendChatRequest,
    chatMessages: ref([]),
    models: ref([]),
    selectedModel: ref(''),
    selectedProviderId: ref(''),
    fetchModels: vi.fn(),
    isLoading: ref(false),
    error: ref(null),
    providers: ref([]),
  }),
}))

vi.mock('../utils/markdown', () => ({
  initMarkdown: vi.fn().mockResolvedValue(undefined),
  renderMarkdown: vi.fn().mockResolvedValue('<p>test</p>'),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Do NOT mock useCopilotTools — we want the real executor!
// Do NOT mock useQueryEditor — it's used by the real executor

import CmdKChatView from './CmdKChatView.vue'

describe('CmdKChatView integration — real tool executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('metrics context: get_metrics tool call uses context datasource ID', async () => {
    const { fetchDataSourceMetricNames } = await import('../api/datasources')

    mockSendChatRequest
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          { id: 'tc-1', type: 'function', function: { name: 'get_metrics', arguments: '{}' } },
        ],
      })
      .mockResolvedValueOnce({ content: 'Found metrics: up', toolCalls: [] })

    mount(CmdKChatView, {
      props: {
        initialQuery: 'show metrics',
        datasourceType: 'victoriametrics',
        datasourceName: 'VM',
        datasourceId: 'ds-vm',
      },
      global: { stubs: { DashboardSpecPreview: true } },
    })
    await flushPromises()

    expect(fetchDataSourceMetricNames).toHaveBeenCalledWith('ds-vm', undefined, expect.anything())
  })

  it('logs context: get_labels tool call uses context datasource ID', async () => {
    const { fetchDataSourceLabels } = await import('../api/datasources')

    mockSendChatRequest
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          { id: 'tc-1', type: 'function', function: { name: 'get_labels', arguments: '{}' } },
        ],
      })
      .mockResolvedValueOnce({ content: 'Found labels', toolCalls: [] })

    mount(CmdKChatView, {
      props: {
        initialQuery: 'show labels',
        datasourceType: 'loki',
        datasourceName: 'Loki',
        datasourceId: 'ds-loki',
      },
      global: { stubs: { DashboardSpecPreview: true } },
    })
    await flushPromises()

    expect(fetchDataSourceLabels).toHaveBeenCalledWith('ds-loki', undefined, expect.anything())
  })

  it('no context: list_datasources then override works', async () => {
    const { listDataSources, fetchDataSourceMetricNames } = await import('../api/datasources')

    mockSendChatRequest
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          { id: 'tc-1', type: 'function', function: { name: 'list_datasources', arguments: '{}' } },
        ],
      })
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tc-2',
            type: 'function',
            function: { name: 'get_metrics', arguments: '{"datasource_id":"ds-1"}' },
          },
        ],
      })
      .mockResolvedValueOnce({ content: 'Here are your metrics', toolCalls: [] })

    mount(CmdKChatView, {
      props: {
        initialQuery: 'show metrics',
        datasourceType: '',
        datasourceName: '',
        datasourceId: '',
      },
      global: { stubs: { DashboardSpecPreview: true } },
    })
    await flushPromises()

    expect(listDataSources).toHaveBeenCalledWith('org-1')
    expect(fetchDataSourceMetricNames).toHaveBeenCalledWith('ds-1', undefined, expect.anything())
  })
})
