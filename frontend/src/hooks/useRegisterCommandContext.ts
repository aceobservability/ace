import { useEffect } from 'react'
import {
  type CommandContext,
  useCommandContextStore,
} from '@/stores/commandContextStore'

/** Register page-level Cmd+K / AI sidebar context for the lifetime of the page. */
export function useRegisterCommandContext(ctx: CommandContext) {
  const registerContext = useCommandContextStore(state => state.registerContext)
  const deregisterContext = useCommandContextStore(state => state.deregisterContext)

  // biome-ignore lint/correctness/useExhaustiveDependencies: key on stable context fields, not object identity
  useEffect(() => {
    registerContext(ctx)
    return () => {
      deregisterContext()
    }
  }, [
    ctx.viewName,
    ctx.viewRoute,
    ctx.description,
    ctx.datasourceId,
    ctx.datasourceType,
    ctx.datasourceName,
    ctx.dashboardId,
    registerContext,
    deregisterContext,
  ])
}
