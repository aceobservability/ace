<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LogEntry } from '../types/datasource'

const props = withDefaults(defineProps<{
  logs: LogEntry[]
  highlightedLogKeys?: string[]
}>(), {
  highlightedLogKeys: () => [],
})

interface DetectedField {
  key: string
  value: string
}

function getLevelClass(level?: string): string {
  switch (level) {
    case 'error':
      return 'level-error'
    case 'warning':
    case 'warn':
      return 'level-warning'
    case 'info':
      return 'level-info'
    case 'debug':
      return 'level-debug'
    default:
      return ''
  }
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions)
  } catch {
    return ts
  }
}

const displayLogs = computed(() => props.logs.slice(0, 1000))
const highlightedLogKeySet = computed(() => new Set(props.highlightedLogKeys))
const expandedRows = ref<Set<number>>(new Set())

function getLogKey(log: LogEntry): string {
  const labels = Object.entries(log.labels || {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
  return `${log.timestamp}|${labels}|${log.line}`
}

function isHighlighted(log: LogEntry): boolean {
  return highlightedLogKeySet.value.has(getLogKey(log))
}

function toggleRow(index: number) {
  const next = new Set(expandedRows.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  expandedRows.value = next
}

function isExpanded(index: number): boolean {
  return expandedRows.value.has(index)
}

function formatFieldValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function flattenObject(value: unknown, prefix = '', depth = 0): DetectedField[] {
  if (depth > 4) {
    return [{ key: prefix || 'value', value: formatFieldValue(value) }]
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ key: prefix || 'value', value: '[]' }]
    }

    const rows: DetectedField[] = []
    for (let i = 0; i < value.length; i += 1) {
      const childPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`
      rows.push(...flattenObject(value[i], childPrefix, depth + 1))
    }
    return rows
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      return [{ key: prefix || 'value', value: '{}' }]
    }

    const rows: DetectedField[] = []
    for (const [key, child] of entries) {
      const childPrefix = prefix ? `${prefix}.${key}` : key
      rows.push(...flattenObject(child, childPrefix, depth + 1))
    }
    return rows
  }

  return [{ key: prefix || 'value', value: formatFieldValue(value) }]
}

function parseJsonFields(line: string): DetectedField[] {
  const trimmed = line.trim()
  const candidates: string[] = [trimmed]
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace > 0) {
    candidates.push(trimmed.slice(firstBrace))
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
      continue
    }

    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return flattenObject(parsed)
      }
    } catch {}
  }

  return []
}

function parseKeyValueFields(line: string): DetectedField[] {
  const fields: DetectedField[] = []
  const seenKeys = new Set<string>()
  const pattern = /([a-zA-Z_][\w.-]*)=("[^"]*"|'[^']*'|[^,\s]+)/g

  for (const match of line.matchAll(pattern)) {
    const key = match[1]
    if (!key || seenKeys.has(key)) {
      continue
    }

    const rawValue = match[2] || ''
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue

    fields.push({ key, value })
    seenKeys.add(key)
  }

  return fields
}

function getMessageFields(log: LogEntry): DetectedField[] {
  const jsonFields = parseJsonFields(log.line)
  if (jsonFields.length > 0) {
    return jsonFields
  }

  return parseKeyValueFields(log.line)
}

const detectedFieldsByRow = computed(() =>
  displayLogs.value.map(log => getMessageFields(log)),
)

watch(displayLogs, () => {
  expandedRows.value = new Set<number>()
})
</script>

<template>
  <div class="log-viewer">
    <div class="log-header">
      <span class="log-count">{{ logs.length }} log entries</span>
    </div>
    <div class="log-table-wrapper">
      <table class="log-table">
        <thead>
          <tr>
            <th class="col-time">Timestamp</th>
            <th class="col-level">Level</th>
            <th class="col-message">Message</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(log, i) in displayLogs" :key="i">
            <tr
              :class="['log-row', getLevelClass(log.level), { expanded: isExpanded(i), highlighted: isHighlighted(log) }]"
              @click="toggleRow(i)"
            >
              <td class="col-time">
                <span class="timestamp">{{ formatTimestamp(log.timestamp) }}</span>
              </td>
              <td class="col-level">
                <span v-if="log.level" class="level-badge" :class="getLevelClass(log.level)">
                  {{ log.level }}
                </span>
              </td>
              <td class="col-message">
                <div class="message-main">
                  <span class="expand-indicator">{{ isExpanded(i) ? 'v' : '>' }}</span>
                  <span class="log-line">{{ log.line }}</span>
                </div>
                <div v-if="log.labels && Object.keys(log.labels).length > 0" class="log-labels">
                  <span
                    v-for="(value, key) in log.labels"
                    :key="String(key)"
                    class="label-tag"
                  >
                    {{ key }}={{ value }}
                  </span>
                </div>
              </td>
            </tr>
            <tr v-if="isExpanded(i)" class="details-row">
              <td colspan="3" class="details-cell">
                <div class="details-title">Detected Fields</div>
                <div v-if="detectedFieldsByRow[i]?.length" class="field-grid">
                  <div
                    v-for="field in detectedFieldsByRow[i]"
                    :key="field.key"
                    class="field-row"
                  >
                    <span class="field-key">{{ field.key }}</span>
                    <span class="field-value">{{ field.value }}</span>
                  </div>
                </div>
                <div v-else class="no-fields">No structured fields detected in this message.</div>
              </td>
            </tr>
          </template>
          <tr v-if="logs.length === 0">
            <td colspan="3" class="empty-row">No log entries</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style>
.log-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  flex-shrink: 0;
}

.log-count {
  font-size: 0.75rem;
  color: var(--color-text-2);
}

.log-table-wrapper {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
}

.log-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.log-table th {
  background: var(--color-bg-2);
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-1);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--color-border);
}

.log-table td {
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.log-table tr:hover td {
  background: var(--color-bg-hover);
}

.log-row {
  cursor: pointer;
}

.log-row.expanded td {
  background: rgba(31, 49, 73, 0.45);
}

.log-row.highlighted td {
  animation: row-highlight-fade 2.4s ease-out;
  background: rgba(245, 158, 11, 0.14);
}

@keyframes row-highlight-fade {
  0% {
    background: rgba(245, 158, 11, 0.28);
  }
  100% {
    background: transparent;
  }
}

.col-time {
  width: 110px;
  white-space: nowrap;
}

.col-level {
  width: 70px;
}

.col-message {
  word-break: break-word;
}

.message-main {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
}

.expand-indicator {
  flex-shrink: 0;
  color: var(--color-text-2);
  font-size: 0.72rem;
  line-height: 1.35;
  margin-top: 0.1rem;
}

.timestamp {
  color: var(--color-text-2);
}

.level-badge {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.level-error .level-badge {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.level-warning .level-badge {
  background: rgba(254, 202, 87, 0.15);
  color: #feca57;
}

.level-info .level-badge {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-accent);
}

.level-debug .level-badge {
  background: rgba(160, 160, 160, 0.15);
  color: #a0a0a0;
}

tr.level-error td {
  border-left: 2px solid #ff6b6b;
  background: rgba(255, 107, 107, 0.07);
}

tr.level-error:hover td {
  background: rgba(255, 107, 107, 0.1);
}

tr.level-warning td {
  border-left: 2px solid #feca57;
}

.log-line {
  color: var(--color-text-0);
  white-space: pre-wrap;
}

.log-labels {
  margin-top: 0.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.label-tag {
  display: inline-block;
  padding: 0.1rem 0.375rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  font-size: 0.7rem;
  color: var(--color-text-1);
}

.details-row td {
  border-top: 0;
  background: rgba(12, 21, 33, 0.88);
}

.details-cell {
  padding: 0.65rem 0.75rem 0.8rem;
}

.details-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-2);
  margin-bottom: 0.45rem;
}

.field-grid {
  display: grid;
  gap: 0.35rem;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(120px, 220px) 1fr;
  gap: 0.6rem;
}

.field-key {
  color: var(--color-accent);
  font-size: 0.74rem;
  word-break: break-word;
}

.field-value {
  color: var(--color-text-1);
  font-size: 0.74rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.no-fields {
  color: var(--color-text-2);
  font-size: 0.74rem;
}

@media (max-width: 680px) {
  .field-row {
    grid-template-columns: 1fr;
    gap: 0.2rem;
  }
}

.empty-row {
  text-align: center;
  color: var(--color-text-2);
  padding: 2rem 1rem !important;
}
</style>
