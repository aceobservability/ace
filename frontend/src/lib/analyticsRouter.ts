import type { RouterState } from 'react-router'
import type { AnalyticsRoute, AnalyticsRouter } from '@/analytics'

type SubscribableRouter = {
  subscribe: (fn: (state: RouterState) => void) => () => void
}

export function createAnalyticsRouterAdapter(router: SubscribableRouter): AnalyticsRouter {
  return {
    afterEach(callback: (to: AnalyticsRoute) => void) {
      let lastPath: string | null = null
      return router.subscribe((state: RouterState) => {
        if (state.navigation.state !== 'idle') {
          return
        }

        const fullPath = `${state.location.pathname}${state.location.search}${state.location.hash}`
        if (fullPath === lastPath) {
          return
        }
        lastPath = fullPath

        const leaf = state.matches.at(-1)
        callback({
          fullPath,
          name: typeof leaf?.route.id === 'string' ? leaf.route.id : undefined,
        })
      })
    },
  }
}