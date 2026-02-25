<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Clock, ChevronDown, ChevronUp, RefreshCw } from 'lucide-vue-next'
import { useTimeRange } from '../composables/useTimeRange'

const props = withDefaults(defineProps<{
  stacked?: boolean
}>(), {
  stacked: false,
})

const {
  displayText,
  selectedPreset,
  isCustomRange,
  refreshIntervalValue,
  lastRefreshTime,
  isRefreshing,
  presets,
  refreshIntervals,
  setPreset,
  setCustomRange,
  setRefreshInterval,
  refresh,
} = useTimeRange()

const isOpen = ref(false)
const showCustomRange = ref(false)
const customFrom = ref('')
const customTo = ref('')
const customRangeError = ref<string | null>(null)

const currentDisplayText = computed(() => displayText.value)

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    showCustomRange.value = false
    customRangeError.value = null
  }
}

function closeDropdown() {
  isOpen.value = false
  showCustomRange.value = false
  customRangeError.value = null
}

function selectPreset(presetValue: string) {
  setPreset(presetValue)
  closeDropdown()
}

function openCustomRange() {
  showCustomRange.value = true
  // Initialize with current date/time values
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  customFrom.value = formatDateTimeLocal(oneHourAgo)
  customTo.value = formatDateTimeLocal(now)
}

function applyCustomRange() {
  const fromDate = new Date(customFrom.value)
  const toDate = new Date(customTo.value)

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    customRangeError.value = 'Please enter valid dates'
    return
  }

  if (fromDate >= toDate) {
    customRangeError.value = 'Start time must be before end time'
    return
  }

  setCustomRange(fromDate.getTime(), toDate.getTime())
  closeDropdown()
}

function cancelCustomRange() {
  showCustomRange.value = false
  customRangeError.value = null
}

function selectRefreshInterval(intervalValue: string) {
  setRefreshInterval(intervalValue)
}

function handleRefresh() {
  refresh()
}

function formatLastRefresh(): string {
  const now = Date.now()
  const diff = now - lastRefreshTime.value

  if (diff < 1000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.time-range-picker')) {
    closeDropdown()
  }
}

// Add/remove click listener
if (typeof window !== 'undefined') {
  window.addEventListener('click', handleClickOutside)
}

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', handleClickOutside)
  }
})
</script>

<template>
  <div class="time-range-picker" :class="{ stacked: props.stacked }">
    <div class="picker-controls" :class="{ stacked: props.stacked }">
      <div class="time-select-row">
        <button
          class="time-display"
          @click.stop="toggleDropdown"
          :class="{ active: isOpen }"
        >
          <Clock :size="16" class="clock-icon" />
          <span class="display-text">{{ currentDisplayText }}</span>
          <component :is="isOpen ? ChevronUp : ChevronDown" :size="14" class="dropdown-arrow" />
        </button>
      </div>

      <div class="refresh-controls-row">
        <button
          class="refresh-btn"
          :class="{ refreshing: isRefreshing }"
          @click="handleRefresh"
          :title="'Last refresh: ' + formatLastRefresh()"
        >
          <RefreshCw :size="16" />
        </button>

        <div class="refresh-interval-selector">
          <select
            :value="refreshIntervalValue"
            @change="selectRefreshInterval(($event.target as HTMLSelectElement).value)"
            title="Auto-refresh interval"
          >
            <option
              v-for="interval in refreshIntervals"
              :key="interval.value"
              :value="interval.value"
            >
              {{ interval.label }}
            </option>
          </select>
        </div>

        <span v-if="refreshIntervalValue !== 'off'" class="refresh-status">
          {{ isRefreshing ? 'Refreshing...' : formatLastRefresh() }}
        </span>
      </div>
    </div>

    <div v-if="isOpen" class="dropdown" @click.stop>
      <div v-if="!showCustomRange" class="preset-list">
        <div class="dropdown-section">
          <div class="section-title">Quick ranges</div>
          <button
            v-for="preset in presets"
            :key="preset.value"
            class="preset-item"
            :class="{ selected: !isCustomRange && selectedPreset === preset.value }"
            @click="selectPreset(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div class="dropdown-divider"></div>

        <button class="preset-item custom-range-btn" @click="openCustomRange">
          Custom range...
        </button>
      </div>

      <div v-else class="custom-range-form">
        <div class="section-title">Custom time range</div>

        <div class="form-group">
          <label for="custom-from">From</label>
          <input
            id="custom-from"
            type="datetime-local"
            v-model="customFrom"
          />
        </div>

        <div class="form-group">
          <label for="custom-to">To</label>
          <input
            id="custom-to"
            type="datetime-local"
            v-model="customTo"
          />
        </div>

        <div v-if="customRangeError" class="error-message">
          {{ customRangeError }}
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" @click="cancelCustomRange">Cancel</button>
          <button class="btn btn-primary" @click="applyCustomRange">Apply</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.time-range-picker {
  position: relative;
  display: inline-block;
}

.time-range-picker.stacked {
  display: block;
  width: 100%;
}

.picker-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.picker-controls.stacked {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
}

.time-select-row,
.refresh-controls-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.time-range-picker.stacked .time-select-row {
  width: 100%;
}

.time-range-picker.stacked .time-display {
  width: 100%;
  justify-content: space-between;
}

.time-range-picker.stacked .refresh-controls-row {
  width: 100%;
  flex-wrap: wrap;
}

.time-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.52rem 0.75rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  transition: all 0.2s;
}

.time-display:hover {
  border-color: var(--color-border-strong);
  background: var(--color-bg-2);
}

.time-display.active {
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.clock-icon {
  color: var(--color-text-1);
}

.display-text {
  min-width: 100px;
  font-family: var(--font-family-mono);
  font-size: 0.76rem;
}

.dropdown-arrow {
  color: var(--color-text-2);
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  color: var(--color-text-1);
  transition: all 0.2s;
}

.refresh-btn:hover {
  border-color: var(--color-border-strong);
  background: var(--color-bg-2);
  color: var(--color-text-0);
}

.refresh-btn.refreshing {
  color: var(--color-accent);
}

.refresh-btn.refreshing svg {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.refresh-status {
  font-size: 0.75rem;
  color: var(--color-text-2);
  padding: 0 0.5rem;
}

.time-range-picker.stacked .refresh-status {
  padding: 0;
}

.refresh-interval-selector select {
  padding: 0.52rem 2rem 0.52rem 0.75rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  cursor: pointer;
  transition: all 0.2s;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
}

.refresh-interval-selector select:hover {
  border-color: var(--color-border-strong);
}

.refresh-interval-selector select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 220px;
  background: rgba(11, 21, 33, 0.98);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.dropdown-section {
  padding: 0.5rem 0;
}

.section-title {
  padding: 0.5rem 1rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preset-item {
  display: block;
  width: 100%;
  padding: 0.625rem 1rem;
  background: none;
  border: none;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  cursor: pointer;
  transition: background-color 0.15s;
}

.preset-item:hover {
  background: var(--color-bg-hover);
}

.preset-item.selected {
  background: rgba(245, 158, 11, 0.16);
  color: var(--color-accent);
  font-weight: 500;
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0.25rem 0;
}

.custom-range-btn {
  color: var(--color-accent);
}

.custom-range-form {
  padding: 1rem;
}

.form-group {
  margin-bottom: 0.75rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-1);
}

.form-group input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  color-scheme: dark;
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.error-message {
  padding: 0.5rem 0.75rem;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 6px;
  color: var(--color-danger);
  font-size: 0.75rem;
  margin-bottom: 0.75rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: transparent;
  border: 1px solid #F59E0B;
  color: #FCD34D;
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-strong);
}

.btn-primary {
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
  color: #1a0f00;
}

.btn-primary:hover {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}
</style>
