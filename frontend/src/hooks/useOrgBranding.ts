import { useEffect } from 'react'
import type { OrgBranding } from '@/types/organization'
import { useOrganization } from '@/hooks/useOrganization'

function applyBranding(branding: OrgBranding | undefined) {
  const root = document.documentElement
  const primaryColor = branding?.primary_color
  if (primaryColor) {
    root.style.setProperty('--color-accent', primaryColor)
    const r = Number.parseInt(primaryColor.slice(1, 3), 16)
    const g = Number.parseInt(primaryColor.slice(3, 5), 16)
    const b = Number.parseInt(primaryColor.slice(5, 7), 16)
    root.style.setProperty('--color-accent-muted', `rgba(${r},${g},${b},0.15)`)
    root.style.setProperty('--color-accent-border', `rgba(${r},${g},${b},0.25)`)
    root.style.setProperty('--color-accent-hover', `color-mix(in srgb, ${primaryColor} 85%, black)`)
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
    applyBranding(currentOrg?.branding)
  }, [currentOrg?.branding])
}