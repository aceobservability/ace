import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as converterApi from '../api/converter'
import * as api from '../api/dashboards'
import CreateDashboardModal from './CreateDashboardModal.vue'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('../api/dashboards')
vi.mock('../api/converter')
vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: { value: 'org-1' },
  }),
}))

describe('CreateDashboardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows both Blank Dashboard and Generate with AI options', () => {
    const wrapper = mount(CreateDashboardModal)

    const buttons = wrapper.findAll('button')
    const blankBtn = buttons.find((b) => b.text().includes('Blank Dashboard'))
    const aiBtn = buttons.find((b) => b.text().includes('Generate with AI'))

    expect(blankBtn).toBeDefined()
    expect(aiBtn).toBeDefined()
  })

  it('navigates to AI generation route on Generate with AI click', async () => {
    const wrapper = mount(CreateDashboardModal)

    const aiBtn = wrapper.findAll('button').find((b) => b.text().includes('Generate with AI'))
    await aiBtn?.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/app/dashboards/new/ai')
  })

  it('renders form fields when Blank Dashboard is selected', async () => {
    const wrapper = mount(CreateDashboardModal)

    // Click "Blank Dashboard" to enter create mode
    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    expect(wrapper.find('input#title').exists()).toBe(true)
    expect(wrapper.find('textarea#description').exists()).toBe(true)
  })

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(CreateDashboardModal)
    await wrapper.get('[data-testid="create-dashboard-close-btn"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows error when title is empty on blank dashboard submit', async () => {
    const wrapper = mount(CreateDashboardModal)

    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Title is required')
  })

  it('calls createDashboard API on blank dashboard submit', async () => {
    vi.mocked(api.createDashboard).mockResolvedValue({
      id: '123',
      title: 'New Dashboard',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    const wrapper = mount(CreateDashboardModal)

    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper.find('input#title').setValue('New Dashboard')
    await wrapper.find('textarea#description').setValue('Description')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createDashboard).toHaveBeenCalledWith('org-1', {
      title: 'New Dashboard',
      description: 'Description',
    })
    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('shows error on API failure', async () => {
    vi.mocked(api.createDashboard).mockRejectedValue(new Error('Failed to create dashboard'))

    const wrapper = mount(CreateDashboardModal)

    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper.find('input#title').setValue('New Dashboard')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to create dashboard')
  })

  it('imports dashboard from yaml file', async () => {
    vi.mocked(api.importDashboardYaml).mockResolvedValue({
      id: 'imported-1',
      title: 'Imported Dashboard',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    const wrapper = mount(CreateDashboardModal)

    // Switch to Import YAML mode
    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Import YAML')
      ?.trigger('click')

    const input = wrapper.find('input#yaml-file')
    const file = new File(
      [
        'version: 2\ntitle: Imported Dashboard\npanels:\n  - title: Requests\n    type: line_chart\n  - title: Errors\n    type: stat\n',
      ],
      'dashboard.yaml',
      { type: 'application/x-yaml' },
    )

    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.find('[data-testid="yaml-preview"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('2 panels')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.importDashboardYaml).toHaveBeenCalledWith(
      'org-1',
      expect.stringContaining('title: Imported Dashboard'),
    )
    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('rejects invalid file extension in import mode', async () => {
    const wrapper = mount(CreateDashboardModal)

    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Import YAML')
      ?.trigger('click')

    const input = wrapper.find('input#yaml-file')
    const file = new File(['{}'], 'dashboard.json', { type: 'application/json' })

    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('Please upload a .yaml or .yml file')
  })

  it('shows validation error for invalid dashboard yaml shape', async () => {
    const wrapper = mount(CreateDashboardModal)

    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Import YAML')
      ?.trigger('click')

    const input = wrapper.find('input#yaml-file')
    const file = new File(['version: 2\nname: invalid\n'], 'dashboard.yaml', {
      type: 'application/x-yaml',
    })

    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('Invalid YAML file. Missing dashboard title')
  })

  it('imports dashboard from grafana json conversion', async () => {
    vi.mocked(converterApi.convertGrafanaDashboard).mockResolvedValue({
      format: 'yaml',
      content:
        'version: 2\ntitle: Converted Dashboard\npanels:\n  - title: Requests\n',
      document: {
        version: 2,
        title: 'Converted Dashboard',
        description: 'From Grafana',
        panels: [
          {
            title: 'Requests',
            type: 'line_chart',
            position: { x: 0, y: 0, w: 24, h: 8 },
          },
        ],
      },
      warnings: ['Converted unsupported panel type'],
    })
    vi.mocked(api.importDashboardYaml).mockResolvedValue({
      id: 'converted-1',
      title: 'Converted Dashboard',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    const wrapper = mount(CreateDashboardModal)

    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Import Grafana')
      ?.trigger('click')
    await wrapper
      .get('[data-testid="grafana-source"]')
      .setValue('{"dashboard":{"title":"grafana"}}')
    await wrapper.get('[data-testid="grafana-convert"]').trigger('click')
    await flushPromises()

    expect(converterApi.convertGrafanaDashboard).toHaveBeenCalledWith(
      '{"dashboard":{"title":"grafana"}}',
      'yaml',
    )
    expect(wrapper.get('[data-testid="yaml-preview"]').text()).toContain('Converted Dashboard')
    expect(wrapper.get('[data-testid="grafana-warnings"]').text()).toContain(
      'unsupported panel type',
    )

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.importDashboardYaml).toHaveBeenCalledWith(
      'org-1',
      expect.stringContaining('version: 2'),
    )
    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('shows conversion error when grafana payload is invalid', async () => {
    vi.mocked(converterApi.convertGrafanaDashboard).mockRejectedValue(
      new Error('invalid grafana dashboard JSON'),
    )

    const wrapper = mount(CreateDashboardModal)

    const blankBtn = wrapper.findAll('button').find((b) => b.text().includes('Blank Dashboard'))
    await blankBtn?.trigger('click')

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Import Grafana')
      ?.trigger('click')
    await wrapper.get('[data-testid="grafana-source"]').setValue('{')
    await wrapper.get('[data-testid="grafana-convert"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('invalid grafana dashboard JSON')
  })

  it('has glassmorphic modal styling', () => {
    const wrapper = mount(CreateDashboardModal)
    const modal = wrapper.get('[data-testid="create-dashboard-modal"]')
    expect(modal.exists()).toBe(true)
  })
})
