import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CreateOrganizationModal from './CreateOrganizationModal.vue'
import * as organizationsApi from '../api/organizations'

vi.mock('../api/organizations')

describe('CreateOrganizationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders as a centered modal dialog', async () => {
    const wrapper = mount(CreateOrganizationModal, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    await flushPromises()

    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('role')).toBe('dialog')

    wrapper.unmount()
  })

  it('submits create organization and emits created', async () => {
    vi.mocked(organizationsApi.createOrganization).mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      role: 'admin',
      created_at: '2026-02-09T00:00:00Z',
    })

    const wrapper = mount(CreateOrganizationModal, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    await wrapper.find('input#name').setValue('  Acme  ')
    await wrapper.find('input#slug').setValue('acme')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(organizationsApi.createOrganization).toHaveBeenCalledWith({
      name: 'Acme',
      slug: 'acme',
    })
    expect(wrapper.emitted('created')).toBeTruthy()

    wrapper.unmount()
  })

  it('closes on escape key', async () => {
    const wrapper = mount(CreateOrganizationModal, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })
})
