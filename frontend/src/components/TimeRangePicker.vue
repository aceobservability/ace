<script setup lang="ts">
import { ChevronDown, ChevronUp, Clock, RefreshCw } from 'lucide-vue-next'
import { computed, onUnmounted, ref } from 'vue'
import { useTimeRange } from '../composables/useTimeRange'

const props = withDefaults(
  defineProps<{
    stacked?: boolean
  }>(),
  {
    stacked: false,
  },
)

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
  <div class="time-range-picker relative" :class="props.stacked ? 'block w-full' : 'inline-block'">
    <div
      class="flex gap-2"
      :class="props.stacked ? 'flex-col items-start gap-[0.45rem]' : 'items-center'"
    >
      <!-- Time select row -->
      <div class="flex items-center gap-2" :class="props.stacked ? 'w-full' : ''">
        <button
          data-testid="time-range-picker-btn"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition cursor-pointer hover:opacity-80"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: isOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
          }"
          :class="[
            props.stacked ? 'w-full justify-between' : ''
          ]"
          @click.stop="toggleDropdown"
        >
          <Clock :size="16" :style="{ color: 'var(--color-outline)' }" />
          <span class="min-w-[100px] font-mono text-xs">{{ currentDisplayText }}</span>
          <component :is="isOpen ? ChevronUp : ChevronDown" :size="14" :style="{ color: 'var(--color-outline)' }" />
        </button>
      </div>

      <!-- Refresh controls row -->
      <div
        class="flex items-center gap-2"
        :class="props.stacked ? 'w-full flex-wrap' : ''"
      >
        <button
          data-testid="time-range-refresh-btn"
          class="flex items-center justify-center rounded-lg px-2 py-1.5 transition cursor-pointer hover:opacity-80"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: isRefreshing ? 'var(--color-primary)' : 'var(--color-outline)',
            border: '1px solid transparent',
          }"
          @click="handleRefresh"
          :title="'Last refresh: ' + formatLastRefresh()"
        >
          <RefreshCw :size="16" :class="isRefreshing ? 'animate-spin' : ''" />
        </button>

        <div>
          <select
            :value="refreshIntervalValue"
            data-testid="time-range-auto-refresh-select"
            @change="selectRefreshInterval(($event.target as HTMLSelectElement).value)"
            title="Auto-refresh interval"
            class="rounded-lg px-2 py-1.5 pr-7 text-xs font-medium cursor-pointer transition appearance-none focus:outline-none"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
              border: '1px solid transparent',
            }"
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

        <span
          v-if="refreshIntervalValue !== 'off'"
          class="text-xs px-2"
          :style="{ color: 'var(--color-on-surface-variant)' }"
          :class="props.stacked ? 'px-0' : ''"
        >
          {{ isRefreshing ? 'Refreshing...' : formatLastRefresh() }}
        </span>
      </div>
    </div>

    <!-- Dropdown -->
    <div
      v-if="isOpen"
      class="absolute top-[calc(100%+4px)] left-0 min-w-[220px] rounded-lg shadow-lg z-[1000] animate-fade-in"
      :style="{
        backgroundColor: 'var(--color-surface-bright)',
        border: '1px solid var(--color-outline-variant)',
      }"
      @click.stop
    >
      <div v-if="!showCustomRange">
        <div class="py-2">
          <div
            class="px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide"
            :style="{ color: 'var(--color-outline)' }"
          >
            Quick ranges
          </div>
          <button
            v-for="preset in presets"
            :key="preset.value"
            class="block w-full px-4 py-2.5 border-0 bg-transparent text-left text-sm cursor-pointer transition hover:opacity-80"
            :class="!isCustomRange && selectedPreset === preset.value ? 'bg-[var(--color-primary)]/10 font-medium' : ''"
            :style="{
              color: !isCustomRange && selectedPreset === preset.value ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              backgroundColor: !isCustomRange && selectedPreset === preset.value ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
            }"
            @click="selectPreset(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div
          class="h-px mx-0 my-1"
          :style="{ backgroundColor: 'var(--color-outline-variant)' }"
        ></div>

        <button
          class="block w-full px-4 py-2.5 border-0 bg-transparent text-left text-sm cursor-pointer transition hover:opacity-80"
          :style="{ color: 'var(--color-primary)' }"
          @click="openCustomRange"
        >
          Custom range...
        </button>
      </div>

      <div v-else class="p-4">
        <div
          class="px-0 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide"
          :style="{ color: 'var(--color-outline)' }"
        >
          Custom time range
        </div>

        <div class="mb-3">
          <label
            for="custom-from"
            class="block mb-1.5 text-xs font-medium"
            :style="{ color: 'var(--color-on-surface-variant)' }"
          >From</label>
          <input
            id="custom-from"
            data-testid="time-range-custom-from-input"
            type="datetime-local"
            v-model="customFrom"
            class="w-full rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2"
            :style="{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }"
          />
        </div>

        <div class="mb-3">
          <label
            for="custom-to"
            class="block mb-1.5 text-xs font-medium"
            :style="{ color: 'var(--color-on-surface-variant)' }"
          >To</label>
          <input
            id="custom-to"
            data-testid="time-range-custom-to-input"
            type="datetime-local"
            v-model="customTo"
            class="w-full rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2"
            :style="{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }"
          />
        </div>

        <div
          v-if="customRangeError"
          class="mb-3 rounded-lg px-3 py-2 text-xs"
          :style="{
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: 'var(--color-error)',
          }"
        >
          {{ customRangeError }}
        </div>

        <div class="flex justify-end gap-2">
          <button
            data-testid="time-range-cancel-btn"
            class="rounded-lg px-4 py-2 text-sm font-medium bg-transparent cursor-pointer transition hover:opacity-80"
            :style="{
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
            }"
            @click="cancelCustomRange"
          >
            Cancel
          </button>
          <button
            data-testid="time-range-apply-btn"
            class="rounded-lg px-4 py-2 text-sm font-medium text-white cursor-pointer transition hover:opacity-90"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              border: '1px solid transparent',
            }"
            @click="applyCustomRange"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
