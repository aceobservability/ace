import {
  type CommandContext,
  useCommandContextStore,
} from '@/stores/commandContextStore'

export type { CommandContext }

/** Read the current page-level command context (Cmd+K / AI sidebar). */
export function useCommandContext() {
  return useCommandContextStore(state => state.currentContext)
}
