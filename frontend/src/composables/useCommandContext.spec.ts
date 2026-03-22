import { afterEach, describe, expect, it } from 'vitest'
import { useCommandContext } from './useCommandContext'
import type { CommandContext } from './useCommandContext'

describe('useCommandContext', () => {
  afterEach(() => {
    const { deregisterContext } = useCommandContext()
    deregisterContext()
  })

  describe('currentContext', () => {
    it('is null by default', () => {
      const { currentContext } = useCommandContext()
      expect(currentContext.value).toBeNull()
    })

    it('is reactive', () => {
      const { currentContext, registerContext } = useCommandContext()
      expect(currentContext.value).toBeNull()

      const ctx: CommandContext = {
        viewName: 'Home',
        viewRoute: '/',
        description: 'Home view',
      }
      registerContext(ctx)

      expect(currentContext.value).toEqual(ctx)
    })
  })

  describe('registerContext', () => {
    it('sets current context', () => {
      const { currentContext, registerContext } = useCommandContext()

      const ctx: CommandContext = {
        viewName: 'Dashboard',
        viewRoute: '/dashboard/123',
        description: 'Dashboard detail view',
        dashboardId: '123',
      }
      registerContext(ctx)

      expect(currentContext.value).toEqual(ctx)
    })

    it('replaces previous context', () => {
      const { currentContext, registerContext } = useCommandContext()

      registerContext({
        viewName: 'Home',
        viewRoute: '/',
        description: 'Home view',
      })

      const newCtx: CommandContext = {
        viewName: 'Explore',
        viewRoute: '/explore',
        description: 'Explore view',
        datasourceId: 'ds-1',
      }
      registerContext(newCtx)

      expect(currentContext.value).toEqual(newCtx)
    })
  })

  describe('deregisterContext', () => {
    it('clears the current context', () => {
      const { currentContext, registerContext, deregisterContext } = useCommandContext()

      registerContext({
        viewName: 'Alerts',
        viewRoute: '/alerts',
        description: 'Alerts explorer',
      })
      expect(currentContext.value).not.toBeNull()

      deregisterContext()
      expect(currentContext.value).toBeNull()
    })
  })
})
