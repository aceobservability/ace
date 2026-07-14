import {
  Activity,
  AlertTriangle,
  LayoutGrid,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { SidebarSectionId } from '@/lib/navigation'

export interface NavItem {
  id: SidebarSectionId
  label: string
  icon: LucideIcon
  colorVar: string
}

export interface SubNavItem {
  id: string
  label: string
  path: string
}

export const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Sparkles, colorVar: 'var(--color-primary)' },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutGrid, colorVar: 'var(--color-on-surface)' },
  { id: 'services', label: 'Services', icon: Activity, colorVar: 'var(--color-secondary)' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, colorVar: 'var(--color-error)' },
  { id: 'explore', label: 'Explore', icon: Search, colorVar: 'var(--color-tertiary)' },
]

export const sectionSubNav: Record<string, SubNavItem[]> = {
  dashboards: [],
  services: [{ id: 'all-services', label: 'All Services', path: '/app/services' }],
  alerts: [
    { id: 'active', label: 'Active', path: '/app/alerts' },
    { id: 'silenced', label: 'Silenced', path: '/app/alerts/silenced' },
    { id: 'rules', label: 'Rules', path: '/app/alerts/rules' },
  ],
  explore: [
    { id: 'metrics', label: 'Metrics', path: '/app/explore/metrics' },
    { id: 'logs', label: 'Logs', path: '/app/explore/logs' },
    { id: 'traces', label: 'Traces', path: '/app/explore/traces' },
  ],
  settings: [
    { id: 'general', label: 'General', path: '/app/settings/general' },
    { id: 'members', label: 'Members', path: '/app/settings/members' },
    { id: 'groups', label: 'Groups & Permissions', path: '/app/settings/groups' },
    { id: 'datasources', label: 'Data Sources', path: '/app/settings/datasources' },
    { id: 'ai', label: 'AI Configuration', path: '/app/settings/ai' },
    { id: 'sso', label: 'SSO / Auth', path: '/app/settings/sso' },
    { id: 'audit-log', label: 'Audit Log', path: '/app/audit-log' },
  ],
}

export const sectionRoutes: Record<SidebarSectionId, string> = {
  home: '/app',
  dashboards: '/app/dashboards',
  services: '/app/services',
  alerts: '/app/alerts',
  explore: '/app/explore/metrics',
  settings: '/app/settings',
}

export const sectionTypeMap: Record<string, FavoriteNavType> = {
  services: 'service',
  alerts: 'alert',
  explore: 'explore',
}

export type FavoriteNavType = 'dashboard' | 'service' | 'alert' | 'explore'