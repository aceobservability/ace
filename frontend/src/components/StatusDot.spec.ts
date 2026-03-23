import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StatusDot from './StatusDot.vue'

describe('StatusDot', () => {
  it.each([
    ['healthy', 'var(--color-secondary)'],
    ['warning', 'var(--color-tertiary)'],
    ['critical', 'var(--color-error)'],
    ['info', 'var(--color-primary)'],
  ] as const)('renders correct color for status "%s"', (status, expectedColor) => {
    const wrapper = mount(StatusDot, {
      props: { status },
    })

    const dot = wrapper.find('[role="status"]')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('style')).toContain(expectedColor)
  })

  it.each([
    ['healthy', 'Healthy'],
    ['warning', 'Warning'],
    ['critical', 'Critical'],
    ['info', 'Info'],
  ] as const)('has aria-label "%s" for status "%s"', (status, expectedLabel) => {
    const wrapper = mount(StatusDot, {
      props: { status },
    })

    const dot = wrapper.find('[role="status"]')
    expect(dot.attributes('aria-label')).toBe(expectedLabel)
  })

  it('applies default size of 4', () => {
    const wrapper = mount(StatusDot, {
      props: { status: 'healthy' },
    })

    const dot = wrapper.find('[role="status"]')
    expect(dot.attributes('style')).toContain('4px')
  })

  it('applies custom size', () => {
    const wrapper = mount(StatusDot, {
      props: { status: 'healthy', size: 8 },
    })

    const dot = wrapper.find('[role="status"]')
    expect(dot.attributes('style')).toContain('8px')
  })

  it('applies glow animation for critical status', () => {
    const wrapper = mount(StatusDot, {
      props: { status: 'critical' },
    })

    const dot = wrapper.find('[role="status"]')
    expect(dot.attributes('style')).toContain('pulse-critical')
  })

  it('applies glow animation for warning status', () => {
    const wrapper = mount(StatusDot, {
      props: { status: 'warning' },
    })

    const dot = wrapper.find('[role="status"]')
    expect(dot.attributes('style')).toContain('pulse-warning')
  })

  it('does NOT apply glow animation for healthy status', () => {
    const wrapper = mount(StatusDot, {
      props: { status: 'healthy' },
    })

    const dot = wrapper.find('[role="status"]')
    expect(dot.attributes('style')).not.toContain('pulse-')
  })

  it('applies both opacity pulse and glow when pulse prop is true on critical status', () => {
    const wrapper = mount(StatusDot, {
      props: { status: 'critical', pulse: true },
    })

    const dot = wrapper.find('[role="status"]')
    const style = dot.attributes('style') || ''
    expect(style).toContain('statusDotPulse')
    expect(style).toContain('pulse-critical')
  })

  describe('prefers-reduced-motion', () => {
    let matchMediaSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      matchMediaSpy = vi.spyOn(window, 'matchMedia')
    })

    afterEach(() => {
      matchMediaSpy.mockRestore()
      vi.resetModules()
    })

    it('suppresses all animations when prefers-reduced-motion is enabled', async () => {
      matchMediaSpy.mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      // Re-import the component so the module-level matchMedia check picks up the mock
      const { default: StatusDotFresh } = await import('./StatusDot.vue')
      const wrapper = mount(StatusDotFresh, {
        props: { status: 'critical', pulse: true },
      })

      const dot = wrapper.find('[role="status"]')
      const style = dot.attributes('style') || ''
      expect(style).not.toContain('pulse-critical')
      expect(style).not.toContain('statusDotPulse')
    })
  })
})
