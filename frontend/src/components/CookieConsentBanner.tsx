import { useNavigate } from 'react-router'
import { useAnalytics } from '@/hooks/useAnalytics'

export function CookieConsentBanner() {
  const navigate = useNavigate()
  const { consent, dntEnabled, setAnalyticsConsent, trackEvent } = useAnalytics()

  const visible = consent === 'pending' && !dntEnabled
  if (!visible) return null

  function acceptAnalytics() {
    setAnalyticsConsent('granted')
    trackEvent('analytics_consent_updated', {
      consent: 'granted',
      source: 'cookie_banner',
    })
  }

  function declineAnalytics() {
    setAnalyticsConsent('denied')
  }

  function openPrivacySettings() {
    navigate('/app/settings/general')
  }

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-center gap-4 rounded px-6 py-4 shadow-lg max-md:flex-col max-md:items-stretch"
      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      data-testid="cookie-consent-banner"
    >
      <div className="min-w-0">
        <strong className="block text-sm" style={{ color: 'var(--color-on-surface)' }}>
          Analytics preferences
        </strong>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Ace can use privacy-focused analytics and optional session recording to improve product
          quality.
        </p>
      </div>
      <div className="inline-flex flex-wrap items-center justify-end gap-2 max-md:justify-start">
        <button
          type="button"
          className="rounded-sm px-4 py-2 text-sm underline transition"
          style={{ color: 'var(--color-primary)' }}
          data-testid="cookie-privacy-settings-btn"
          onClick={openPrivacySettings}
        >
          Privacy settings
        </button>
        <button
          type="button"
          className="rounded-sm px-4 py-2 text-sm font-medium transition"
          style={{ color: 'var(--color-outline)' }}
          data-testid="cookie-decline-btn"
          onClick={declineAnalytics}
        >
          Decline
        </button>
        <button
          type="button"
          className="rounded-sm px-4 py-2 text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--color-primary)' }}
          data-testid="cookie-accept-btn"
          onClick={acceptAnalytics}
        >
          Allow analytics
        </button>
      </div>
    </div>
  )
}
