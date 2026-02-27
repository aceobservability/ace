# Copilot Markdown & Resizable Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full markdown rendering with syntax-highlighted code blocks to the copilot chat, and make the panel resizable via drag.

**Architecture:** Replace the regex-based `formatMessage()` with `marked` (markdown parser) + `shiki` (syntax highlighter) + `DOMPurify` (sanitization). Use `@tailwindcss/typography` for prose styling. Add a native drag handle on the panel's left edge with a `useResizable` composable.

**Tech Stack:** Vue 3, Tailwind CSS v4, marked, shiki, DOMPurify, @tailwindcss/typography

---

### Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install production dependencies**

Run: `cd frontend && pnpm add marked shiki dompurify @tailwindcss/typography`

**Step 2: Install type definitions**

Run: `cd frontend && pnpm add -D @types/dompurify`

**Step 3: Verify installation**

Run: `cd frontend && pnpm ls marked shiki dompurify @tailwindcss/typography`
Expected: All four packages listed

**Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat: add markdown rendering dependencies (marked, shiki, dompurify, typography)"
```

---

### Task 2: Enable @tailwindcss/typography plugin and add prose overrides

**Files:**
- Modify: `frontend/src/style.css` (add plugin import + prose overrides)

**Step 1: Add the typography plugin import**

At the top of `frontend/src/style.css`, after `@import "tailwindcss";`, add:

```css
@plugin "@tailwindcss/typography";
```

**Step 2: Add scoped prose overrides for copilot messages**

Add these styles at the end of `frontend/src/style.css`, inside a new `@layer components` block. These override the typography plugin's defaults to match the app's color tokens:

```css
/* Copilot message prose overrides */
@layer components {
  .copilot-prose {
    --tw-prose-body: var(--color-text-primary);
    --tw-prose-headings: var(--color-text-primary);
    --tw-prose-bold: var(--color-text-primary);
    --tw-prose-links: var(--color-accent);
    --tw-prose-code: var(--color-accent);
    --tw-prose-pre-bg: var(--color-surface-base);
    --tw-prose-pre-code: var(--color-text-primary);
    --tw-prose-quotes: var(--color-text-secondary);
    --tw-prose-quote-borders: var(--color-border-strong);
    --tw-prose-counters: var(--color-text-muted);
    --tw-prose-bullets: var(--color-text-muted);
    --tw-prose-th-borders: var(--color-border-strong);
    --tw-prose-td-borders: var(--color-border);
    --tw-prose-hr: var(--color-border);
  }

  .copilot-prose pre {
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
  }

  .copilot-prose code:not(pre code) {
    background: var(--color-surface-overlay);
    border-radius: 0.25rem;
    padding: 0.125rem 0.375rem;
    font-size: 0.8em;
    font-weight: 500;
  }

  .copilot-prose code:not(pre code)::before,
  .copilot-prose code:not(pre code)::after {
    content: none;
  }

  .copilot-prose table {
    font-size: 0.8rem;
  }

  .copilot-prose img {
    border-radius: 0.375rem;
  }
}
```

**Step 3: Verify build still works**

Run: `cd frontend && pnpm build`
Expected: Build completes successfully

**Step 4: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat: add tailwind typography plugin and copilot prose overrides"
```

---

### Task 3: Create markdown rendering utility

**Files:**
- Create: `frontend/src/utils/markdown.ts`

**Step 1: Create the markdown utility**

Create `frontend/src/utils/markdown.ts` with the following:

```typescript
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
```

**Step 2: Verify types**

Run: `cd frontend && pnpm type-check`
Expected: No type errors

**Step 3: Commit**

```bash
git add frontend/src/utils/markdown.ts
git commit -m "feat: add markdown rendering utility with shiki syntax highlighting"
```

---

### Task 4: Write test for markdown utility

**Files:**
- Create: `frontend/src/utils/markdown.spec.ts`

**Step 1: Write the test**

```typescript
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders bold text', async () => {
    const result = await renderMarkdown('**bold**')
    expect(result).toContain('<strong>')
    expect(result).toContain('bold')
  })

  it('renders italic text', async () => {
    const result = await renderMarkdown('*italic*')
    expect(result).toContain('<em>')
    expect(result).toContain('italic')
  })

  it('renders inline code', async () => {
    const result = await renderMarkdown('use `SELECT *` here')
    expect(result).toContain('<code>')
    expect(result).toContain('SELECT *')
  })

  it('renders code blocks with syntax highlighting', async () => {
    const result = await renderMarkdown('```sql\nSELECT * FROM table\n```')
    expect(result).toContain('shiki')
    expect(result).toContain('SELECT')
  })

  it('renders tables', async () => {
    const md = '| Col A | Col B |\n|-------|-------|\n| 1     | 2     |'
    const result = await renderMarkdown(md)
    expect(result).toContain('<table>')
    expect(result).toContain('<th>')
    expect(result).toContain('Col A')
  })

  it('renders unordered lists', async () => {
    const result = await renderMarkdown('- item 1\n- item 2')
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
  })

  it('renders headings', async () => {
    const result = await renderMarkdown('## Heading')
    expect(result).toContain('<h2')
    expect(result).toContain('Heading')
  })

  it('renders links', async () => {
    const result = await renderMarkdown('[click](https://example.com)')
    expect(result).toContain('<a')
    expect(result).toContain('https://example.com')
  })

  it('sanitizes dangerous HTML', async () => {
    const result = await renderMarkdown('<script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
  })

  it('falls back gracefully for unknown code languages', async () => {
    const result = await renderMarkdown('```unknownlang\ncode here\n```')
    expect(result).toContain('code here')
  })
})
```

**Step 2: Run tests**

Run: `cd frontend && pnpm test -- src/utils/markdown.spec.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add frontend/src/utils/markdown.spec.ts
git commit -m "test: add markdown rendering utility tests"
```

---

### Task 5: Integrate markdown rendering into CopilotPanel

**Files:**
- Modify: `frontend/src/components/CopilotPanel.vue:1-17` (imports)
- Modify: `frontend/src/components/CopilotPanel.vue:53-56` (add rendered messages cache)
- Modify: `frontend/src/components/CopilotPanel.vue:203-215` (remove formatMessage, add renderMarkdown watcher)
- Modify: `frontend/src/components/CopilotPanel.vue:374-379` (assistant message template)

**Step 1: Add imports**

At the top of the `<script setup>` block (line 14), add:

```typescript
import { initMarkdown, renderMarkdown } from '../utils/markdown'
```

**Step 2: Add rendered HTML cache**

After the `messagesContainer` ref (line 55), add:

```typescript
const renderedMessages = ref<Map<number, string>>(new Map())
```

**Step 3: Initialize shiki on mount**

Inside the existing `onMounted` (line 58), add `await initMarkdown()` early in the function body — before `checkConnection()` is fine.

**Step 4: Add a watcher to render markdown for assistant messages**

Replace the `formatMessage` function (lines 203-215) with a watcher that renders markdown for assistant messages:

```typescript
watch(
  messages,
  async (msgs) => {
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      if (msg.role !== 'assistant' || !msg.content) continue
      const cached = renderedMessages.value.get(i)
      // Re-render if content changed (streaming) or not cached
      if (!cached || cached !== msg.content) {
        const html = await renderMarkdown(msg.content)
        renderedMessages.value.set(i, msg.content)
        renderedMessages.value.set(-i - 1, html) // store html at negative key
      }
    }
  },
  { deep: true },
)

function getRenderedHtml(index: number): string {
  return (renderedMessages.value.get(-index - 1) as string) || ''
}
```

Actually, a simpler approach — use a computed-like reactive Map keyed by index:

```typescript
const renderedHtml = ref<Record<number, string>>({})

watch(
  messages,
  async (msgs) => {
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      if (msg.role !== 'assistant' || !msg.content) continue
      renderedHtml.value[i] = await renderMarkdown(msg.content)
    }
  },
  { deep: true },
)
```

**Step 5: Update the assistant message template**

Replace the assistant message div (lines 375-379) inner content:

From:
```vue
<div class="rounded bg-surface-overlay px-3 py-2 text-sm text-text-primary">
  <div v-html="formatMessage(msg.content)" />
</div>
```

To:
```vue
<div class="copilot-prose prose prose-sm max-w-none rounded bg-surface-overlay px-3 py-2 text-sm text-text-primary">
  <div v-if="renderedHtml[index]" v-html="renderedHtml[index]" />
  <span v-else>{{ msg.content }}</span>
</div>
```

**Step 6: Remove the old `formatMessage` function**

Delete lines 203-215 (the `formatMessage` function). It's fully replaced by the markdown pipeline.

**Step 7: Verify build**

Run: `cd frontend && pnpm build`
Expected: Build succeeds, no type errors

**Step 8: Commit**

```bash
git add frontend/src/components/CopilotPanel.vue
git commit -m "feat: integrate full markdown rendering into copilot messages"
```

---

### Task 6: Add resizable panel

**Files:**
- Modify: `frontend/src/components/CopilotPanel.vue:257` (panel container + drag handle)
- Modify: `frontend/src/App.vue:67-73` (remove fixed width, bind reactive width)

**Step 1: Add resize state and handlers to CopilotPanel**

In the `<script setup>` section, after the existing refs (~line 56), add:

```typescript
const panelWidth = ref(320)
const isResizing = ref(false)
const MIN_WIDTH = 280
const MAX_WIDTH_RATIO = 0.5

function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startWidth = panelWidth.value

  function onMouseMove(e: MouseEvent) {
    // Panel is on the right, so dragging left increases width
    const delta = startX - e.clientX
    const newWidth = Math.min(
      Math.max(startWidth + delta, MIN_WIDTH),
      window.innerWidth * MAX_WIDTH_RATIO,
    )
    panelWidth.value = newWidth
  }

  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

defineExpose({ panelWidth })
```

**Step 2: Update the panel container template**

Replace line 257:

From:
```vue
<div class="flex flex-col h-screen w-80 shrink-0 bg-surface-raised border-l border-border sticky top-0">
```

To:
```vue
<div
  class="relative flex flex-col h-screen shrink-0 bg-surface-raised border-l border-border sticky top-0"
  :style="{ width: panelWidth + 'px' }"
>
  <!-- Resize handle -->
  <div
    class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-accent/30 transition-colors"
    :class="{ 'bg-accent/30': isResizing }"
    @mousedown="startResize"
  />
```

Note: The closing `</div>` for the resize handle is self-contained (it's just the handle bar). The panel's existing closing `</div>` on line 477 remains unchanged.

**Step 3: Verify build**

Run: `cd frontend && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/components/CopilotPanel.vue frontend/src/App.vue
git commit -m "feat: add resizable copilot panel with drag handle"
```

---

### Task 7: Manual verification

**Step 1: Start the dev server**

Run: `cd frontend && pnpm dev`

**Step 2: Test markdown rendering**

Send test messages to the copilot that exercise all markdown features:
- `**bold** and *italic*`
- `` `inline code` ``
- Code block with ```sql
- A markdown table
- A bulleted list
- A heading (`## Test`)
- A link

Verify each renders correctly in both light and dark mode.

**Step 3: Test panel resizing**

- Hover over the left edge of the panel — cursor should change to `col-resize`
- Click and drag left — panel should grow
- Click and drag right — panel should shrink
- Verify it stops at minimum width (~280px)
- Verify it stops at 50% viewport width
- Verify the main content area adjusts accordingly

**Step 4: Run full test suite**

Run: `cd frontend && pnpm test`
Expected: All tests pass (existing + new markdown tests)

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address markdown/resize issues from manual testing"
```
