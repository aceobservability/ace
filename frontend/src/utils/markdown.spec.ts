/**
 * @vitest-environment jsdom
 */
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
