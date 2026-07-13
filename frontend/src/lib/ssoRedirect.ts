import { safeRedirectPath } from '@/lib/safeRedirect'

const SSO_REDIRECT_KEY = 'sso_redirect'

export function storeSsoRedirect(path: string | null | undefined): void {
  const safe = safeRedirectPath(path)
  if (safe) {
    sessionStorage.setItem(SSO_REDIRECT_KEY, safe)
  } else {
    sessionStorage.removeItem(SSO_REDIRECT_KEY)
  }
}

export function consumeSsoRedirect(): string | null {
  const stored = sessionStorage.getItem(SSO_REDIRECT_KEY)
  sessionStorage.removeItem(SSO_REDIRECT_KEY)
  return safeRedirectPath(stored)
}