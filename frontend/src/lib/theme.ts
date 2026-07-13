/** Kinetic v2 is dark-only — ensure document root carries the dark class. */
export function bootstrapTheme() {
  document.documentElement.classList.add('dark')
}