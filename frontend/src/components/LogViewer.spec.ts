import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LogViewer from './LogViewer.vue'

describe('LogViewer', () => {
  it('renders empty state when logs are missing', () => {
    const wrapper = mount(LogViewer, {
      props: {
        logs: [],
      },
    })

    expect(wrapper.find('.text-center').exists()).toBe(true)
    expect(wrapper.text()).toContain('No log entries')
  })

  it('expands a row and shows detected JSON fields', async () => {
    const wrapper = mount(LogViewer, {
      props: {
        logs: [
          {
            timestamp: '2026-01-01T12:00:00Z',
            line: '{"message":"request failed","code":500,"meta":{"service":"api"}}',
            labels: { source: 'docker' },
            level: 'error',
          },
        ],
      },
    })

    await wrapper.find('.cursor-pointer').trigger('click')

    expect(wrapper.text()).toContain('Detected Fields')
    expect(wrapper.text()).toContain('Detected Fields')
    expect(wrapper.text()).toContain('message')
    expect(wrapper.text()).toContain('request failed')
    expect(wrapper.text()).toContain('meta.service')
    expect(wrapper.text()).toContain('api')
  })

  it('collapses expanded row when clicked again', async () => {
    const wrapper = mount(LogViewer, {
      props: {
        logs: [
          {
            timestamp: '2026-01-01T12:00:00Z',
            line: '{"status":"ok"}',
            labels: {},
            level: 'info',
          },
        ],
      },
    })

    const row = wrapper.find('.cursor-pointer')
    await row.trigger('click')
    expect(wrapper.text()).toContain('Detected Fields')

    await row.trigger('click')
    expect(wrapper.text()).not.toContain('Detected Fields')
  })

  it('detects key-value fields in plain text logs', async () => {
    const wrapper = mount(LogViewer, {
      props: {
        logs: [
          {
            timestamp: '2026-01-01T12:00:00Z',
            line: 'level=error service=worker retry=3 msg="job failed"',
            labels: { stream: 'stderr' },
            level: 'error',
          },
        ],
      },
    })

    await wrapper.find('.cursor-pointer').trigger('click')

    expect(wrapper.text()).toContain('service')
    expect(wrapper.text()).toContain('worker')
    expect(wrapper.text()).toContain('retry')
    expect(wrapper.text()).toContain('3')
  })

  it('applies highlighted class for newly streamed logs', () => {
    const log = {
      timestamp: '2026-01-01T12:00:00Z',
      line: 'new live log line',
      labels: { service: 'api' },
      level: 'info',
    }

    const wrapper = mount(LogViewer, {
      props: {
        logs: [log],
        highlightedLogKeys: ['2026-01-01T12:00:00Z|service=api|new live log line'],
      },
    })

    // Highlighted logs use a row-highlight-fade animation class
    const row = wrapper.find('.cursor-pointer')
    expect(row.classes().some((c) => c.includes('animate-'))).toBe(true)
  })
})
