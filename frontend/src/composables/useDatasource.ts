import { ref, computed } from 'vue'
import type { DataSource, CreateDataSourceRequest, UpdateDataSourceRequest } from '../types/datasource'
import {
  listDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
} from '../api/datasources'

const datasources = ref<DataSource[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

export function useDatasource() {
  async function fetchDatasources(orgId: string) {
    loading.value = true
    error.value = null
    try {
      datasources.value = await listDataSources(orgId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch datasources'
    } finally {
      loading.value = false
    }
  }

  async function addDatasource(orgId: string, data: CreateDataSourceRequest) {
    loading.value = true
    error.value = null
    try {
      const ds = await createDataSource(orgId, data)
      datasources.value.push(ds)
      return ds
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create datasource'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function editDatasource(id: string, data: UpdateDataSourceRequest) {
    loading.value = true
    error.value = null
    try {
      const updated = await updateDataSource(id, data)
      const idx = datasources.value.findIndex((d) => d.id === id)
      if (idx !== -1) {
        datasources.value[idx] = updated
      }
      return updated
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update datasource'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function removeDatasource(id: string) {
    loading.value = true
    error.value = null
    try {
      await deleteDataSource(id)
      datasources.value = datasources.value.filter((d) => d.id !== id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete datasource'
      throw e
    } finally {
      loading.value = false
    }
  }

  const metricsDatasources = computed(() =>
    datasources.value.filter(
      (d) => d.type === 'prometheus' || d.type === 'victoriametrics' || d.type === 'clickhouse' || d.type === 'cloudwatch' || d.type === 'elasticsearch',
    ),
  )

  const logsDatasources = computed(() =>
    datasources.value.filter(
      (d) => d.type === 'loki' || d.type === 'victorialogs' || d.type === 'clickhouse' || d.type === 'cloudwatch' || d.type === 'elasticsearch',
    ),
  )

  const tracingDatasources = computed(() =>
    datasources.value.filter(
      (d) => d.type === 'tempo' || d.type === 'victoriatraces' || d.type === 'clickhouse',
    ),
  )

  const vmalertDatasources = computed(() =>
    datasources.value.filter((d) => d.type === 'vmalert'),
  )

  const alertingDatasources = computed(() =>
    datasources.value.filter((d) => d.type === 'vmalert' || d.type === 'alertmanager'),
  )

  return {
    datasources,
    loading,
    error,
    metricsDatasources,
    logsDatasources,
    tracingDatasources,
    vmalertDatasources,
    alertingDatasources,
    fetchDatasources,
    addDatasource,
    editDatasource,
    removeDatasource,
  }
}
