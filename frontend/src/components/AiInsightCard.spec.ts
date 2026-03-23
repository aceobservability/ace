import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AiInsightCard from './AiInsightCard.vue'

describe('AiInsightCard', () => {
  const defaultProps = {
    title: 'Anomaly Detected',
    description: 'CPU usage spiked 40% above baseline at 14:32 UTC.',
    timestamp: '2 minutes ago',
    type: 'anomaly' as const,
  }

  it('renders title, description, and timestamp', () => {
    const wrapper = mount(AiInsightCard, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Anomaly Detected')
    expect(wrapper.text()).toContain('CPU usage spiked 40% above baseline at 14:32 UTC.')
    expect(wrapper.text()).toContain('2 minutes ago')
  })

  it('applies amber left border for anomaly type', () => {
    const wrapper = mount(AiInsightCard, {
      props: { ...defaultProps, type: 'anomaly' },
    })

    const card = wrapper.find('[data-testid="ai-insight-card"]')
    const style = card.attributes('style') || ''
    expect(style).toContain('#E5A00D')
    expect(style).toContain('border-left')
  })

  it('applies blue left border for optimization type', () => {
    const wrapper = mount(AiInsightCard, {
      props: { ...defaultProps, type: 'optimization' },
    })

    const card = wrapper.find('[data-testid="ai-insight-card"]')
    const style = card.attributes('style') || ''
    expect(style).toContain('#60A5FA')
  })

  it('applies orange left border for forecast type', () => {
    const wrapper = mount(AiInsightCard, {
      props: { ...defaultProps, type: 'forecast' },
    })

    const card = wrapper.find('[data-testid="ai-insight-card"]')
    const style = card.attributes('style') || ''
    expect(style).toContain('#F97316')
  })

  it('sets datetime attribute on the <time> element', () => {
    const wrapper = mount(AiInsightCard, {
      props: defaultProps,
    })

    const timeEl = wrapper.find('time')
    expect(timeEl.exists()).toBe(true)
    expect(timeEl.attributes('datetime')).toBe('2 minutes ago')
  })

  it('does not use backdrop-filter (old glassmorphic style removed)', () => {
    const wrapper = mount(AiInsightCard, {
      props: defaultProps,
    })

    const card = wrapper.find('[data-testid="ai-insight-card"]')
    const style = card.attributes('style') || ''
    expect(style).not.toContain('backdrop-filter')
  })
})
