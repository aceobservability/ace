import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
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
})
