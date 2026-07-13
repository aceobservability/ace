import { listDataSources } from '@/api/datasources'
import type { DataSource } from '@/types/datasource'
import { create } from 'zustand'

type DatasourceState = {
  datasources: DataSource[]
  loading: boolean
  error: string | null
  fetchDatasources: (orgId: string) => Promise<void>
  clear: () => void
}

export const useDatasourceStore = create<DatasourceState>(set => ({
  datasources: [],
  loading: false,
  error: null,

  async fetchDatasources(orgId) {
    set({ loading: true, error: null })
    try {
      const datasources = await listDataSources(orgId)
      set({ datasources, loading: false })
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to fetch datasources',
        loading: false,
      })
    }
  },

  clear() {
    set({ datasources: [], loading: false, error: null })
  },
}))