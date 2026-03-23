import { ref } from 'vue'
import type { Ref } from 'vue'

export interface CommandContext {
  viewName: string
  viewRoute: string
  description: string
  datasourceId?: string
  datasourceType?: string
  datasourceName?: string
  dashboardId?: string
}

const currentContext: Ref<CommandContext | null> = ref(null)

function registerContext(ctx: CommandContext): void {
  currentContext.value = ctx
}

function deregisterContext(): void {
  currentContext.value = null
}

export function useCommandContext() {
  return {
    currentContext,
    registerContext,
    deregisterContext,
  }
}
