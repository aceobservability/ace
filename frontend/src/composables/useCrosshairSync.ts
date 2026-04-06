import { connect, disconnect } from 'echarts/core'
import { type InjectionKey, inject, onUnmounted, provide } from 'vue'

const CROSSHAIR_SYNC_KEY: InjectionKey<string> = Symbol('crosshairSync')

/**
 * Provide a crosshair sync group for all chart panels within this dashboard.
 * Call once from the dashboard root component (e.g. DashboardDetailView).
 *
 * All VChart instances that share the same `group` will have their tooltips
 * and axis pointers synchronised automatically via ECharts' built-in
 * `connect(groupId)` mechanism.
 */
export function provideCrosshairSync(dashboardId: string): string {
  const groupId = `dashboard-${dashboardId}`
  connect(groupId)
  provide(CROSSHAIR_SYNC_KEY, groupId)

  onUnmounted(() => {
    disconnect(groupId)
  })

  return groupId
}

/**
 * Inject the crosshair sync group ID provided by a parent dashboard.
 * Returns `{ groupId: null }` when called outside a provider context
 * (e.g. in a standalone chart preview).
 */
export function useCrosshairSync(): { groupId: string | null } {
  const groupId = inject(CROSSHAIR_SYNC_KEY, null)
  return { groupId }
}
