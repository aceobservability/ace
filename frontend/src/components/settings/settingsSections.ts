export const SETTINGS_SECTIONS = [
  'general',
  'members',
  'groups',
  'datasources',
  'ai',
  'sso',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return SETTINGS_SECTIONS.some(section => section === value)
}
