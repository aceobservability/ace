/** Returns a same-origin relative path safe for client-side navigation, or null. */
export function safeRedirectPath(path: string | null | undefined): string | null {
  if (!path) return null
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return null
  }
  return path
}