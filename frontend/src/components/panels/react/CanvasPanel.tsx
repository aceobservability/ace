import '@excalidraw/excalidraw/index.css'
import { Lock, Unlock } from 'lucide-react'
import { useCallback, useEffect, useState, type ComponentType } from 'react'

export type CanvasData = {
  elements: unknown[]
  appState?: unknown
}

type CanvasPanelProps = {
  data?: CanvasData
  readOnly?: boolean
  onChange?: (data: CanvasData) => void
}

// Excalidraw is large; load lazily and fall back if unavailable in tests.
let ExcalidrawComponent: ComponentType<Record<string, unknown>> | null = null
let excalidrawLoadPromise: Promise<void> | null = null

function loadExcalidraw(): Promise<void> {
  if (ExcalidrawComponent) return Promise.resolve()
  if (excalidrawLoadPromise) return excalidrawLoadPromise

  excalidrawLoadPromise = import('@excalidraw/excalidraw')
    .then(mod => {
      ExcalidrawComponent = mod.Excalidraw as ComponentType<Record<string, unknown>>
    })
    .catch(() => {
      ExcalidrawComponent = null
    })

  return excalidrawLoadPromise
}

function safeAppState(appState: unknown): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  const saved = (appState ?? {}) as Record<string, unknown>
  for (const key of ['viewBackgroundColor', 'gridSize', 'gridStep', 'gridModeEnabled'] as const) {
    if (saved[key] !== undefined) {
      safe[key] = saved[key]
    }
  }
  return safe
}

export function CanvasPanel({
  data = { elements: [] },
  readOnly = false,
  onChange,
}: CanvasPanelProps) {
  const [editing, setEditing] = useState(false)
  const [ready, setReady] = useState(!!ExcalidrawComponent)
  const [failed, setFailed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadExcalidraw().then(() => {
      if (cancelled) return
      if (ExcalidrawComponent) {
        setReady(true)
      } else {
        setFailed(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown) => {
      if (!mounted) {
        setMounted(true)
        return
      }
      const persistedAppState = {
        viewBackgroundColor: (appState as Record<string, unknown>)?.viewBackgroundColor,
        gridSize: (appState as Record<string, unknown>)?.gridSize,
      }
      onChange?.({ elements: [...elements], appState: persistedAppState })
    },
    [mounted, onChange],
  )

  if (failed) {
    return (
      <div
        className="flex h-full min-h-[300px] w-full items-center justify-center"
        data-testid="canvas-panel-error"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        <p>Canvas editor failed to load</p>
      </div>
    )
  }

  if (!ready || !ExcalidrawComponent) {
    return (
      <div
        className="flex h-full min-h-[300px] w-full items-center justify-center text-sm"
        data-testid="canvas-panel-loading"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        Loading canvas...
      </div>
    )
  }

  const Excalidraw = ExcalidrawComponent

  return (
    <div className="relative h-full min-h-[300px] w-full" data-testid="canvas-panel">
      <div className="h-full w-full overflow-hidden" data-testid="canvas-container">
        <Excalidraw
          initialData={{
            elements: data.elements ?? [],
            appState: safeAppState(data.appState),
          }}
          viewModeEnabled={readOnly || !editing}
          onChange={handleChange}
          theme="dark"
        />
      </div>

      {!editing ? (
        <div
          data-testid="canvas-lock-overlay"
          className="absolute inset-0 z-10 cursor-default"
        />
      ) : null}

      {!readOnly ? (
        <button
          type="button"
          data-testid="canvas-edit-toggle"
          title={editing ? 'Lock canvas' : 'Edit canvas'}
          className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-md border-0 px-2.5 py-1 text-xs font-medium"
          style={{
            backgroundColor: editing ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
            color: editing ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
            opacity: editing ? 1 : 0.7,
            cursor: 'pointer',
          }}
          onClick={event => {
            event.stopPropagation()
            setEditing(value => !value)
            setMounted(false)
          }}
        >
          {editing ? <Unlock size={14} /> : <Lock size={14} />}
          {editing ? 'Lock' : 'Edit'}
        </button>
      ) : null}
    </div>
  )
}
