<script setup lang="ts">
import { ChevronLeft, ChevronRight, Download, Filter, Search } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { type AuditLogEntry, type AuditLogParams, exportAuditLog, listAuditLog } from '../api/audit'
import { useOrganization } from '../composables/useOrganization'

const { currentOrg } = useOrganization()

// State
const entries = ref<AuditLogEntry[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(50)
const loading = ref(false)
const error = ref<string | null>(null)
const exportError = ref<string | null>(null)

// Filters
const actorFilter = ref('')
const actionFilter = ref('')
const resourceTypeFilter = ref('')
const fromFilter = ref('')
const toFilter = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'permission.change', label: 'Permission Change' },
  { value: 'export', label: 'Export' },
  { value: 'invite', label: 'Invite' },
]

async function fetchEntries() {
  const orgId = currentOrg.value?.id
  if (!orgId) return

  loading.value = true
  error.value = null

  const params: AuditLogParams = {
    page: page.value,
    limit: limit.value,
  }
  if (actorFilter.value) params.actor = actorFilter.value
  if (actionFilter.value) params.action = actionFilter.value
  if (resourceTypeFilter.value) params.resource_type = resourceTypeFilter.value
  if (fromFilter.value) params.from = `${fromFilter.value}:00Z`
  if (toFilter.value) params.to = `${toFilter.value}:00Z`

  try {
    const result = await listAuditLog(orgId, params)
    entries.value = result.entries
    total.value = result.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch audit log'
    entries.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function handleExport(format: 'csv' | 'json') {
  const orgId = currentOrg.value?.id
  if (!orgId) return

  exportError.value = null
  try {
    const blob = await exportAuditLog(
      orgId,
      format,
      fromFilter.value ? `${fromFilter.value}:00Z` : undefined,
      toFilter.value ? `${toFilter.value}:00Z` : undefined,
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log.${format}`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : 'Export failed'
  }
}

function handleFilterChange() {
  page.value = 1
  fetchEntries()
}

function prevPage() {
  if (page.value > 1) {
    page.value -= 1
    fetchEntries()
  }
}

function nextPage() {
  if (page.value < totalPages.value) {
    page.value += 1
    fetchEntries()
  }
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function resourceLabel(entry: AuditLogEntry): string {
  const parts: string[] = []
  if (entry.resource_type) parts.push(entry.resource_type)
  if (entry.resource_name) parts.push(entry.resource_name)
  else if (entry.resource_id) parts.push(entry.resource_id)
  return parts.join(': ')
}

// Watch for org changes
watch(
  () => currentOrg.value?.id,
  (id) => {
    if (id) fetchEntries()
  },
)

onMounted(() => {
  fetchEntries()
})
</script>

<template>
  <div
    class="flex flex-col min-h-screen"
    :style="{ backgroundColor: 'var(--color-surface)', color: 'var(--color-on-surface)' }"
  >
    <!-- Page header -->
    <div
      class="flex items-center justify-between px-5 py-4 shrink-0"
      :style="{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'var(--color-surface-container-low)',
      }"
    >
      <h1
        data-testid="audit-log-heading"
        class="font-display text-xl font-semibold"
        :style="{ color: 'var(--color-on-surface)', letterSpacing: '-0.02em' }"
      >
        Audit Log
      </h1>

      <!-- Export button group -->
      <div class="flex items-center gap-2">
        <span
          v-if="exportError"
          class="text-xs"
          :style="{ color: 'var(--color-error)' }"
          data-testid="export-error"
        >
          {{ exportError }}
        </span>
        <button
          data-testid="export-csv-btn"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer border transition-colors"
          :style="{
            backgroundColor: 'transparent',
            color: 'var(--color-on-surface-variant)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderRadius: '4px',
          }"
          @click="handleExport('csv')"
        >
          <Download :size="14" />
          CSV
        </button>
        <button
          data-testid="export-json-btn"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer border transition-colors"
          :style="{
            backgroundColor: 'transparent',
            color: 'var(--color-on-surface-variant)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderRadius: '4px',
          }"
          @click="handleExport('json')"
        >
          <Download :size="14" />
          JSON
        </button>
      </div>
    </div>

    <!-- Filter bar -->
    <div
      data-testid="filter-bar"
      class="flex flex-wrap items-center gap-3 px-5 py-3 shrink-0"
      :style="{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'var(--color-surface-container-low)',
      }"
    >
      <!-- Actor search -->
      <div class="flex items-center gap-1.5 relative">
        <Search
          :size="14"
          class="absolute left-2.5 pointer-events-none"
          :style="{ color: 'var(--color-outline)' }"
        />
        <input
          v-model="actorFilter"
          data-testid="filter-actor"
          type="text"
          placeholder="Filter by actor email"
          class="pl-8 pr-3 py-1.5 text-sm"
          :style="{
            width: '220px',
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            outline: 'none',
          }"
          @change="handleFilterChange"
        />
      </div>

      <!-- Action filter -->
      <div class="flex items-center gap-1.5">
        <Filter
          :size="14"
          :style="{ color: 'var(--color-outline)' }"
        />
        <select
          v-model="actionFilter"
          data-testid="filter-action"
          class="px-2.5 py-1.5 text-sm cursor-pointer"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            outline: 'none',
          }"
          @change="handleFilterChange"
        >
          <option
            v-for="opt in ACTION_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>

      <!-- Resource type filter -->
      <input
        v-model="resourceTypeFilter"
        data-testid="filter-resource-type"
        type="text"
        placeholder="Resource type"
        class="px-3 py-1.5 text-sm"
        :style="{
          width: '160px',
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '4px',
          outline: 'none',
        }"
        @change="handleFilterChange"
      />

      <!-- Date range -->
      <input
        v-model="fromFilter"
        data-testid="filter-from"
        type="datetime-local"
        class="px-3 py-1.5 text-sm"
        :style="{
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '4px',
          outline: 'none',
          colorScheme: 'dark',
        }"
        @change="handleFilterChange"
      />
      <span class="text-sm" :style="{ color: 'var(--color-outline)' }">—</span>
      <input
        v-model="toFilter"
        data-testid="filter-to"
        type="datetime-local"
        class="px-3 py-1.5 text-sm"
        :style="{
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '4px',
          outline: 'none',
          colorScheme: 'dark',
        }"
        @change="handleFilterChange"
      />
    </div>

    <!-- Error banner -->
    <div
      v-if="error"
      data-testid="error-banner"
      class="mx-5 mt-4 px-4 py-3 text-sm rounded"
      :style="{
        backgroundColor: 'rgba(239,68,68,0.10)',
        color: 'var(--color-error)',
        border: '1px solid rgba(239,68,68,0.24)',
        borderRadius: '4px',
      }"
    >
      {{ error }}
    </div>

    <!-- Loading state -->
    <div
      v-if="loading"
      data-testid="loading-state"
      class="flex-1 flex items-center justify-center"
      :style="{ color: 'var(--color-on-surface-variant)' }"
    >
      <span class="text-sm">Loading...</span>
    </div>

    <!-- Table -->
    <div
      v-else
      class="flex-1 overflow-auto px-5 pt-4"
    >
      <!-- Empty state -->
      <div
        v-if="entries.length === 0"
        data-testid="empty-state"
        class="flex flex-col items-center justify-center py-16 gap-2"
      >
        <p
          class="text-sm font-medium"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          No audit log entries found
        </p>
        <p
          class="text-xs"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Try adjusting your filters or date range
        </p>
      </div>

      <!-- Filled table -->
      <table
        v-else
        data-testid="audit-log-table"
        class="w-full text-sm border-collapse"
      >
        <thead>
          <tr :style="{ borderBottom: '1px solid rgba(255,255,255,0.06)' }">
            <th
              class="text-left py-2 pr-4 font-medium text-xs"
              :style="{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.04em', textTransform: 'uppercase' }"
            >
              Timestamp
            </th>
            <th
              class="text-left py-2 pr-4 font-medium text-xs"
              :style="{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.04em', textTransform: 'uppercase' }"
            >
              Actor
            </th>
            <th
              class="text-left py-2 pr-4 font-medium text-xs"
              :style="{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.04em', textTransform: 'uppercase' }"
            >
              Action
            </th>
            <th
              class="text-left py-2 pr-4 font-medium text-xs"
              :style="{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.04em', textTransform: 'uppercase' }"
            >
              Resource
            </th>
            <th
              class="text-left py-2 pr-4 font-medium text-xs"
              :style="{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.04em', textTransform: 'uppercase' }"
            >
              Outcome
            </th>
            <th
              class="text-left py-2 font-medium text-xs"
              :style="{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.04em', textTransform: 'uppercase' }"
            >
              IP Address
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in entries"
            :key="entry.id"
            data-testid="audit-log-row"
            :style="{ borderBottom: '1px solid rgba(255,255,255,0.04)' }"
            class="transition-colors"
          >
            <td
              class="py-2.5 pr-4 font-mono text-xs"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >
              {{ formatTimestamp(entry.created_at) }}
            </td>
            <td
              class="py-2.5 pr-4 text-sm"
              :style="{ color: 'var(--color-on-surface)' }"
            >
              {{ entry.actor_email }}
            </td>
            <td
              class="py-2.5 pr-4 text-sm font-mono"
              :style="{ color: 'var(--color-on-surface)' }"
            >
              {{ entry.action }}
            </td>
            <td
              class="py-2.5 pr-4 text-sm"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >
              {{ resourceLabel(entry) }}
            </td>
            <td class="py-2.5 pr-4">
              <span
                class="text-xs px-2 py-0.5 rounded font-medium"
                :style="{
                  backgroundColor: entry.outcome === 'success' ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
                  color: entry.outcome === 'success' ? 'var(--color-secondary)' : 'var(--color-error)',
                  borderRadius: '4px',
                }"
              >
                {{ entry.outcome }}
              </span>
            </td>
            <td
              class="py-2.5 text-xs font-mono"
              :style="{ color: 'var(--color-on-surface-variant)' }"
            >
              {{ entry.ip_address ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="!loading && total > 0"
      data-testid="pagination"
      class="flex items-center justify-between px-5 py-3 shrink-0"
      :style="{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'var(--color-surface-container-low)',
      }"
    >
      <span class="text-xs" :style="{ color: 'var(--color-on-surface-variant)' }">
        {{ total }} total entries
      </span>

      <div class="flex items-center gap-3">
        <button
          data-testid="prev-page-btn"
          class="flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="page <= 1"
          :style="{
            backgroundColor: 'transparent',
            color: 'var(--color-on-surface-variant)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderRadius: '4px',
          }"
          @click="prevPage"
        >
          <ChevronLeft :size="14" />
          Previous
        </button>

        <span class="text-sm" :style="{ color: 'var(--color-on-surface)' }">
          Page {{ page }} of {{ totalPages }}
        </span>

        <button
          data-testid="next-page-btn"
          class="flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="page >= totalPages"
          :style="{
            backgroundColor: 'transparent',
            color: 'var(--color-on-surface-variant)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderRadius: '4px',
          }"
          @click="nextPage"
        >
          Next
          <ChevronRight :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>
