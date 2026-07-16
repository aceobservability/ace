import { connect, disconnect, init, type ECharts, type EChartsCoreOption, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

use([CanvasRenderer])

type UseRegistryEChartOptions = {
  groupId?: string | null
}

export function useRegistryEChart(option: EChartsCoreOption, { groupId }: UseRegistryEChartOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = init(containerRef.current)
    chartRef.current = chart

    if (groupId) {
      chart.group = groupId
      connect(groupId)
    }

    const resizeObserver = new ResizeObserver(() => {
      chart.resize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (groupId) {
        disconnect(groupId)
      }
      chart.dispose()
      chartRef.current = null
    }
  }, [groupId])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return containerRef
}