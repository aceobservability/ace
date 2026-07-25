import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieConsentBanner } from '@/components/CookieConsentBanner'

const mockSetConsent = vi.hoisted(() => vi.fn())
const mockTrackEvent = vi.hoisted(() => vi.fn())
const mockState = vi.hoisted(() => ({
  consent: 'pending' as 'pending' | 'granted' | 'denied',
  dntEnabled: false,
}))

vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    consent: mockState.consent,
    dntEnabled: mockState.dntEnabled,
    setAnalyticsConsent: mockSetConsent,
    trackEvent: mockTrackEvent,
  }),
}))

function renderBanner() {
  const router = createMemoryRouter(
    [{ path: '/', element: <CookieConsentBanner /> }],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.consent = 'pending'
    mockState.dntEnabled = false
  })

  it('renders when consent is pending and DNT is off', () => {
    renderBanner()
    expect(screen.getByTestId('cookie-consent-banner')).toBeTruthy()
  })

  it('hides when DNT is enabled', () => {
    mockState.dntEnabled = true
    renderBanner()
    expect(screen.queryByTestId('cookie-consent-banner')).toBeNull()
  })

  it('grants consent and tracks event on accept', async () => {
    const user = userEvent.setup()
    renderBanner()
    await user.click(screen.getByTestId('cookie-accept-btn'))
    expect(mockSetConsent).toHaveBeenCalledWith('granted')
    expect(mockTrackEvent).toHaveBeenCalledWith('analytics_consent_updated', {
      consent: 'granted',
      source: 'cookie_banner',
    })
  })

  it('denies consent on decline', async () => {
    const user = userEvent.setup()
    renderBanner()
    await user.click(screen.getByTestId('cookie-decline-btn'))
    expect(mockSetConsent).toHaveBeenCalledWith('denied')
  })
})
