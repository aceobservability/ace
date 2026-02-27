# Copilot Panel: Markdown Support & Resizable Panel

## Problem

The CopilotPanel currently uses regex-based formatting that only handles code blocks and inline code. Markdown features like tables, bold, italic, lists, headings, blockquotes, and links are broken. The panel is also fixed at 320px with no way to resize.

## Design

### Markdown Rendering

**Dependencies:** `marked`, `shiki`, `DOMPurify`, `@tailwindcss/typography`

**Approach:**
- Replace `formatMessage()` regex with `marked.parse()` + shiki syntax highlighting
- Initialize shiki with dual-theme highlighter (light + dark) on component mount
- Use marked's custom renderer to delegate code blocks to shiki
- Wrap assistant messages in a `prose` container via `@tailwindcss/typography`
- Scope prose styles to match existing color tokens (accent, text, surface colors)
- Sanitize HTML output with DOMPurify before passing to `v-html`

**Message flow:** `msg.content` -> `marked.parse()` (shiki for code blocks) -> `DOMPurify.sanitize()` -> `v-html`

### Resizable Panel

**Dependencies:** None (native implementation)

**Approach:**
- Replace fixed `w-80` with reactive `width` ref (default 320px)
- Add 4px drag handle on the left edge of the panel
- Handle `mousedown`/`mousemove`/`mouseup` for drag resizing
- Constraints: min 280px, max 50% viewport width
- Cursor changes to `col-resize` while dragging
- Width applied via inline style binding

## Files Changed

- `frontend/src/components/CopilotPanel.vue` — markdown renderer, drag handle, reactive width
- `frontend/src/App.vue` — remove fixed width class, bind reactive width
- `frontend/src/style.css` — prose/typography overrides for theme colors
- `frontend/package.json` — new dependencies
