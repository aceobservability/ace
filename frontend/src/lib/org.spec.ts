import { describe, expect, it } from 'vitest'
import { isValidOrgId, resolveCurrentOrg } from '@/lib/org'

describe('org helpers', () => {
  const organizations = [
    { id: 'org-1', name: 'A', slug: 'a', created_at: '', updated_at: '' },
    { id: 'org-2', name: 'B', slug: 'b', created_at: '', updated_at: '' },
  ]

  it('resolves the stored org when valid', () => {
    expect(resolveCurrentOrg(organizations, 'org-2')?.id).toBe('org-2')
  })

  it('falls back to the first org when stored id is invalid', () => {
    expect(resolveCurrentOrg(organizations, 'missing')?.id).toBe('org-1')
  })

  it('validates org membership before selection', () => {
    expect(isValidOrgId(organizations, 'org-2')).toBe(true)
    expect(isValidOrgId(organizations, 'missing')).toBe(false)
  })
})