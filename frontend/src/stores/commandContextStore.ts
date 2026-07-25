import { create } from 'zustand'

export type CommandContext = {
  viewName: string
  viewRoute: string
  description: string
  datasourceId?: string
  datasourceType?: string
  datasourceName?: string
  dashboardId?: string
}

type CommandContextState = {
  currentContext: CommandContext | null
  registerContext: (ctx: CommandContext) => void
  deregisterContext: () => void
}

export const useCommandContextStore = create<CommandContextState>(set => ({
  currentContext: null,

  registerContext(ctx) {
    set({ currentContext: ctx })
  },

  deregisterContext() {
    set({ currentContext: null })
  },
}))
