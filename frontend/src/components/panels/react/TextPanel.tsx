import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

type TextPanelProps = {
  content?: string
  mode?: 'markdown' | 'html'
}

export function TextPanel({ content = '', mode = 'markdown' }: TextPanelProps) {
  const renderedHtml = useMemo(() => {
    const html = mode === 'html' ? content : (marked.parse(content) as string)
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
    })
  }, [content, mode])

  return (
    <div
      className="text-panel-content h-full w-full overflow-auto p-4"
      data-testid="text-panel"
      style={{
        color: 'var(--color-on-surface)',
        fontFamily: 'DM Sans, sans-serif',
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized with DOMPurify
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  )
}
