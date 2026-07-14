import * as monaco from 'monaco-editor'
import { useEffect, useId, useRef, useState } from 'react'
import '@/monaco/setupWorkers'
import { registerCompletionProvider } from '@/promql/completionProvider'
import { registerHoverProvider } from '@/promql/hoverProvider'
import {
  definePromQLLightTheme,
  definePromQLTheme,
  PROMQL_LANGUAGE_ID,
  registerPromQLLanguage,
} from '@/promql/language'
import { useThemeStore } from '@/stores/themeStore'
import '@/components/monaco-query-editor.css'

type QueryLanguage = 'promql' | 'logql' | 'logsql'

function getMonacoLanguageId(language: QueryLanguage): string {
  if (language === 'logql' || language === 'logsql') {
    return language
  }
  return PROMQL_LANGUAGE_ID
}

let initialized = false
function initializeMonaco() {
  if (initialized) return
  initialized = true

  registerPromQLLanguage(monaco)
  definePromQLTheme(monaco)
  definePromQLLightTheme(monaco)
  registerCompletionProvider(monaco)
  registerHoverProvider(monaco)
}

type MonacoQueryEditorProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  disabled?: boolean
  height?: number
  placeholder?: string
  language?: QueryLanguage
}

export function MonacoQueryEditor({
  value,
  onChange,
  onSubmit,
  disabled = false,
  height = 100,
  placeholder = 'Enter PromQL query...',
  language = 'promql',
}: MonacoQueryEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const isDark = useThemeStore(state => state.isDark)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])
  const [isFocused, setIsFocused] = useState(false)
  const placeholderId = useId()
  const showPlaceholder = !value && !isFocused

  // biome-ignore lint/correctness/useExhaustiveDependencies: Monaco editor is created once; theme/language/value sync in separate effects
  useEffect(() => {
    if (!containerRef.current) return

    initializeMonaco()

    const editor = monaco.editor.create(containerRef.current, {
      value,
      language: getMonacoLanguageId(language),
      theme: isDark ? 'promql-dark' : 'promql-light',
      minimap: { enabled: false },
      lineNumbers: 'on',
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
      padding: { top: 8, bottom: 8 },
      renderLineHighlight: 'line',
      lineHeight: 20,
      folding: false,
      glyphMargin: false,
      lineDecorationsWidth: 8,
      lineNumbersMinChars: 3,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      fixedOverflowWidgets: true,
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      suggest: {
        showIcons: true,
        showStatusBar: true,
        preview: true,
        previewMode: 'prefix',
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true,
      },
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      readOnly: disabled,
    })

    editorRef.current = editor

    const contentDisposable = editor.onDidChangeModelContent(() => {
      const nextValue = editor.getValue()
      onChangeRef.current(nextValue)
    })

    const focusDisposable = editor.onDidFocusEditorText(() => {
      setIsFocused(true)
    })

    const blurDisposable = editor.onDidBlurEditorText(() => {
      setIsFocused(false)
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onSubmitRef.current?.()
    })

    return () => {
      contentDisposable.dispose()
      focusDisposable.dispose()
      blurDisposable.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: disabled })
  }, [disabled])

  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value)
    }
  }, [value])

  useEffect(() => {
    monaco.editor.setTheme(isDark ? 'promql-dark' : 'promql-light')
  }, [isDark])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, getMonacoLanguageId(language))
    }
  }, [language])

  // biome-ignore lint/correctness/useExhaustiveDependencies: relayout when editor height prop changes
  useEffect(() => {
    editorRef.current?.layout()
  }, [height])

  return (
    <div
      className={`relative overflow-hidden rounded-sm bg-[var(--color-surface-container-low)] transition-colors duration-200 focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      data-testid="monaco-query-editor"
    >
      <div ref={containerRef} className="min-h-[60px] w-full" style={{ height: `${height}px` }} />
      {showPlaceholder ? (
        <div
          id={placeholderId}
          className="pointer-events-none absolute top-2 left-12 font-mono text-[13px] text-[var(--color-outline)]"
        >
          {placeholder}
        </div>
      ) : null}
    </div>
  )
}