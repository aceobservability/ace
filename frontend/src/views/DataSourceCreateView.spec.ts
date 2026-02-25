import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataSourceCreateView from './DataSourceCreateView.vue'

const mockRouteParams: Record<string, string | undefined> = {}
const mockPush = vi.fn()

const mockGetDataSource = vi.hoisted(() => vi.fn())
const mockTestDataSourceDraftConnection = vi.hoisted(() => vi.fn())

const mockAddDatasource = vi.hoisted(() => vi.fn())
const mockEditDatasource = vi.hoisted(() => vi.fn())

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
  useRoute: () => ({ params: mockRouteParams }),
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: mockCurrentOrg,
  }),
}))

vi.mock('../composables/useDatasource', () => ({
  useDatasource: () => ({
    addDatasource: mockAddDatasource,
    editDatasource: mockEditDatasource,
  }),
}))

vi.mock('../api/datasources', () => ({
  getDataSource: mockGetDataSource,
  testDataSourceDraftConnection: mockTestDataSourceDraftConnection,
}))

describe('DataSourceCreateView route behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteParams.id = undefined
    mockAddDatasource.mockResolvedValue(undefined)
    mockEditDatasource.mockResolvedValue(undefined)
    mockGetDataSource.mockResolvedValue(undefined)
    mockTestDataSourceDraftConnection.mockResolvedValue(undefined)
  })

  it('uses create mode when route does not include datasource id', async () => {
    const wrapper = mount(DataSourceCreateView)
    await flushPromises()

    expect(wrapper.text()).toContain('Add Data Source')

    await wrapper.get('#ds-name').setValue('Primary Prometheus')
    await wrapper.get('#ds-url').setValue('http://localhost:9090')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(mockAddDatasource).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        name: 'Primary Prometheus',
        type: 'prometheus',
        url: 'http://localhost:9090',
      }),
    )
    expect(mockEditDatasource).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/datasources')
  })

  it('uses edit mode when route includes datasource id', async () => {
    mockRouteParams.id = 'ds-1'
    mockGetDataSource.mockResolvedValue({
      id: 'ds-1',
      organization_id: 'org-1',
      name: 'Tempo Source',
      type: 'tempo',
      url: 'http://tempo:3200',
      is_default: false,
      auth_type: 'none',
      auth_config: {},
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    })

    const wrapper = mount(DataSourceCreateView)
    await flushPromises()

    expect(mockGetDataSource).toHaveBeenCalledWith('ds-1')
    expect(wrapper.text()).toContain('Edit Data Source')

    await wrapper.get('#ds-name').setValue('Tempo Source Updated')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(mockEditDatasource).toHaveBeenCalledWith(
      'ds-1',
      expect.objectContaining({
        name: 'Tempo Source Updated',
        type: 'tempo',
        url: 'http://tempo:3200',
      }),
    )
    expect(mockAddDatasource).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/datasources')
  })
})
