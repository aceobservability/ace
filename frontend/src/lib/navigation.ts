export type SidebarSectionId =
  | 'home'
  | 'dashboards'
  | 'services'
  | 'alerts'
  | 'explore'
  | 'settings'

const ROUTE_SECTION_MAP: [string, SidebarSectionId][] = [
  ['/app/dashboards', 'dashboards'],
  ['/app/services', 'services'],
  ['/app/alerts', 'alerts'],
  ['/app/explore', 'explore'],
  ['/app/settings', 'settings'],
  ['/app/audit-log', 'settings'],
]

export const SHORTCUT_NAV: Record<string, { section: SidebarSectionId; route: string }> = {
  '1': { section: 'home', route: '/app' },
  '2': { section: 'dashboards', route: '/app/dashboards' },
  '3': { section: 'services', route: '/app/services' },
  '4': { section: 'alerts', route: '/app/alerts' },
  '5': { section: 'explore', route: '/app/explore/metrics' },
}

export function routeToSection(path: string): SidebarSectionId {
  for (const [prefix, section] of ROUTE_SECTION_MAP) {
    if (path.startsWith(prefix)) return section
  }
  if (path === '/app' || path === '/app/') return 'home'
  return 'home'
}