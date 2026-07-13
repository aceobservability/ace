import { beforeEach, describe, expect, it } from 'vitest'
import { useOrgStore } from '@/stores/orgStore'

describe('useOrgStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useOrgStore.setState({ currentOrgId: null })
  })

  it('keeps a valid stored org id after login', () => {
    localStorage.setItem('current_org_id', 'org-b')
    useOrgStore.getState().initializeFromMemberships([
      { id: 'org-a', name: 'A', slug: 'a', role: 'viewer' },
      { id: 'org-b', name: 'B', slug: 'b', role: 'admin' },
    ])

    expect(useOrgStore.getState().currentOrgId).toBe('org-b')
    expect(localStorage.getItem('current_org_id')).toBe('org-b')
  })

  it('falls back to the first membership when stored org is invalid', () => {
    localStorage.setItem('current_org_id', 'missing')
    useOrgStore.getState().initializeFromMemberships([
      { id: 'org-a', name: 'A', slug: 'a', role: 'viewer' },
      { id: 'org-b', name: 'B', slug: 'b', role: 'admin' },
    ])

    expect(useOrgStore.getState().currentOrgId).toBe('org-a')
  })
})