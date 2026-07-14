import { useEffect, useMemo, useRef } from 'react'
import { registerKeydownHandler } from '@/lib/globalKeyboard'
import { useKeyboardShortcutsStore } from '@/lib/keyboardShortcuts'

export function ShortcutsOverlay() {
  const dialogRef = useRef<HTMLDivElement>(null)
  const showHelp = useKeyboardShortcutsStore(state => state.showHelp)
  const shortcuts = useKeyboardShortcutsStore(state => state.shortcuts)
  const setShowHelp = useKeyboardShortcutsStore(state => state.setShowHelp)

  useEffect(() => {
    if (showHelp) {
      dialogRef.current?.focus()
    }
  }, [showHelp])

  useEffect(() => {
    if (!showHelp) return
    return registerKeydownHandler(event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setShowHelp(false)
        return true
      }
      return false
    })
  }, [showHelp, setShowHelp])


  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, typeof shortcuts> = {}
    for (const shortcut of shortcuts) {
      groups[shortcut.category] ??= []
      groups[shortcut.category].push(shortcut)
    }
    return groups
  }, [shortcuts])

  if (!showHelp) return null

  function close() {
    setShowHelp(false)
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close keyboard shortcuts"
        className="fixed inset-0 z-50 cursor-default border-none p-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={close}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        className="fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-6 shadow-2xl outline-none"
        onKeyDown={handleKeydown}
        style={{
          maxWidth: '480px',
          backgroundColor: 'color-mix(in srgb, var(--color-surface-container-highest) 85%, transparent)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="m-0 text-lg font-semibold"
            style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }}
          >
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            className="cursor-pointer rounded-md border-none p-1 text-sm"
            style={{ color: 'var(--color-on-surface-variant)', backgroundColor: 'transparent' }}
            onClick={close}
          >
            &times;
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {Object.entries(groupedShortcuts).map(([category, items]) => (
            <div key={category}>
              <h3
                className="mt-0 mb-2 text-xs font-semibold tracking-wider uppercase"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                {category}
              </h3>
              <div className="flex flex-col gap-1">
                {items.map(shortcut => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between rounded-md px-2 py-1.5"
                  >
                    <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                      {shortcut.label}
                    </span>
                    <kbd
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs"
                      style={{
                        backgroundColor: 'var(--color-surface-container)',
                        color: 'var(--color-on-surface-variant)',
                        border: '1px solid var(--color-outline-variant)',
                      }}
                    >
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}