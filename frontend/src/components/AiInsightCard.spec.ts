import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AiInsightCard from './AiInsightCard.vue'

describe('AiInsightCard', () => {
  const defaultProps = {
    title: 'Anomaly Detected',
    description: 'CPU usage spiked 40% above baseline at 14:32 UTC.',
    timestamp: '2 minutes ago',
  }

  it('renders title, description, and timestamp', () => {
    const wrapper = mount(AiInsightCard, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Anomaly Detected')
    expect(wrapper.text()).toContain('CPU usage spiked 40% above baseline at 14:32 UTC.')
    expect(wrapper.text()).toContain('2 minutes ago')
  })

  it('has backdrop-blur in style', () => {
    const wrapper = mount(AiInsightCard, {
      props: defaultProps,
    })

    const card = wrapper.find('[data-testid="ai-insight-card"]')
    expect(card.exists()).toBe(true)
    expect(card.attributes('style')).toContain('backdrop-filter')
    expect(card.attributes('style')).toContain('blur')
  })
})
