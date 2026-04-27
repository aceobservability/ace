import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { DataSource } from '../types/datasource'

const mocks = vi.hoisted(() => ({
  registerContext: vi.fn(),
  deregisterContext: vi.fn(),
  datasources: { value: [] as DataSource[], __v_isRef: true as const },
  tracingDatasources: { value: [] as DataSource[], __v_isRef: true as const },
  datasourceLoading: { value: false, __v_isRef: true as const },
  datasourceError: { value: null as string | null, __v_isRef: true as const },
  toggleFavorite: vi.fn(),
  isFavorite: vi.fn(() => false),
  fetchDataSourceTraceServices: vi.fn(),
}))

vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: { value: null },
    registerContext: mocks.registerContext,
    deregisterContext: mocks.deregisterContext,
  }),
}))

vi.mock('../composables/useDatasource', () => ({
  useDatasource: () => ({
    datasources: mocks.datasources,
    tracingDatasources: mocks.tracingDatasources,
    loading: mocks.datasourceLoading,
    error: mocks.datasourceError,
  }),
}))

vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    toggleFavorite: mocks.toggleFavorite,
    isFavorite: mocks.isFavorite,
  }),
}))

vi.mock('../api/datasources', () => ({
  fetchDataSourceTraceServices: mocks.fetchDataSourceTraceServices,
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/app/services' }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: String, default: '' } },
    setup(props, { slots }) {
      return () => h('a', { href: props.to, 'data-to': props.to }, slots.default?.())
    },
  }),
}))

import ServicesView from './ServicesView.vue'

function makeDatasource(overrides: Partial<DataSource>): DataSource {
  return {
    id: 'ds-1',
    organization_id: 'org-1',
    name: 'Tempo Prod',
    type: 'tempo',
    url: 'http://tempo:3200',
    is_default: true,
    auth_type: 'none',
    trace_id_field: 'trace_id',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const EmptyStateStub = defineComponent({
  name: 'EmptyState',
  props: ['icon', 'title', 'description', 'actionLabel', 'actionRoute'],
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'empty-state' }, [
        h('span', { 'data-testid': 'empty-state-title' }, props.title),
        h('span', { 'data-testid': 'empty-state-description' }, props.description),
        props.actionLabel ? h('span', { 'data-testid': 'empty-state-action' }, props.actionLabel) : null,
      ])
  },
})

const StatusDotStub = defineComponent({
  name: 'StatusDot',
  props: ['status', 'size'],
  setup(props) {
    return () => h('span', { 'data-testid': 'status-dot', 'data-status': props.status })
  },
})

function createWrapper() {
  return mount(ServicesView, {
    global: {
      stubs: {
        EmptyState: EmptyStateStub,
        StatusDot: StatusDotStub,
      },
    },
  })
}

describe('ServicesView', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.datasources.value = []
    mocks.tracingDatasources.value = []
    mocks.datasourceLoading.value = false
    mocks.datasourceError.value = null
    mocks.fetchDataSourceTraceServices.mockResolvedValue([])
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('renders services discovered from tracing datasources', async () => {
    const tempo = makeDatasource({ id: 'tempo-1', name: 'Tempo Prod', type: 'tempo' })
    mocks.datasources.value = [tempo]
    mocks.tracingDatasources.value = [tempo]
    mocks.fetchDataSourceTraceServices.mockResolvedValue(['checkout-api', 'payments-worker'])

    wrapper = createWrapper()
    await flushPromises()

    const cards = wrapper.findAll('[data-testid="service-card"]')
    expect(cards).toHaveLength(2)
    expect(wrapper.text()).toContain('checkout-api')
    expect(wrapper.text()).toContain('payments-worker')
    expect(wrapper.text()).toContain('Tempo Prod')
    expect(wrapper.text()).toContain('Inventory only')
    expect(wrapper.text()).toContain('not show sample health data')
  })

  it('does not render the previous hardcoded demo services as live data', async () => {
    const tempo = makeDatasource({ id: 'tempo-1' })
    mocks.datasources.value = [tempo]
    mocks.tracingDatasources.value = [tempo]
    mocks.fetchDataSourceTraceServices.mockResolvedValue(['checkout-api'])

    wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).not.toContain('API Gateway')
    expect(wrapper.text()).not.toContain('Payment Service')
    expect(wrapper.text()).not.toContain('Analytics Pipeline')
    expect(wrapper.findAll('[data-testid="service-ai-chip"]')).toHaveLength(0)
  })

  it('shows an honest empty state when no datasources are configured', () => {
    wrapper = createWrapper()

    expect(wrapper.find('[data-testid="empty-state-title"]').text()).toBe(
      'No service telemetry configured',
    )
    expect(wrapper.find('[data-testid="empty-state-description"]').text()).toContain(
      'will not show hardcoded sample services',
    )
    expect(wrapper.find('[data-testid="empty-state-action"]').text()).toBe('Add Data Source')
  })

  it('asks for tracing datasource when only non-tracing datasources exist', () => {
    const prometheus = makeDatasource({
      id: 'prom-1',
      name: 'Prometheus Prod',
      type: 'prometheus',
    })
    mocks.datasources.value = [prometheus]
    mocks.tracingDatasources.value = []

    wrapper = createWrapper()

    expect(wrapper.find('[data-testid="empty-state-title"]').text()).toBe(
      'No tracing datasource configured',
    )
    expect(wrapper.find('[data-testid="empty-state-description"]').text()).toContain(
      'Tempo, VictoriaTraces, or ClickHouse',
    )
  })

  it('shows discovery error instead of falling back to sample services', async () => {
    const tempo = makeDatasource({ id: 'tempo-1' })
    mocks.datasources.value = [tempo]
    mocks.tracingDatasources.value = [tempo]
    mocks.fetchDataSourceTraceServices.mockRejectedValue(new Error('trace endpoint unavailable'))

    wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('[data-testid="services-discovery-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Service discovery failed for 1 tracing datasource')
    expect(wrapper.findAll('[data-testid="service-card"]')).toHaveLength(0)
  })

  it('registers command context on mount and deregisters on unmount', () => {
    wrapper = createWrapper()

    expect(mocks.registerContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: 'Services',
        viewRoute: '/app/services',
      }),
    )

    wrapper.unmount()
    expect(mocks.deregisterContext).toHaveBeenCalledTimes(1)
  })
})
