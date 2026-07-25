import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmdKModal } from '@/components/CmdKModal'
import { useCommandContextStore } from '@/stores/commandContextStore'

const mockFetchProviders = vi.hoisted(() => vi.fn())
const mockProviders = vi.hoisted(() => [] as Array<{ id: string; display_name: string }>)

vi.mock('@/hooks/useAIProvider', () => ({
  useAIProvider: () => ({
    providers: mockProviders,
    fetchProviders: mockFetchProviders,
  }),
}))

vi.mock('@/components/CmdKSearchResults', () => ({
  CmdKSearchResults: ({
    onEnterChat,
  }: {
    onEnterChat: (q: string) => void
  }) => (
    <div data-testid="search-results">
      <button type="button" data-testid="enter-chat" onClick={() => onEnterChat('hello')}>
        chat
      </button>
    </div>
  ),
}))

vi.mock('@/components/CmdKChatView', () => ({
  CmdKChatView: () => <div data-testid="chat-view" />,
}))

function renderModal(isOpen: boolean, onClose = vi.fn()) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <CmdKModal isOpen={isOpen} onClose={onClose} />,
      },
    ],
    { initialEntries: ['/'] },
  )
  return {
    onClose,
    ...render(<RouterProvider router={router} />),
  }
}

describe('CmdKModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProviders.length = 0
    mockFetchProviders.mockResolvedValue(undefined)
    useCommandContextStore.setState({
      currentContext: { viewName: 'Home', viewRoute: '/app', description: 'home' },
    })
  })

  it('does not show modal content when closed', () => {
    renderModal(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders dialog with accessibility attrs when open', () => {
    renderModal(true)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('AI Command')
  })

  it('shows context pill from command context', () => {
    renderModal(true)
    expect(screen.getByTestId('context-pill').textContent).toContain('Home')
  })

  it('closes when scrim is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal(true)
    await user.click(screen.getByTestId('cmdk-scrim'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows not-connected message when entering chat without providers', async () => {
    const user = userEvent.setup()
    renderModal(true)
    await user.click(screen.getByTestId('enter-chat'))
    expect(screen.getByTestId('not-connected-message')).toBeTruthy()
  })

  it('enters chat mode when providers exist', async () => {
    const user = userEvent.setup()
    mockProviders.push({ id: 'p1', display_name: 'OpenAI' })
    renderModal(true)
    await user.click(screen.getByTestId('enter-chat'))
    expect(screen.getByTestId('chat-view')).toBeTruthy()
  })
})
