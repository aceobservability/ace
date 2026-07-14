import { type RefObject, useEffect } from 'react'

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
  callback: () => void,
  excludeRefs: RefObject<HTMLElement | null>[] = [],
): void {
  useEffect(() => {
    if (!enabled) return

    function handler(event: PointerEvent) {
      const target = event.target as Node
      if (excludeRefs.some(exclude => exclude.current?.contains(target))) return
      if (ref.current && !ref.current.contains(target)) {
        callback()
      }
    }

    document.addEventListener('pointerdown', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
    }
  }, [ref, enabled, callback, excludeRefs])
}