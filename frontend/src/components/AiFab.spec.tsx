import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { AiFab } from '@/components/AiFab'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'

describe('AiFab', () => {
  beforeEach(() => {
    useAiSidebarStore.setState({
      isOpen: false,
      pendingContext: null,
      highlightedPanelId: null,
    })
  })

  it('renders when sidebar is closed and opens on click', async () => {
    const user = userEvent.setup()
    render(<AiFab />)
    const fab = screen.getByTestId('ai-fab')
    await user.click(fab)
    expect(useAiSidebarStore.getState().isOpen).toBe(true)
  })

  it('hides when sidebar is open', () => {
    useAiSidebarStore.setState({ isOpen: true })
    render(<AiFab />)
    expect(screen.queryByTestId('ai-fab')).toBeNull()
  })
})
