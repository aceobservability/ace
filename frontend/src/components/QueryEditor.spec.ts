import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import QueryEditor from './QueryEditor.vue'
import * as useProm from '../composables/useProm'
import type { PrometheusQueryResult } from '../composables/useProm'

// Mock the useProm module
vi.mock('../composables/useProm', () => ({
  queryPrometheus: vi.fn()
}))

function findRunButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find(b => b.text().includes('Run Query') || b.text().includes('Running...'))!
}

describe('QueryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the query textarea', () => {
    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: ''
      }
    })

    expect(wrapper.find('textarea#promql-query').exists()).toBe(true)
    expect(findRunButton(wrapper).exists()).toBe(true)
  })

  it('displays the current query value', () => {
    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    const textarea = wrapper.find('textarea#promql-query')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('up')
  })

  it('emits update:modelValue when query changes', async () => {
    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: ''
      }
    })

    await wrapper.find('textarea#promql-query').setValue('process_cpu')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['process_cpu'])
  })

  it('disables inputs when disabled prop is true', () => {
    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up',
        disabled: true
      }
    })

    const textarea = wrapper.find('textarea#promql-query')
    const button = findRunButton(wrapper)

    expect((textarea.element as HTMLTextAreaElement).disabled).toBe(true)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables Run Query button when query is empty', () => {
    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: ''
      }
    })

    const button = findRunButton(wrapper)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Run Query button when query has value', () => {
    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    const button = findRunButton(wrapper)
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables Run Query button for whitespace-only query', () => {
    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: '   '
      }
    })

    const button = findRunButton(wrapper)
    // The button should be disabled because query.trim() is empty
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows loading state during query execution', async () => {
    let resolveQuery: ((value: PrometheusQueryResult) => void) | undefined
    const pendingPromise = new Promise<PrometheusQueryResult>((resolve) => {
      resolveQuery = resolve
    })

    vi.mocked(useProm.queryPrometheus).mockReturnValueOnce(pendingPromise)

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(findRunButton(wrapper).text()).toBe('Running...')

    resolveQuery?.({ status: 'success', data: { resultType: 'matrix', result: [] } })
    await flushPromises()

    expect(findRunButton(wrapper).text()).toBe('Run Query')
  })

  it('displays error when query fails', async () => {
    vi.mocked(useProm.queryPrometheus).mockResolvedValueOnce({
      status: 'error',
      error: 'parse error at line 1'
    })

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'invalid{query'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.find('.text-red-600').exists()).toBe(true)
    expect(wrapper.find('.text-red-600').text()).toBe('parse error at line 1')
  })

  it('displays results preview on successful query', async () => {
    vi.mocked(useProm.queryPrometheus).mockResolvedValueOnce({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up', instance: 'localhost:9090', job: 'prometheus' },
            values: [[1704067200, '1'], [1704067215, '1']]
          }
        ]
      }
    })

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Query Results')
    expect(wrapper.text()).toContain('1 series')
  })

  it('displays metric labels from query result', async () => {
    vi.mocked(useProm.queryPrometheus).mockResolvedValueOnce({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up', instance: 'localhost:9090', job: 'prometheus' },
            values: [[1704067200, '1']]
          }
        ]
      }
    })

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    const labels = wrapper.findAll('.font-mono.rounded-full')
    expect(labels.length).toBeGreaterThan(0)

    const labelTexts = labels.map(l => l.text())
    expect(labelTexts).toContain('__name__')
    expect(labelTexts).toContain('instance')
    expect(labelTexts).toContain('job')
  })

  it('displays preview table with metric data', async () => {
    vi.mocked(useProm.queryPrometheus).mockResolvedValueOnce({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up', job: 'prometheus' },
            values: [[1704067200, '1'], [1704067215, '1']]
          },
          {
            metric: { __name__: 'up', job: 'node' },
            values: [[1704067200, '0']]
          }
        ]
      }
    })

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.findAll('tbody tr').length).toBe(2)
    expect(wrapper.text()).toContain('2 series')
  })

  it('shows no data message when result is empty', async () => {
    vi.mocked(useProm.queryPrometheus).mockResolvedValueOnce({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: []
      }
    })

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'nonexistent_metric'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('No data returned')
  })

  it('clears results when query changes', async () => {
    vi.mocked(useProm.queryPrometheus).mockResolvedValueOnce({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up' },
            values: [[1704067200, '1']]
          }
        ]
      }
    })

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    // Run initial query
    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Query Results')

    // Change the query
    await wrapper.setProps({ modelValue: 'process_cpu' })
    await flushPromises()

    // Results should be cleared
    expect(wrapper.text()).not.toContain('Query Results')
  })

  it('handles network error gracefully', async () => {
    vi.mocked(useProm.queryPrometheus).mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.find('.text-red-600').exists()).toBe(true)
    expect(wrapper.find('.text-red-600').text()).toBe('Network error')
  })

  it('calls queryPrometheus with correct parameters', async () => {
    vi.mocked(useProm.queryPrometheus).mockResolvedValueOnce({
      status: 'success',
      data: { resultType: 'matrix', result: [] }
    })

    const wrapper = mount(QueryEditor, {
      props: {
        modelValue: 'up'
      }
    })

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(useProm.queryPrometheus).toHaveBeenCalledTimes(1)
    const [query, start, end, step] = vi.mocked(useProm.queryPrometheus).mock.calls[0]

    expect(query).toBe('up')
    expect(typeof start).toBe('number')
    expect(typeof end).toBe('number')
    expect(end - start).toBe(3600) // 1 hour range
    expect(step).toBe(15) // 15 second step
  })
})
