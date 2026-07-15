import { createContext, useContext, type ReactNode } from 'react'
import { type DashboardVariable, useVariables } from '@/hooks/useVariables'

type VariablesContextValue = {
  variables: DashboardVariable[]
  hasVariables: boolean
  loading: boolean
  error: string | null
  fetchVariables: () => Promise<void>
  setVariableValue: (name: string, value: string | string[]) => void
  interpolate: (query: string) => string
}

const VariablesContext = createContext<VariablesContextValue | null>(null)

type VariablesProviderProps = {
  dashboardId: string | undefined
  children: ReactNode
}

export function VariablesProvider({ dashboardId, children }: VariablesProviderProps) {
  const value = useVariables(dashboardId)
  return <VariablesContext.Provider value={value}>{children}</VariablesContext.Provider>
}

export function useDashboardVariables(): VariablesContextValue {
  const context = useContext(VariablesContext)
  if (!context) {
    throw new Error('useDashboardVariables must be used within VariablesProvider')
  }
  return context
}