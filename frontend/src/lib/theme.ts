import { useThemeStore } from '@/stores/themeStore'

/** Apply stored theme preference (defaults to dark / Kinetic v2). */
export function bootstrapTheme() {
  useThemeStore.getState().initialize()
}