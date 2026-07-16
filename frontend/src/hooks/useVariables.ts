import { useCallback, useMemo, useState } from 'react'
import { listVariables, type Variable } from '@/api/variables'

export interface DashboardVariable extends Variable {
  /** Runtime state: available option values (not returned by the variables API). */
  options: string[]
  /** Runtime state: currently selected value(s) (not persisted). */
  current: string | string[]
}

export function useVariables(dashboardId: string | undefined) {
  const [variables, setVariables] = useState<DashboardVariable[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchVariables = useCallback(async () => {
    if (!dashboardId) return
    setLoading(true)
    setError(null)
    try {
      const data = await listVariables(dashboardId)
      // Options are runtime-only — the variables API does not return them
      // (no options column on dashboard_variables). Query/custom option
      // fetching is deferred beyond this viewing-core port; initialize empty
      // so VariableBar can show the "no options loaded" warning until then.
      setVariables(
        data.map(variable => ({
          ...variable,
          options: [],
          current: variable.multi ? [] : '',
        })),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load variables')
    } finally {
      setLoading(false)
    }
  }, [dashboardId])

  const setVariableValue = useCallback((name: string, value: string | string[]) => {
    setVariables(current =>
      current.map(variable => (variable.name === name ? { ...variable, current: value } : variable)),
    )
  }, [])

  const interpolate = useCallback(
    (query: string): string => {
      if (!query) return query
      let result = query
      for (const variable of variables) {
        const value = Array.isArray(variable.current) ? variable.current.join('|') : (variable.current ?? '')
        result = result.replace(new RegExp(`\\$\\{${variable.name}\\}`, 'g'), value)
        result = result.replace(new RegExp(`\\$${variable.name}(?![\\w])`, 'g'), value)
      }
      return result
    },
    [variables],
  )

  const hasVariables = useMemo(() => variables.length > 0, [variables.length])

  return {
    variables,
    loading,
    error,
    hasVariables,
    fetchVariables,
    setVariableValue,
    interpolate,
  }
}