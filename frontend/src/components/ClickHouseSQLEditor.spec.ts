import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ClickHouseSQLEditor from './ClickHouseSQLEditor.vue'

describe('ClickHouseSQLEditor', () => {
  it('renders metrics signal defaults', () => {
    const wrapper = mount(ClickHouseSQLEditor, {
      props: {
        modelValue: '',
        showSignalSelector: true,
      },
    })

    const signalSelect = wrapper.find('#clickhouse-signal')
    const sqlInput = wrapper.find('#clickhouse-query')

    expect((signalSelect.element as HTMLSelectElement).value).toBe('metrics')
    expect((sqlInput.element as HTMLTextAreaElement).placeholder).toContain(
      'SELECT toStartOfInterval',
    )
    expect(wrapper.text()).toContain('timestamp')
    expect(wrapper.text()).toContain('value')
  })

  it('emits signal updates when changed', async () => {
    const wrapper = mount(ClickHouseSQLEditor, {
      props: {
        modelValue: '',
        showSignalSelector: true,
      },
    })

    await wrapper.find('#clickhouse-signal').setValue('logs')

    expect(wrapper.emitted('update:signal')).toBeTruthy()
    expect(wrapper.emitted('update:signal')?.[0]).toEqual(['logs'])
  })

  it('emits query updates when SQL changes', async () => {
    const wrapper = mount(ClickHouseSQLEditor, {
      props: {
        modelValue: '',
        signal: 'logs',
      },
    })

    await wrapper.find('#clickhouse-query').setValue('SELECT * FROM logs_table LIMIT 10')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['SELECT * FROM logs_table LIMIT 10'])
  })

  it('shows traces help when traces signal is selected', () => {
    const wrapper = mount(ClickHouseSQLEditor, {
      props: {
        modelValue: '',
        signal: 'traces',
        showSignalSelector: true,
      },
    })

    expect(wrapper.text()).toContain('span_id')
    expect(wrapper.text()).toContain('start_time_unix_nano')
    expect(wrapper.find('#clickhouse-query').attributes('placeholder')).toContain(
      'FROM ace_traces',
    )
  })
})
