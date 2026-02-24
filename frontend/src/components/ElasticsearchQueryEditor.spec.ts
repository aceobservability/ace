import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElasticsearchQueryEditor from './ElasticsearchQueryEditor.vue'

describe('ElasticsearchQueryEditor', () => {
  it('renders metrics signal by default', () => {
    const wrapper = mount(ElasticsearchQueryEditor, {
      props: {
        modelValue: '',
      },
    })

    const signalSelect = wrapper.find('#elasticsearch-signal')
    const queryInput = wrapper.find('#elasticsearch-query')

    expect((signalSelect.element as HTMLSelectElement).value).toBe('metrics')
    expect((queryInput.element as HTMLTextAreaElement).placeholder).toContain('"aggs"')
  })

  it('emits signal updates when changed', async () => {
    const wrapper = mount(ElasticsearchQueryEditor, {
      props: {
        modelValue: '',
      },
    })

    await wrapper.find('#elasticsearch-signal').setValue('logs')

    expect(wrapper.emitted('update:signal')).toBeTruthy()
    expect(wrapper.emitted('update:signal')?.[0]).toEqual(['logs'])
  })

  it('emits query updates when query changes', async () => {
    const wrapper = mount(ElasticsearchQueryEditor, {
      props: {
        modelValue: '',
        signal: 'logs',
      },
    })

    await wrapper.find('#elasticsearch-query').setValue('{"query":{"query_string":{"query":"error"}}}')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['{"query":{"query_string":{"query":"error"}}}'])
  })
})
