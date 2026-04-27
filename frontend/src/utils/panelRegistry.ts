import type { Component } from 'vue'
import type { RawQueryResult } from '../types/panel'

export type { RawQueryResult }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelCategory = 'charts' | 'stats' | 'observability' | 'widgets'

/** Describes what data a panel needs from the editor. */
export type PanelQueryMode = 'metrics' | 'logs' | 'traces' | 'none'

/** Communicates whether a registered panel is fully wired or still needs setup/work. */
export type PanelSupportStatus = 'ready' | 'setup_required' | 'unsupported'

export interface PanelEmptyState {
  title: string
  description: string
  actionLabel?: string
}

export interface PanelRegistration {
  /** Unique identifier, e.g. 'heatmap' */
  type: string
  /** Lazy-loaded Vue component factory */
  component: () => Promise<Component>
  /** Transforms raw query result into chart-specific option data */
  dataAdapter: (raw: RawQueryResult, query?: Record<string, unknown>) => Record<string, unknown>
  /** Default query object shown in the panel editor */
  defaultQuery: Record<string, unknown>
  category: PanelCategory
  /** Human-readable display name, e.g. "Heatmap" */
  label: string
  /** Lucide icon component */
  icon: Component
  /** What data/signal this panel requires. Defaults to 'metrics' when omitted. */
  queryMode?: PanelQueryMode
  /** Optional support status for panels that should not look fully live/wired. */
  supportStatus?: PanelSupportStatus
  /** Actionable empty-state copy used when the panel has no live backend integration/data. */
  emptyState?: PanelEmptyState
}

// ---------------------------------------------------------------------------
// Internal storage
// ---------------------------------------------------------------------------

const registry = new Map<string, PanelRegistration>()

const byLabel = (a: PanelRegistration, b: PanelRegistration) => a.label.localeCompare(b.label)

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Registers a panel type.
 * Throws if a panel with the same `type` is already registered.
 */
export function registerPanel(registration: PanelRegistration): void {
  if (registry.has(registration.type)) {
    throw new Error(`Panel type "${registration.type}" is already registered`)
  }
  registry.set(registration.type, registration)
}

/**
 * Returns the registration for `type`, or `null` if not found.
 */
export function lookupPanel(type: string): PanelRegistration | null {
  return registry.get(type) ?? null
}

/**
 * Returns all panels belonging to `category`, sorted alphabetically by label.
 */
export function getPanelsByCategory(category: PanelCategory): PanelRegistration[] {
  return Array.from(registry.values())
    .filter((p) => p.category === category)
    .sort(byLabel)
}

/**
 * Returns all registered panels sorted alphabetically by label.
 */
export function getAllPanels(): PanelRegistration[] {
  return Array.from(registry.values()).sort(byLabel)
}

/**
 * Returns `true` if `type` has been registered.
 */
export function isRegisteredPanel(type: string): boolean {
  return registry.has(type)
}

/**
 * Clears all registrations. Intended for use in tests only.
 */
export function clearRegistry(): void {
  registry.clear()
}
