import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import DataSourceSettings from './DataSourceSettings.vue'
import type { DataSource } from '../types/datasource'

const mockPush = vi.fn()
const mockFetchDatasources = vi.hoisted(() => vi.fn())
const mockRemoveDatasource = vi.hoisted(() => vi.fn())

const mockDatasources = ref<DataSource[]>([])
const mockLoading = ref(false)
const mockError = ref<string | null>(null)

const mockCurrentOrg = {
  value: {
    id: 'org-1',
    name: 'Acme',
    slug: 'acme',
    role: 'admin' as const,
    created_at: '2026-02-08T00:00:00Z',
    updated_at: '2026-02-08T00:00:00Z',
  },
}

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: mockCurrentOrg,
  }),
}))

vi.mock('../composables/useDatasource', () => ({
  useDatasource: () => ({
    datasources: mockDatasources,
    loading: mockLoading,
    error: mockError,
    fetchDatasources: mockFetchDatasources,
    removeDatasource: mockRemoveDatasource,
  }),
}))

vi.mock('../api/datasources', () => ({
  testDataSourceConnection: vi.fn(),
}))

describe('DataSourceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDatasources.value = [
      {
        id: 'ds-1',
        organization_id: 'org-1',
        name: 'Primary Prometheus',
        type: 'prometheus',
        url: 'http://localhost:9090',
        is_default: true,
        auth_type: 'none',
        auth_config: {},
        created_at: '2026-02-08T00:00:00Z',
        updated_at: '2026-02-08T00:00:00Z',
      },
    ]
    mockLoading.value = false
    mockError.value = null
  })

  it('navigates to edit route when edit icon is clicked', async () => {
    const wrapper = mount(DataSourceSettings)
    await flushPromises()

    await wrapper.get('button[title="Edit"]').trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/datasources/ds-1/edit')
  })
})
