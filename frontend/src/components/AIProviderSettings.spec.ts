import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- Hoisted mock functions ---

const mockListAIProviders = vi.hoisted(() => vi.fn())
const mockCreateAIProvider = vi.hoisted(() => vi.fn())
const mockUpdateAIProvider = vi.hoisted(() => vi.fn())
const mockDeleteAIProvider = vi.hoisted(() => vi.fn())
const mockTestAIProvider = vi.hoisted(() => vi.fn())

vi.mock('../api/aiProviders', () => ({
  listAIProviders: mockListAIProviders,
  createAIProvider: mockCreateAIProvider,
  updateAIProvider: mockUpdateAIProvider,
  deleteAIProvider: mockDeleteAIProvider,
  testAIProvider: mockTestAIProvider,
}))

// --- Import component after mocks ---

import AIProviderSettings from './AIProviderSettings.vue'

// --- Fixtures ---

const sampleProviders = [
  {
    id: 'p1',
    provider_type: 'openai',
    display_name: 'OpenAI Production',
    base_url: 'https://api.openai.com/v1',
    enabled: true,
    models_override: [
      { id: 'm1', name: 'gpt-4' },
      { id: 'm2', name: 'gpt-3.5' },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p2',
    provider_type: 'ollama',
    display_name: 'Local Ollama',
    base_url: 'http://localhost:11434/v1',
    enabled: false,
    models_override: [],
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
]

// --- Helpers ---

const defaultProps = { orgId: 'org-1', isAdmin: true }

function createWrapper(props = defaultProps) {
  return mount(AIProviderSettings, { props })
}

describe('AIProviderSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListAIProviders.mockResolvedValue([])
  })

  // 1. Renders empty state when no providers
  describe('empty state', () => {
    it('renders empty message when no providers are returned', async () => {
      mockListAIProviders.mockResolvedValue([])
      const wrapper = createWrapper()
      await flushPromises()

      expect(wrapper.text()).toContain('No providers configured')
      expect(wrapper.text()).toContain('Add one to enable AI chat for your team')
    })
  })

  // 2. Renders provider list with correct data
  describe('provider list', () => {
    it('renders provider rows with display name, truncated URL, model count, and enabled badge', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      // display names
      expect(wrapper.text()).toContain('OpenAI Production')
      expect(wrapper.text()).toContain('Local Ollama')

      // base_url (first provider URL is 28 chars, should appear fully)
      expect(wrapper.text()).toContain('https://api.openai.com/v1')

      // model count badges
      expect(wrapper.text()).toContain('2 models')
      expect(wrapper.text()).toContain('0 models')

      // enabled/disabled badges
      const listItems = wrapper.findAll('[role="listitem"]')
      expect(listItems).toHaveLength(2)

      const firstRow = listItems[0]
      expect(firstRow.text()).toContain('Enabled')
      const secondRow = listItems[1]
      expect(secondRow.text()).toContain('Disabled')
    })

    it('truncates base_url longer than 40 characters', async () => {
      const longUrlProvider = {
        ...sampleProviders[0],
        base_url: 'https://very-long-hostname.example.com/some/deep/nested/path/v1',
      }
      mockListAIProviders.mockResolvedValue([longUrlProvider])
      const wrapper = createWrapper()
      await flushPromises()

      // Should be truncated with ellipsis
      const listItem = wrapper.find('[role="listitem"]')
      const urlText = listItem.text()
      // The full URL should NOT appear, a truncated version should
      expect(urlText).not.toContain(
        'https://very-long-hostname.example.com/some/deep/nested/path/v1',
      )
      expect(urlText).toContain('...')
    })
  })

  // 3. Add button visible for admin, hidden for non-admin
  describe('add button visibility', () => {
    it('shows add button when isAdmin is true', async () => {
      mockListAIProviders.mockResolvedValue([])
      const wrapper = createWrapper({ orgId: 'org-1', isAdmin: true })
      await flushPromises()

      const addBtn = wrapper.find('[data-testid="add-provider-btn"]')
      expect(addBtn.exists()).toBe(true)
    })

    it('hides add button when isAdmin is false', async () => {
      mockListAIProviders.mockResolvedValue([])
      const wrapper = createWrapper({ orgId: 'org-1', isAdmin: false })
      await flushPromises()

      const addBtn = wrapper.find('[data-testid="add-provider-btn"]')
      expect(addBtn.exists()).toBe(false)
    })
  })

  // 4. Shows add form when button clicked
  describe('add form', () => {
    it('shows the add form when add button is clicked', async () => {
      mockListAIProviders.mockResolvedValue([])
      const wrapper = createWrapper()
      await flushPromises()

      // Form should not be visible initially
      expect(wrapper.find('[data-testid="provider-form"]').exists()).toBe(false)

      // Click add button
      await wrapper.find('[data-testid="add-provider-btn"]').trigger('click')

      // Form should now be visible
      const form = wrapper.find('[data-testid="provider-form"]')
      expect(form.exists()).toBe(true)

      // Form should have the required fields
      expect(form.find('select').exists()).toBe(true)
      expect(form.findAll('input').length).toBeGreaterThanOrEqual(3) // display_name, base_url, api_key
    })

    it('pre-fills base_url hint when provider_type is selected', async () => {
      mockListAIProviders.mockResolvedValue([])
      const wrapper = createWrapper()
      await flushPromises()

      await wrapper.find('[data-testid="add-provider-btn"]').trigger('click')

      const select = wrapper.find('select')

      // Select openai
      await select.setValue('openai')
      let baseUrlInput = wrapper.find('[data-testid="form-base-url"]')
      expect((baseUrlInput.element as HTMLInputElement).value).toBe('https://api.openai.com/v1')

      // Select openrouter
      await select.setValue('openrouter')
      baseUrlInput = wrapper.find('[data-testid="form-base-url"]')
      expect((baseUrlInput.element as HTMLInputElement).value).toBe('https://openrouter.ai/api/v1')

      // Select ollama
      await select.setValue('ollama')
      baseUrlInput = wrapper.find('[data-testid="form-base-url"]')
      expect((baseUrlInput.element as HTMLInputElement).value).toBe('http://localhost:11434/v1')
    })

    it('submits the form and calls createAIProvider', async () => {
      const newProvider = {
        id: 'p3',
        provider_type: 'openai',
        display_name: 'New Provider',
        base_url: 'https://api.openai.com/v1',
        enabled: true,
        models_override: [],
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      }
      mockListAIProviders.mockResolvedValue([])
      mockCreateAIProvider.mockResolvedValue(newProvider)
      const wrapper = createWrapper()
      await flushPromises()

      // Open form
      await wrapper.find('[data-testid="add-provider-btn"]').trigger('click')

      // Fill the form
      await wrapper.find('select').setValue('openai')
      await wrapper.find('[data-testid="form-display-name"]').setValue('New Provider')
      await wrapper.find('[data-testid="form-api-key"]').setValue('sk-test-123')

      // Re-mock list to return the new provider after creation
      mockListAIProviders.mockResolvedValue([newProvider])

      // Submit
      await wrapper.find('[data-testid="provider-form"]').trigger('submit')
      await flushPromises()

      expect(mockCreateAIProvider).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          provider_type: 'openai',
          display_name: 'New Provider',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-test-123',
          enabled: true,
        }),
      )
    })
  })

  // 5. Test connection shows spinner then result
  describe('test connection', () => {
    it('shows spinner while testing, then shows success result', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      let resolveTest: (value: { success: boolean; models_count: number }) => void
      mockTestAIProvider.mockReturnValue(
        new Promise((resolve) => {
          resolveTest = resolve
        }),
      )
      const wrapper = createWrapper()
      await flushPromises()

      // Open the overflow menu for the first provider
      const menuButtons = wrapper.findAll('[data-testid="provider-menu-btn"]')
      await menuButtons[0].trigger('click')

      // Click Test button
      const testBtn = wrapper.find('[data-testid="test-provider-p1"]')
      expect(testBtn.exists()).toBe(true)
      await testBtn.trigger('click')
      await flushPromises()

      // Spinner should be visible
      expect(wrapper.find('[data-testid="test-spinner"]').exists()).toBe(true)

      // Resolve the test
      resolveTest!({ success: true, models_count: 5 })
      await flushPromises()

      // Spinner should be gone, result should show
      expect(wrapper.find('[data-testid="test-spinner"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Connected, 5 models found')
    })

    it('shows failure message when test fails', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      mockTestAIProvider.mockResolvedValue({ success: false, error: 'Invalid API key' })
      const wrapper = createWrapper()
      await flushPromises()

      // Open overflow menu
      const menuButtons = wrapper.findAll('[data-testid="provider-menu-btn"]')
      await menuButtons[0].trigger('click')

      // Click test
      await wrapper.find('[data-testid="test-provider-p1"]').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Connection failed: Invalid API key')
    })
  })

  // 6. Delete shows confirmation
  describe('delete', () => {
    it('shows confirmation dialog when delete is clicked', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      // Should not show confirm dialog initially
      expect(wrapper.find('[data-testid="delete-confirm"]').exists()).toBe(false)

      // Open overflow menu
      const menuButtons = wrapper.findAll('[data-testid="provider-menu-btn"]')
      await menuButtons[0].trigger('click')

      // Click delete
      await wrapper.find('[data-testid="delete-provider-p1"]').trigger('click')

      // Confirm dialog should appear
      expect(wrapper.find('[data-testid="delete-confirm"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('OpenAI Production')
    })

    it('calls deleteAIProvider when confirmed', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      mockDeleteAIProvider.mockResolvedValue(undefined)
      const wrapper = createWrapper()
      await flushPromises()

      // Open overflow menu and click delete
      const menuButtons = wrapper.findAll('[data-testid="provider-menu-btn"]')
      await menuButtons[0].trigger('click')
      await wrapper.find('[data-testid="delete-provider-p1"]').trigger('click')

      // Re-mock to return only the second provider after deletion
      mockListAIProviders.mockResolvedValue([sampleProviders[1]])

      // Confirm deletion
      await wrapper.find('[data-testid="delete-confirm-yes"]').trigger('click')
      await flushPromises()

      expect(mockDeleteAIProvider).toHaveBeenCalledWith('org-1', 'p1')
    })

    it('cancels deletion when cancel is clicked', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      // Open overflow menu and click delete
      const menuButtons = wrapper.findAll('[data-testid="provider-menu-btn"]')
      await menuButtons[0].trigger('click')
      await wrapper.find('[data-testid="delete-provider-p1"]').trigger('click')

      // Cancel
      await wrapper.find('[data-testid="delete-confirm-no"]').trigger('click')

      // Confirm dialog should be gone
      expect(wrapper.find('[data-testid="delete-confirm"]').exists()).toBe(false)
      expect(mockDeleteAIProvider).not.toHaveBeenCalled()
    })
  })

  // 7. Accessibility
  describe('accessibility', () => {
    it('uses role="list" for the provider list', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      expect(wrapper.find('[role="list"]').exists()).toBe(true)
    })

    it('uses role="listitem" for each provider row', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      const items = wrapper.findAll('[role="listitem"]')
      expect(items).toHaveLength(2)
    })

    it('has aria-label on test button with provider name', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      // Open overflow menu for first provider
      const menuButtons = wrapper.findAll('[data-testid="provider-menu-btn"]')
      await menuButtons[0].trigger('click')

      const testBtn = wrapper.find('[data-testid="test-provider-p1"]')
      expect(testBtn.attributes('aria-label')).toBe('Test connection for OpenAI Production')
    })

    it('has aria-label on enabled/disabled badges', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      const listItems = wrapper.findAll('[role="listitem"]')

      const enabledBadge = listItems[0].find('[data-testid="status-badge"]')
      expect(enabledBadge.attributes('aria-label')).toBe('Provider is enabled')

      const disabledBadge = listItems[1].find('[data-testid="status-badge"]')
      expect(disabledBadge.attributes('aria-label')).toBe('Provider is disabled')
    })
  })

  // Additional: emits provider-count event for parent integration
  describe('provider count exposure', () => {
    it('emits provider-count with the number of providers after loading', async () => {
      mockListAIProviders.mockResolvedValue(sampleProviders)
      const wrapper = createWrapper()
      await flushPromises()

      expect(wrapper.emitted('provider-count')).toBeTruthy()
      expect(wrapper.emitted('provider-count')![0]).toEqual([2])
    })

    it('emits provider-count of 0 when no providers', async () => {
      mockListAIProviders.mockResolvedValue([])
      const wrapper = createWrapper()
      await flushPromises()

      expect(wrapper.emitted('provider-count')).toBeTruthy()
      expect(wrapper.emitted('provider-count')![0]).toEqual([0])
    })
  })
})
