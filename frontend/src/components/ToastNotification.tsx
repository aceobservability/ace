import { useToastStore } from '@/stores/toastStore'

const borderColorMap: Record<string, string> = {
  success: 'var(--color-secondary)',
  error: 'var(--color-error)',
  info: 'var(--color-primary)',
}

export function ToastNotification() {
  const toasts = useToastStore(state => state.toasts)
  const dismiss = useToastStore(state => state.dismiss)

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-60 flex flex-col gap-3"
      style={{ zIndex: 60 }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="animate-fade-in pointer-events-auto max-w-sm rounded-lg px-4 py-3 shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface-bright)',
            borderLeft: `4px solid ${borderColorMap[toast.type] || 'var(--color-primary)'}`,
            color: 'var(--color-on-surface)',
          }}
          role="alert"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{toast.message}</span>
            <button
              type="button"
              className="shrink-0 text-xs opacity-60 transition-opacity hover:opacity-100"
              style={{ color: 'var(--color-on-surface-variant)' }}
              onClick={() => dismiss(toast.id)}
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}