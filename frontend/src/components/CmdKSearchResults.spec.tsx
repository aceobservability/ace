import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmdKSearchResults } from '@/components/CmdKSearchResults'

const mockListDashboards = vi.hoisted(() => vi.fn())

vi.mock('@/api/dashboards', () => ({
  listDashboards: (...args: unknown[]) => mockListDashboards(...args),
}))

vi.mock('@/hooks/useAIProvider', () => ({
  useAIProvider: () => ({
    providers: [{ id: 'p1', display_name: 'OpenAI' }],
  }),
}))

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: 'org-1',
  }),
}))

describe('CmdKSearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListDashboards.mockResolvedValue([
      { id: 'd1', title: 'Latency', description: 'API latency' },
      { id: 'd2', title: 'Errors', description: 'Error rates' },
    ])
  })

  it('lists dashboards and navigates on click', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <CmdKSearchResults query="" onNavigate={onNavigate} onEnterChat={vi.fn()} />,
    )
    expect(await screen.findByTestId('search-result-d1')).toBeTruthy()
    await user.click(screen.getByTestId('search-result-d1'))
    expect(onNavigate).toHaveBeenCalledWith('/app/dashboards/d1')
  })

  it('filters dashboards by query', async () => {
    render(
      <CmdKSearchResults query="error" onNavigate={vi.fn()} onEnterChat={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.queryByTestId('search-result-d1')).toBeNull()
      expect(screen.getByTestId('search-result-d2')).toBeTruthy()
    })
  })

  it('shows Ask Copilot when query is non-empty and providers exist', async () => {
    const user = userEvent.setup()
    const onEnterChat = vi.fn()
    render(
      <CmdKSearchResults query="cpu" onNavigate={vi.fn()} onEnterChat={onEnterChat} />,
    )
    const ask = await screen.findByTestId('ask-copilot-option')
    await user.click(ask)
    expect(onEnterChat).toHaveBeenCalledWith('cpu')
  })
})
