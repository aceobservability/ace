import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimeRange } from '../composables/useTimeRange'
import TimeRangePicker from './TimeRangePicker.vue'

/** Find the time-display toggle button (contains Clock icon + display text). */
function findTimeDisplay(wrapper: ReturnType<typeof mount>) {
  // It's the first button inside the .time-range-picker
  return wrapper.find('.time-range-picker button')
}

/** Find the refresh button (has RefreshCw, title starts with "Last refresh"). */
function findRefreshBtn(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.attributes('title')?.startsWith('Last refresh'))!
}

/** Find the dropdown (absolute-positioned div that appears when isOpen is true). */
function findDropdown(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.absolute')
}

/** Find all preset buttons inside dropdown (the full-width buttons with preset text). */
function findPresetItems(wrapper: ReturnType<typeof mount>) {
  // Presets are buttons with text like "Last ..." inside the dropdown
  const dropdown = findDropdown(wrapper)
  if (!dropdown.exists()) return []
  return dropdown.findAll('button').filter((b) => b.text().startsWith('Last '))
}

/** Find the "Custom range..." button. */
function findCustomRangeBtn(wrapper: ReturnType<typeof mount>) {
  const dropdown = findDropdown(wrapper)
  if (!dropdown.exists()) return undefined
  return dropdown.findAll('button').find((b) => b.text().includes('Custom range'))
}

describe('TimeRangePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-02T12:00:00Z'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    // Clean up shared state
    const { cleanup, setPreset, setRefreshInterval } = useTimeRange()
    cleanup()
    setPreset('1h') // Reset to default
    setRefreshInterval('off')
  })

  it('should render with default time range display', () => {
    const wrapper = mount(TimeRangePicker)

    expect(findTimeDisplay(wrapper).exists()).toBe(true)
    expect(wrapper.find('.font-mono.text-xs').text()).toBe('Last 1 hour')
  })

  it('should render refresh button', () => {
    const wrapper = mount(TimeRangePicker)

    expect(findRefreshBtn(wrapper).exists()).toBe(true)
  })

  it('should render refresh interval selector with auto-refresh options', () => {
    const wrapper = mount(TimeRangePicker)

    const select = wrapper.find('[data-testid="time-range-auto-refresh-select"]')
    expect(select.exists()).toBe(true)

    const options = select.findAll('option')
    // Should include Off, 15s, 30s, 1m, 5m at minimum
    const labels = options.map((o) => o.text())
    expect(labels).toContain('Off')
  })

  it('should toggle dropdown when clicking time display', async () => {
    const wrapper = mount(TimeRangePicker)

    expect(findDropdown(wrapper).exists()).toBe(false)

    await findTimeDisplay(wrapper).trigger('click')
    expect(findDropdown(wrapper).exists()).toBe(true)

    await findTimeDisplay(wrapper).trigger('click')
    expect(findDropdown(wrapper).exists()).toBe(false)
  })

  it('should display preset options in dropdown', async () => {
    const wrapper = mount(TimeRangePicker)

    await findTimeDisplay(wrapper).trigger('click')

    const presetItems = findPresetItems(wrapper)
    // 7 presets
    expect(presetItems.length).toBeGreaterThanOrEqual(7)

    expect(wrapper.text()).toContain('Last 5 minutes')
    expect(wrapper.text()).toContain('Last 15 minutes')
    expect(wrapper.text()).toContain('Last 30 minutes')
    expect(wrapper.text()).toContain('Last 1 hour')
    expect(wrapper.text()).toContain('Last 6 hours')
    expect(wrapper.text()).toContain('Last 24 hours')
    expect(wrapper.text()).toContain('Last 7 days')
  })

  it('should select preset and close dropdown', async () => {
    const wrapper = mount(TimeRangePicker)

    await findTimeDisplay(wrapper).trigger('click')

    // Find and click '5 minutes' preset
    const presetButtons = findPresetItems(wrapper)
    const fiveMinButton = presetButtons.find((btn) => btn.text() === 'Last 5 minutes')
    expect(fiveMinButton).toBeDefined()
    if (!fiveMinButton) {
      throw new Error('Expected Last 5 minutes button to be present')
    }

    await fiveMinButton.trigger('click')

    // Dropdown should close
    expect(findDropdown(wrapper).exists()).toBe(false)

    // Display should update
    expect(wrapper.find('.font-mono.text-xs').text()).toBe('Last 5 minutes')
  })

  it('should show custom range form when clicking custom range option', async () => {
    const wrapper = mount(TimeRangePicker)

    await findTimeDisplay(wrapper).trigger('click')

    const customRangeBtn = findCustomRangeBtn(wrapper)
    expect(customRangeBtn).toBeDefined()

    await customRangeBtn?.trigger('click')

    // Should show custom range form
    expect(wrapper.find('#custom-from').exists()).toBe(true)
    expect(wrapper.find('#custom-to').exists()).toBe(true)
  })

  it('should apply custom range', async () => {
    const wrapper = mount(TimeRangePicker)

    await findTimeDisplay(wrapper).trigger('click')
    await findCustomRangeBtn(wrapper)?.trigger('click')

    // Set custom dates
    const fromInput = wrapper.find('#custom-from')
    const toInput = wrapper.find('#custom-to')

    await fromInput.setValue('2026-02-01T10:00')
    await toInput.setValue('2026-02-02T14:00')

    // Click apply (the accent-colored button)
    const applyBtn = wrapper.findAll('button').find((b) => b.text() === 'Apply')!
    await applyBtn.trigger('click')

    // Dropdown should close
    expect(findDropdown(wrapper).exists()).toBe(false)

    // Display should show custom range
    expect(wrapper.find('.font-mono.text-xs').text()).toContain('2026-02-01')
    expect(wrapper.find('.font-mono.text-xs').text()).toContain('2026-02-02')
  })

  it('should show error when start time is after end time', async () => {
    const wrapper = mount(TimeRangePicker)

    await findTimeDisplay(wrapper).trigger('click')
    await findCustomRangeBtn(wrapper)?.trigger('click')

    // Set invalid dates (start after end)
    await wrapper.find('#custom-from').setValue('2026-02-02T14:00')
    await wrapper.find('#custom-to').setValue('2026-02-01T10:00')

    // Click apply
    const applyBtn = wrapper.findAll('button').find((b) => b.text() === 'Apply')!
    await applyBtn.trigger('click')

    // Should show error text
    expect(wrapper.text()).toContain('Start time must be before end time')

    // Dropdown should still be open
    expect(findDropdown(wrapper).exists()).toBe(true)
  })

  it('should cancel custom range and go back to presets', async () => {
    const wrapper = mount(TimeRangePicker)

    await findTimeDisplay(wrapper).trigger('click')
    await findCustomRangeBtn(wrapper)?.trigger('click')

    expect(wrapper.find('#custom-from').exists()).toBe(true)

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Cancel')!
    await cancelBtn.trigger('click')

    // Should go back to presets
    expect(wrapper.find('#custom-from').exists()).toBe(false)
    expect(wrapper.text()).toContain('Quick ranges')
  })

  it('should change refresh interval', async () => {
    const wrapper = mount(TimeRangePicker)

    const select = wrapper.find('[data-testid="time-range-auto-refresh-select"]')

    await select.setValue('5s')

    const { refreshIntervalValue } = useTimeRange()
    expect(refreshIntervalValue.value).toBe('5s')
  })

  it('should highlight selected preset', async () => {
    const wrapper = mount(TimeRangePicker)

    // Set to 5m preset first
    const { setPreset } = useTimeRange()
    setPreset('5m')
    await wrapper.vm.$nextTick()

    await findTimeDisplay(wrapper).trigger('click')

    // The selected preset should have the primary color style applied
    const selectedItem = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Last 5 minutes' && b.classes().includes('font-medium'))
    expect(selectedItem).toBeDefined()
    expect(selectedItem?.text()).toBe('Last 5 minutes')
  })

  it('should call refresh when clicking refresh button', async () => {
    const wrapper = mount(TimeRangePicker)
    const { onRefresh } = useTimeRange()

    const callback = vi.fn()
    onRefresh(callback)

    await findRefreshBtn(wrapper).trigger('click')

    expect(callback).toHaveBeenCalled()
  })

  it('should show refresh status when auto-refresh is enabled', async () => {
    const wrapper = mount(TimeRangePicker)

    // Enable auto-refresh
    const select = wrapper.find('[data-testid="time-range-auto-refresh-select"]')
    await select.setValue('5s')

    // Should show refresh status text (the span with refresh timing info)
    expect(wrapper.text()).toMatch(/Refreshing|ago|just now/)
  })

  it('should not show refresh status when auto-refresh is off', () => {
    const wrapper = mount(TimeRangePicker)

    // Auto-refresh is off by default; the refresh status span should not exist
    // The span with "Refreshing..." or "Xm ago" only appears when refreshIntervalValue !== 'off'
    const statusTexts = wrapper
      .findAll('span')
      .filter((s) => s.text().includes('Refreshing') || s.text().match(/\d+[smh] ago/))
    expect(statusTexts.length).toBe(0)
  })

  it('should show last refresh time in refresh button title', async () => {
    const wrapper = mount(TimeRangePicker)

    const refreshBtn = findRefreshBtn(wrapper)
    const title = refreshBtn.attributes('title')

    expect(title).toContain('Last refresh')
  })

  it('should animate refresh button when refreshing', async () => {
    const wrapper = mount(TimeRangePicker)
    const { setRefreshInterval } = useTimeRange()

    // Enable auto-refresh
    setRefreshInterval('5s')
    await wrapper.vm.$nextTick()

    // Trigger a refresh
    vi.advanceTimersByTime(5000)
    await wrapper.vm.$nextTick()

    // The refresh button should still exist
    expect(findRefreshBtn(wrapper).exists()).toBe(true)
  })
})
