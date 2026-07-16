import { connect, disconnect } from 'echarts/core'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

const CrosshairSyncContext = createContext<string | null>(null)

type CrosshairSyncProviderProps = {
  dashboardId: string
  children: ReactNode
}

export function CrosshairSyncProvider({ dashboardId, children }: CrosshairSyncProviderProps) {
  const groupId = useMemo(() => `dashboard-${dashboardId}`, [dashboardId])

  useEffect(() => {
    connect(groupId)
    return () => {
      disconnect(groupId)
    }
  }, [groupId])

  return <CrosshairSyncContext.Provider value={groupId}>{children}</CrosshairSyncContext.Provider>
}

export function useCrosshairSync(): { groupId: string | null } {
  const groupId = useContext(CrosshairSyncContext)
  return { groupId }
}