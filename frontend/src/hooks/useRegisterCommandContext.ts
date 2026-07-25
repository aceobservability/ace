import { useEffect } from 'react'
import {
  type CommandContext,
  useCommandContext,
} from '@/hooks/useCommandContext'

/** Register page-level Cmd+K / AI sidebar context for the lifetime of the page. */
export function useRegisterCommandContext(ctx: CommandContext) {
  const { registerContext, deregisterContext } = useCommandContext()

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
