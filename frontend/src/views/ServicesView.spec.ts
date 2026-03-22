import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ServicesView from './ServicesView.vue'

const mockRegisterContext = vi.fn()
vi.mock('../composables/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: { value: null },
    registerContext: mockRegisterContext,
    deregisterContext: vi.fn(),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/app/services' }),
  useRouter: () => ({ push: vi.fn() }),
}))

describe('ServicesView', () => {
  it('renders 6 service cards', () => {
    const wrapper = mount(ServicesView)
    const cards = wrapper.findAll('[data-testid="service-card"]')
    expect(cards).toHaveLength(6)
  })

  it('renders expected service names', () => {
    const wrapper = mount(ServicesView)
    expect(wrapper.text()).toContain('API Gateway')
    expect(wrapper.text()).toContain('Auth Service')
    expect(wrapper.text()).toContain('Payment Service')
    expect(wrapper.text()).toContain('Search Engine')
    expect(wrapper.text()).toContain('Notification Service')
    expect(wrapper.text()).toContain('Analytics Pipeline')
  })

  it('renders service name in font-display', () => {
    const wrapper = mount(ServicesView)
    const names = wrapper.findAll('[data-testid="service-name"]')
    expect(names.length).toBeGreaterThan(0)
    expect(names[0].classes()).toContain('font-display')
  })

  it('renders metrics in font-mono', () => {
    const wrapper = mount(ServicesView)
    const metrics = wrapper.findAll('[data-testid="service-metric"]')
    expect(metrics.length).toBeGreaterThan(0)
    expect(metrics[0].classes()).toContain('font-mono')
  })

  it('renders StatusDot for each service', () => {
    const wrapper = mount(ServicesView)
    const dots = wrapper.findAllComponents({ name: 'StatusDot' })
    expect(dots).toHaveLength(6)
  })

  it('renders 3 healthy, 2 warning, 1 critical statuses', () => {
    const wrapper = mount(ServicesView)
    const dots = wrapper.findAllComponents({ name: 'StatusDot' })
    const statuses = dots.map((d) => d.props('status'))
    expect(statuses.filter((s) => s === 'healthy')).toHaveLength(3)
    expect(statuses.filter((s) => s === 'warning')).toHaveLength(2)
    expect(statuses.filter((s) => s === 'critical')).toHaveLength(1)
  })

  it('shows AI health prediction chip on one card', () => {
    const wrapper = mount(ServicesView)
    const chips = wrapper.findAll('[data-testid="service-ai-chip"]')
    expect(chips).toHaveLength(1)
    expect(chips[0].text()).toContain('Likely to degrade')
  })

  it('registers command context on mount', () => {
    mount(ServicesView)
    expect(mockRegisterContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: 'Services',
      }),
    )
  })

  it('shows each card with 3 metrics (latency, error rate, throughput)', () => {
    const wrapper = mount(ServicesView)
    // Each card should have 3 metric entries
    const firstCard = wrapper.findAll('[data-testid="service-card"]')[0]
    const metrics = firstCard.findAll('[data-testid="service-metric"]')
    expect(metrics).toHaveLength(3)
  })
})
