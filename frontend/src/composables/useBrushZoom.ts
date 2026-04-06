import { type Ref, onUnmounted, reactive, ref } from 'vue'

interface BrushRect {
  left: number
  top: number
  width: number
  height: number
}

// Runtime shape of a vue-echarts VChart instance. We use Ref<unknown> in the
// signature to avoid vue-tsc conflicts between component-definition and
// component-instance types, then cast to this interface internally.
interface ChartInstance {
  $el: HTMLElement
  containPixel(finder: string, point: number[]): boolean
  convertFromPixel(finder: string, point: number[]): number[]
}

function asChart(v: unknown): ChartInstance | null {
  return v && typeof v === 'object' && '$el' in v ? (v as ChartInstance) : null
}

export function useBrushZoom(
  chartRef: Ref<unknown>,
  onBrushZoom: (startMs: number, endMs: number) => void,
  onResetZoom: () => void,
) {
  const isDragging = ref(false)
  const brushRect = reactive<BrushRect>({ left: 0, top: 0, width: 0, height: 0 })

  let startX = 0
  let gridTop = 0
  let gridHeight = 0

  function handleMouseDown(event: { offsetX: number; offsetY: number }) {
    const chart = asChart(chartRef.value)
    if (!chart) return

    if (!chart.containPixel('grid', [event.offsetX, event.offsetY])) return

    startX = event.offsetX

    // Fallback: matches ECharts default grid (top: '8%', bottom: '8%', no title).
    // When props.title is set the chart uses top: '15%'; coordinateSystem.getRect()
    // below returns the accurate position for that case.
    const el = chart.$el
    const containerHeight = el.clientHeight
    gridTop = containerHeight * 0.08
    gridHeight = containerHeight * 0.84

    // Try to get more accurate grid bounds from the chart model
    try {
      const model = (chart as { getModel?: () => unknown }).getModel?.()
      if (model) {
        const gridModel = (
          model as { getComponent?: (type: string) => unknown }
        ).getComponent?.('grid')
        if (gridModel) {
          const rect = (gridModel as { coordinateSystem?: { getRect?: () => { x: number; y: number; width: number; height: number } } }).coordinateSystem?.getRect?.()
          if (rect) {
            gridTop = rect.y
            gridHeight = rect.height
          }
        }
      }
    } catch {
      // Fall back to defaults calculated above
    }

    brushRect.left = startX
    brushRect.top = gridTop
    brushRect.width = 0
    brushRect.height = gridHeight

    isDragging.value = true

    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
  }

  function onWindowMouseMove(event: MouseEvent) {
    const chart = asChart(chartRef.value)
    if (!chart || !isDragging.value) return

    const el = chart.$el
    const rect = el.getBoundingClientRect()
    const currentX = event.clientX - rect.left

    const left = Math.min(startX, currentX)
    const width = Math.abs(currentX - startX)

    brushRect.left = left
    brushRect.width = width
  }

  function onWindowMouseUp(event: MouseEvent) {
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', onWindowMouseUp)

    if (!isDragging.value) return

    const chart = asChart(chartRef.value)
    if (!chart) {
      isDragging.value = false
      brushRect.left = 0
      brushRect.top = 0
      brushRect.width = 0
      brushRect.height = 0
      return
    }

    const el = chart.$el
    const rect = el.getBoundingClientRect()
    const endX = event.clientX - rect.left

    isDragging.value = false
    brushRect.left = 0
    brushRect.top = 0
    brushRect.width = 0
    brushRect.height = 0

    // Minimum drag threshold of 5px
    if (Math.abs(endX - startX) < 5) return

    const startTs = chart.convertFromPixel('grid', [startX, 0])?.[0]
    const endTs = chart.convertFromPixel('grid', [endX, 0])?.[0]

    if (startTs != null && endTs != null) {
      onBrushZoom(Math.min(startTs, endTs), Math.max(startTs, endTs))
    }
  }

  function handleDblClick() {
    onResetZoom()
  }

  function cleanup() {
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', onWindowMouseUp)
  }

  onUnmounted(cleanup)

  return {
    isDragging,
    brushRect,
    handleMouseDown,
    handleDblClick,
  }
}
