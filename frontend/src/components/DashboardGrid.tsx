import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GridLayout, { type Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Panel } from '@/components/Panel'
import { updatePanel } from '@/api/panels'
import type { Panel as PanelType } from '@/types/panel'

type DashboardGridProps = {
  panels: PanelType[]
  onPanelsChange: (panels: PanelType[]) => void
}

const COL_NUM = 12
const ROW_HEIGHT = 100

export function DashboardGrid({ panels, onPanelsChange }: DashboardGridProps) {
  const saveLayoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const layout = useMemo<Layout>(
    () =>
      panels.map(panel => ({
        i: panel.id,
        x: panel.grid_pos.x,
        y: panel.grid_pos.y,
        w: panel.grid_pos.w,
        h: panel.grid_pos.h,
        minW: 2,
        minH: 2,
      })),
    [panels],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [gridWidth, setGridWidth] = useState(1200)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width && width > 0) setGridWidth(width)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const saveLayoutToDatabase = useCallback(async (nextLayout: Layout) => {
    for (const item of nextLayout) {
      const panel = panels.find(entry => entry.id === item.i)
      if (!panel) continue
      try {
        await updatePanel(panel.id, {
          grid_pos: {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          },
        })
      } catch (cause) {
        console.error('Failed to save panel position:', cause)
      }
    }
  }, [panels])

  const handleLayoutChange = useCallback(
    (nextLayout: Layout) => {
      const updatedPanels = panels.map(panel => {
        const item = nextLayout.find(entry => entry.i === panel.id)
        if (!item) return panel
        return {
          ...panel,
          grid_pos: {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          },
        }
      })

      onPanelsChange(updatedPanels)

      if (saveLayoutTimeoutRef.current) {
        clearTimeout(saveLayoutTimeoutRef.current)
      }
      saveLayoutTimeoutRef.current = setTimeout(() => {
        void saveLayoutToDatabase(nextLayout)
      }, 500)
    },
    [onPanelsChange, panels, saveLayoutToDatabase],
  )

  return (
    <div ref={containerRef} data-testid="dashboard-grid">
      <GridLayout
        className="layout relative z-[1] min-h-[400px] pb-2"
        layout={layout}
        cols={COL_NUM}
        rowHeight={ROW_HEIGHT}
        width={gridWidth}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        isDraggable
        isResizable
        compactType="vertical"
        draggableHandle=".panel-header"
        onLayoutChange={handleLayoutChange}
      >
        {panels.map(panel => (
          <div key={panel.id} data-testid={`dashboard-grid-item-${panel.id}`}>
            <Panel panel={panel} />
          </div>
        ))}
      </GridLayout>
    </div>
  )
}