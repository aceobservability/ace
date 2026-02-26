<template>
  <div class="datasource-panel">
    <!-- Loading state -->
    <div v-if="loading" class="loading-state">
      <div v-for="i in 3" :key="i" class="skeleton-row" />
    </div>

    <!-- Empty state -->
    <div v-else-if="datasources.length === 0" class="empty-state">
      <Database :size="40" class="empty-icon" />
      <h3>No data sources configured</h3>
      <p>Add a data source to start visualising your metrics, logs, and traces.</p>
      <RouterLink :to="`/app/datasources/new?orgId=${orgId}`" class="btn-primary-sm">
        Add data source
      </RouterLink>
    </div>

    <!-- Datasource list -->
    <div v-else>
      <div class="datasource-list-header">
        <span class="datasource-count">{{ datasources.length }} data source{{ datasources.length !== 1 ? 's' : '' }}</span>
        <RouterLink :to="`/app/datasources/new?orgId=${orgId}`" class="btn-primary-sm">
          Add data source
        </RouterLink>
      </div>

      <div class="datasource-list">
        <div v-for="ds in datasources" :key="ds.id" class="datasource-card">
          <div class="datasource-info">
            <span class="datasource-type-badge">{{ dataSourceTypeLabels[ds.type] }}</span>
            <span class="datasource-name">{{ ds.name }}</span>
            <span class="datasource-url text-muted">{{ ds.url }}</span>
          </div>
          <div class="datasource-actions">
            <button @click="testDatasource(ds.id)" class="btn-sm" title="Test connection">
              <Zap :size="14" />
            </button>
            <RouterLink :to="`/app/datasources/${ds.id}/edit`" class="btn-sm" title="Edit">
              <Edit2 :size="14" />
            </RouterLink>
            <button @click="deleteDatasource(ds.id)" class="btn-sm btn-danger-sm" title="Delete">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Test result toast -->
    <div v-if="testResult" class="test-toast" :class="testResult.ok ? 'toast-success' : 'toast-error'">
      {{ testResult.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { Database, Edit2, Trash2, Zap } from 'lucide-vue-next'
import { listDataSources, deleteDataSource, testDataSourceConnection } from '../api/datasources'
import type { DataSource } from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'

const props = defineProps<{ orgId: string }>()

const datasources = ref<DataSource[]>([])
const loading = ref(true)
const testResult = ref<{ ok: boolean; message: string } | null>(null)

async function fetchDatasources() {
  loading.value = true
  try {
    datasources.value = await listDataSources(props.orgId)
  } catch {
    datasources.value = []
  } finally {
    loading.value = false
  }
}

async function deleteDatasource(id: string) {
  if (!confirm('Delete this data source?')) return
  await deleteDataSource(id)
  await fetchDatasources()
}

async function testDatasource(id: string) {
  testResult.value = null
  try {
    await testDataSourceConnection(id)
    testResult.value = { ok: true, message: 'Connection successful' }
  } catch {
    testResult.value = { ok: false, message: 'Connection failed' }
  }
  setTimeout(() => { testResult.value = null }, 3000)
}

watch(() => props.orgId, fetchDatasources)
onMounted(fetchDatasources)
</script>

<style scoped>
.datasource-panel {
  position: relative;
}

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-row {
  height: 56px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  gap: 0.75rem;
}

.empty-icon {
  color: var(--text-tertiary);
}

.empty-state h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.btn-primary-sm {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s;
}

.btn-primary-sm:hover {
  background: var(--accent-primary-hover);
}

.datasource-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.datasource-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.datasource-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.datasource-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  transition: border-color 0.2s;
}

.datasource-card:hover {
  border-color: rgba(56, 189, 248, 0.3);
}

.datasource-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  flex: 1;
}

.datasource-type-badge {
  display: inline-flex;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: rgba(56, 189, 248, 0.12);
  color: var(--accent-primary);
  border: 1px solid rgba(56, 189, 248, 0.25);
  white-space: nowrap;
}

.datasource-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.datasource-url {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.datasource-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.btn-sm:hover {
  background: var(--bg-hover);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}

.btn-danger-sm:hover {
  background: rgba(251, 113, 133, 0.15);
  border-color: rgba(251, 113, 133, 0.34);
  color: var(--accent-danger);
}

.test-toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  padding: 0.65rem 1.1rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  z-index: 1000;
  animation: toast-in 0.3s ease;
}

.toast-success {
  background: rgba(89, 161, 79, 0.18);
  border: 1px solid rgba(89, 161, 79, 0.4);
  color: #59a14f;
}

.toast-error {
  background: rgba(255, 107, 107, 0.14);
  border: 1px solid rgba(255, 107, 107, 0.35);
  color: var(--accent-danger);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.text-muted {
  color: var(--text-tertiary);
}
</style>
