import { describe, expect, it } from 'vitest'
import { API_BASE } from './base'

describe('API base', () => {
  it('is always same-origin relative', () => {
    expect(API_BASE).toBe('')
  })
})
