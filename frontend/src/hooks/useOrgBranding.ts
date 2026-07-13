import { useEffect } from 'react'
import { useOrganization } from '@/hooks/useOrganization'

function applyBranding(org: ReturnType<typeof useOrganization>['currentOrg']) {
  const root = document.documentElement
  const branding =
    org && 'branding' in org
      ? (org as { branding?: { primary_color?: string | null } }).branding
      : undefined
  const primaryColor = branding?.primary_color
  if (primaryColor) {
    const hex = primaryColor
    root.style.setProperty('--color-accent', hex)
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    root.style.setProperty('--color-accent-muted', `rgba(${r},${g},${b},0.15)`)
    root.style.setProperty('--color-accent-border', `rgba(${r},${g},${b},0.25)`)
    root.style.setProperty('--color-accent-hover', `color-mix(in srgb, ${hex} 85%, black)`)
  } else {
    root.style.removeProperty('--color-accent')
    root.style.removeProperty('--color-accent-muted')
    root.style.removeProperty('--color-accent-border')
    root.style.removeProperty('--color-accent-hover')
  }
}

export function useOrgBranding() {
  const { currentOrg } = useOrganization()

  useEffect(() => {
    applyBranding(currentOrg)
  }, [currentOrg])
}