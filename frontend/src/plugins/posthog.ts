import type { App, Plugin } from 'vue'
import type { Router } from 'vue-router'
import { initializeAnalytics } from '../analytics'

export function createPostHogPlugin(router: Router): Plugin {
  return {
    install(_app: App) {
      void initializeAnalytics(router)
    },
  }
}
