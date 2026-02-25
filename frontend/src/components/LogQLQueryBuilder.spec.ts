import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LogQLQueryBuilder from './LogQLQueryBuilder.vue'

const mockFetchDataSourceLabelValues = vi.hoisted(() => vi.fn())

vi.mock('./MonacoQueryEditor.vue', () => ({
  default: {
    name: 'MonacoQueryEditor',
    props: ['modelValue'],
    emits: ['update:modelValue', 'submit'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}))

vi.mock('../api/datasources', () => ({
  fetchDataSourceLabelValues: mockFetchDataSourceLabelValues,
}))

/** Find the "Add Filter" button */
function findAddBtn(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find(b => b.text().includes('Add Filter'))!
}

/** Find the first filter label select (indexed field) */
function findLabelSelect(wrapper: ReturnType<typeof mount>) {
  // This is the first select among the filter row selects (with "Indexed field" option)
  return wrapper.findAll('select').find(s =>
    s.findAll('option').some(o => o.text() === 'Indexed field')
  )!
}

/** Find the filter value select (with "Field value" option) */
function findValueSelect(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('select').find(s =>
    s.findAll('option').some(o => o.text() === 'Field value')
  )!
}

/** Find the line filter value input (text input next to the operator select) */
function findLineValueInput(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('input[type="text"]').find(i =>
    i.attributes('placeholder')?.includes('Contains') ||
    i.attributes('placeholder')?.includes('regex') ||
    i.attributes('placeholder')?.includes('Phrase') ||
    i.attributes('placeholder')?.includes('exact match')
  )!
}

describe('LogQLQueryBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchDataSourceLabelValues.mockResolvedValue(['api', 'worker'])
  })

  it('builds selector query from indexed field, operator, and value dropdowns', async () => {
    const wrapper = mount(LogQLQueryBuilder, {
      props: {
        modelValue: '',
        indexedLabels: ['job', 'service_name'],
        datasourceId: 'ds-1',
      },
    })

    await findAddBtn(wrapper).trigger('click')
    await findLabelSelect(wrapper).setValue('job')
    await flushPromises()

    expect(mockFetchDataSourceLabelValues).toHaveBeenCalledWith('ds-1', 'job')

    await findValueSelect(wrapper).setValue('api')
    await flushPromises()

    const updates = wrapper.emitted('update:modelValue') || []
    expect(updates.at(-1)).toEqual(['{job="api"}'])
  })

  it('appends line filter operator to generated query', async () => {
    const wrapper = mount(LogQLQueryBuilder, {
      props: {
        modelValue: '',
        indexedLabels: ['job'],
        datasourceId: 'ds-1',
      },
    })

    await findAddBtn(wrapper).trigger('click')
    await findLabelSelect(wrapper).setValue('job')
    await flushPromises()
    await findValueSelect(wrapper).setValue('api')

    await findLineValueInput(wrapper).setValue('error')
    await flushPromises()

    const updates = wrapper.emitted('update:modelValue') || []
    expect(updates.at(-1)).toEqual(['{job="api"} |= "error"'])
  })

  it('builds LogsQL query for Victoria Logs with field and value dropdowns', async () => {
    const wrapper = mount(LogQLQueryBuilder, {
      props: {
        modelValue: '',
        queryLanguage: 'logsql',
        indexedLabels: ['service_name'],
        datasourceId: 'ds-2',
      },
    })

    await findAddBtn(wrapper).trigger('click')
    await findLabelSelect(wrapper).setValue('service_name')
    await flushPromises()
    await findValueSelect(wrapper).setValue('api')
    await flushPromises()

    const updates = wrapper.emitted('update:modelValue') || []
    expect(updates.at(-1)).toEqual(['* "service_name":="api"'])
  })

  it('uses LogsQL text filter operators in builder mode', async () => {
    const wrapper = mount(LogQLQueryBuilder, {
      props: {
        modelValue: '',
        queryLanguage: 'logsql',
        indexedLabels: [],
        datasourceId: 'ds-2',
      },
    })

    await findLineValueInput(wrapper).setValue('error')
    await flushPromises()

    const updates = wrapper.emitted('update:modelValue') || []
    expect(updates.at(-1)).toEqual(['* "error"'])
  })
})
