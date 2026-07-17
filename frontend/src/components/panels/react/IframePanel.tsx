type IframePanelProps = {
  url?: string
  title?: string
}

export function IframePanel({ url = '', title = 'Embedded content' }: IframePanelProps) {
  if (!url.trim()) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center text-sm"
        data-testid="iframe-panel-empty"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        <div className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          No URL configured
        </div>
        <div className="max-w-sm text-xs leading-5">
          Set a URL in the panel query to embed an external page.
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden" data-testid="iframe-panel">
      <iframe
        src={url}
        title={title}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        data-testid="iframe-panel-frame"
      />
    </div>
  )
}
