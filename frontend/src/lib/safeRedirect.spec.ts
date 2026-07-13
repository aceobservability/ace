import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from '@/lib/safeRedirect'

describe('safeRedirectPath', () => {
  it('accepts same-origin relative paths', () => {
    expect(safeRedirectPath('/app/dashboards')).toBe('/app/dashboards')
  })

  it('rejects protocol-relative and external paths', () => {
    expect(safeRedirectPath('//evil.com')).toBeNull()
    expect(safeRedirectPath('https://evil.com')).toBeNull()
    expect(safeRedirectPath('/app\\evil')).toBeNull()
  })
})