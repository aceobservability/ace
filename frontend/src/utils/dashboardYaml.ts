/** Backend dashboard CaC schema version (flat document root). */
export const DASHBOARD_YAML_VERSION = 2

export function normalizeYamlValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

/**
 * Validate a dashboard YAML document against the backend v2 flat schema:
 *   version: 2
 *   title: ...
 *   description: ...   # optional
 *   panels: [...]      # required key (may be empty)
 */
export function validateDashboardYaml(rawYaml: string): string | null {
  if (!rawYaml.trim()) {
    return 'YAML content is required'
  }

  const versionMatch = rawYaml.match(/(?:^|\n)version:\s*(\d+)/)
  if (!versionMatch) {
    return 'Missing version'
  }
  if (versionMatch[1] !== String(DASHBOARD_YAML_VERSION)) {
    return `Unsupported version ${versionMatch[1]} (expected ${DASHBOARD_YAML_VERSION})`
  }

  const titleMatch = rawYaml.match(/(?:^|\n)title:\s*(.+)/)
  if (!titleMatch || !normalizeYamlValue(titleMatch[1] ?? '')) {
    return 'Missing dashboard title'
  }

  // panels may be an empty list (`panels: []`) or a block list (`panels:\n  - ...`).
  const panelsMatch = rawYaml.match(/(?:^|\n)panels:\s*(?:\n|\[)/)
  if (!panelsMatch) {
    return 'Missing panels section'
  }

  return null
}

export function extractYamlTitleAndDescription(
  rawYaml: string,
  fallbackTitle = '',
): { title: string; description: string } {
  const titleMatch = rawYaml.match(/(?:^|\n)title:\s*(.+)/)
  const descriptionMatch = rawYaml.match(/(?:^|\n)description:\s*(.+)/)

  return {
    title: normalizeYamlValue(titleMatch?.[1] ?? fallbackTitle),
    description: normalizeYamlValue(descriptionMatch?.[1] ?? ''),
  }
}

export type DashboardYamlPreview = {
  title: string
  description: string
  panelCount: number
}

/** Lightweight preview for import UIs. Throws on missing version/title. */
export function buildDashboardYamlPreview(rawYaml: string): DashboardYamlPreview {
  const versionMatch = rawYaml.match(/(?:^|\n)version:\s*(.+)/)
  if (!versionMatch) {
    throw new Error('Missing version')
  }

  const { title, description } = extractYamlTitleAndDescription(rawYaml)
  if (!title) {
    throw new Error(titleMatchMissing(rawYaml) ? 'Missing dashboard title' : 'Dashboard title is empty')
  }

  const panelsSectionMatch = rawYaml.match(
    /(?:^|\n)panels:\s*\n([\s\S]*?)(?=\n[a-zA-Z_][\w-]*:\s*|\s*$)/,
  )
  const panelCount = (panelsSectionMatch?.[1]?.match(/(?:^|\n)\s{2}-\s+/g) ?? []).length

  return { title, description, panelCount }
}

function titleMatchMissing(rawYaml: string): boolean {
  return !/(?:^|\n)title:\s*/.test(rawYaml)
}
