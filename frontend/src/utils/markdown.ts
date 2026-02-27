import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { type BuiltinTheme, type Highlighter, createHighlighter } from 'shiki'

let highlighterInstance: Highlighter | null = null
let highlighterPromise: Promise<Highlighter> | null = null

const PRELOADED_LANGS = [
  'sql', 'javascript', 'typescript', 'json', 'yaml', 'bash',
  'python', 'go', 'html', 'css', 'markdown', 'shell', 'text',
  'promql',
]

const LIGHT_THEME: BuiltinTheme = 'github-light'
const DARK_THEME: BuiltinTheme = 'github-dark'

async function getHighlighter(): Promise<Highlighter> {
  if (highlighterInstance) return highlighterInstance
  if (highlighterPromise) return highlighterPromise

  highlighterPromise = createHighlighter({
    themes: [LIGHT_THEME, DARK_THEME],
    langs: PRELOADED_LANGS,
  })

  highlighterInstance = await highlighterPromise
  return highlighterInstance
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

export async function initMarkdown(): Promise<void> {
  await getHighlighter()
}

export async function renderMarkdown(content: string): Promise<string> {
  const hl = await getHighlighter()
  const marked = new Marked()

  marked.use({
    renderer: {
      code({ text, lang }) {
        const language = lang || 'text'
        try {
          const loadedLangs = hl.getLoadedLanguages()
          if (!loadedLangs.includes(language)) {
            return `<pre class="shiki"><code>${escapeHtml(text)}</code></pre>`
          }
          return hl.codeToHtml(text, {
            lang: language,
            theme: isDarkMode() ? DARK_THEME : LIGHT_THEME,
          })
        } catch {
          return `<pre class="shiki"><code>${escapeHtml(text)}</code></pre>`
        }
      },
    },
  })

  const html = await marked.parse(content)
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['span'],
    ADD_ATTR: ['style', 'class'],
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
