import { useCallback } from 'react'
import {
  type CommandContext,
  useCommandContextStore,
} from '@/stores/commandContextStore'

export type { CommandContext }

/** Register/deregister page-level context for Cmd+K and the AI sidebar. */
export function useCommandContext() {
  const currentContext = useCommandContextStore(state => state.currentContext)
  const register = useCommandContextStore(state => state.registerContext)
  const deregister = useCommandContextStore(state => state.deregisterContext)

  const registerContext = useCallback(
    (ctx: CommandContext) => {
      register(ctx)
    },
    [register],
  )

  const deregisterContext = useCallback(() => {
    deregister()
  }, [deregister])

  return {
    currentContext,
    registerContext,
    deregisterContext,
  }
}
