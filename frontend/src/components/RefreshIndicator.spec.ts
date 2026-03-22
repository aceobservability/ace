import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RefreshIndicator from './RefreshIndicator.vue'

describe('RefreshIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows "Last refreshed" text', () => {
    const wrapper = mount(RefreshIndicator, {
      props: {
        lastRefreshed: new Date(),
        autoRefreshInterval: 15000,
        onIntervalChange: vi.fn(),
      },
      global: {
        stubs: { StatusDot: true },
      },
    })

    expect(wrapper.text()).toContain('Last refreshed')
  })

  it('shows dropdown options', async () => {
    const wrapper = mount(RefreshIndicator, {
      props: {
        lastRefreshed: new Date(),
        autoRefreshInterval: 15000,
        onIntervalChange: vi.fn(),
      },
      global: {
        stubs: { StatusDot: true },
      },
    })

    // Open dropdown
    const button = wrapper.find('[data-testid="refresh-dropdown-toggle"]')
    await button.trigger('click')

    const options = wrapper.findAll('[data-testid="refresh-option"]')
    expect(options.length).toBeGreaterThanOrEqual(4)

    const texts = options.map((o) => o.text())
    expect(texts).toContain('15s')
    expect(texts).toContain('30s')
    expect(texts).toContain('1m')
    expect(texts).toContain('5m')
    expect(texts).toContain('Off')
  })

  it('shows stale warning when data is old', async () => {
    const staleDate = new Date(Date.now() - 60000) // 60s ago
    const wrapper = mount(RefreshIndicator, {
      props: {
        lastRefreshed: staleDate,
        autoRefreshInterval: 15000, // 15s, so 2x = 30s, 60s > 30s => stale
        onIntervalChange: vi.fn(),
      },
      global: {
        stubs: { StatusDot: true },
      },
    })

    // Advance timers to trigger the interval update
    vi.advanceTimersByTime(1000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Data may be stale')
  })

  it('does not show stale warning when data is fresh', () => {
    const wrapper = mount(RefreshIndicator, {
      props: {
        lastRefreshed: new Date(),
        autoRefreshInterval: 15000,
        onIntervalChange: vi.fn(),
      },
      global: {
        stubs: { StatusDot: true },
      },
    })

    expect(wrapper.text()).not.toContain('Data may be stale')
  })
})
