import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiSidebar } from '@/components/AiSidebar'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'

const mockFetchProviders = vi.hoisted(() => vi.fn())
const mockFetchModels = vi.hoisted(() => vi.fn())
const mockGenerate = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useAIProvider', () => ({
  useAIProvider: () => ({
    chatMessages: [],
    models: [],
    selectedModel: '',
    selectedProviderId: '',
    fetchModels: mockFetchModels,
    fetchProviders: mockFetchProviders,
    providers: [],
    setSelectedModel: vi.fn(),
    appendChatMessage: vi.fn(),
  }),
}))

vi.mock('@/hooks/useDashboardGeneration', () => ({
  useDashboardGeneration: () => ({
    generate: mockGenerate,
    toolStatuses: [],
    isGenerating: false,
    error: null,
    cancel: vi.fn(),
  }),
}))

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: { id: 'org-1', name: 'Test' },
    currentOrgId: 'org-1',
  }),
}))

vi.mock('@/hooks/useCommandContext', () => ({
  useCommandContext: () => ({
    currentContext: null,
  }),
}))

vi.mock('@/utils/markdown', () => ({
  initMarkdown: vi.fn().mockResolvedValue(undefined),
  renderMarkdown: vi.fn().mockResolvedValue('<p>hi</p>'),
}))

describe('AiSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchProviders.mockResolvedValue(undefined)
    mockFetchModels.mockResolvedValue(undefined)
    useAiSidebarStore.setState({
      isOpen: false,
      pendingContext: null,
      highlightedPanelId: null,
    })
  })

  it('does not render when closed', () => {
    render(<AiSidebar />)
    expect(screen.queryByTestId('ai-sidebar')).toBeNull()
  })

  it('renders empty-provider state when open with no providers', async () => {
    useAiSidebarStore.setState({ isOpen: true })
    render(<AiSidebar />)
    expect(await screen.findByTestId('ai-sidebar')).toBeTruthy()
    expect(screen.getByText(/No AI provider configured/i)).toBeTruthy()
  })

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup()
    useAiSidebarStore.setState({ isOpen: true })
    render(<AiSidebar />)
    await user.click(screen.getByTestId('ai-sidebar-close'))
    expect(useAiSidebarStore.getState().isOpen).toBe(false)
  })
})
