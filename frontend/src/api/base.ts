export function normalizeApiBase(apiUrl: string | undefined): string {
  const trimmed = apiUrl?.trim() ?? ''
  return trimmed.replace(/\/+$/, '')
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL)
