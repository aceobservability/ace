import { watch } from 'vue'
import { useOrganization } from './useOrganization'

export function useOrgBranding() {
  const { currentOrg } = useOrganization()

  function applyBranding(org: typeof currentOrg.value) {
    const root = document.documentElement
    if (org?.branding?.primary_color) {
      root.style.setProperty('--color-accent', org.branding.primary_color)
      const hex = org.branding.primary_color
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      root.style.setProperty('--color-accent-muted', `rgba(${r},${g},${b},0.15)`)
    } else {
      root.style.removeProperty('--color-accent')
      root.style.removeProperty('--color-accent-muted')
    }
  }

  watch(currentOrg, (org) => applyBranding(org), { immediate: true })

  return { applyBranding }
}
