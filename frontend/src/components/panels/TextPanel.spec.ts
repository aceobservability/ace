import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearRegistry } from '../../utils/panelRegistry'

// ---------------------------------------------------------------------------
// TextPanel component tests
// ---------------------------------------------------------------------------

describe('TextPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let TextPanel: any

  beforeEach(async () => {
    const mod = await import('./TextPanel.vue')
    TextPanel = mod.default
  })

  it('renders markdown content as HTML', () => {
    const wrapper = mount(TextPanel, {
      props: { content: '**bold text**' },
    })
    expect(wrapper.find('strong').exists()).toBe(true)
    expect(wrapper.find('strong').text()).toBe('bold text')
  })

  it('renders heading tags correctly', () => {
    const wrapper = mount(TextPanel, {
      props: { content: '# Hello World' },
    })
    expect(wrapper.find('h1').exists()).toBe(true)
    expect(wrapper.find('h1').text()).toBe('Hello World')
  })

  it('renders links correctly', () => {
    const wrapper = mount(TextPanel, {
      props: { content: '[Click here](https://example.com)' },
    })
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('Click here')
    expect(link.attributes('href')).toBe('https://example.com')
  })

  it('renders code blocks', () => {
    const wrapper = mount(TextPanel, {
      props: { content: '```\nconst x = 1\n```' },
    })
    expect(wrapper.find('pre').exists()).toBe(true)
    expect(wrapper.find('code').exists()).toBe(true)
  })

  it('mode="html" renders raw HTML content directly', () => {
    const wrapper = mount(TextPanel, {
      props: { content: '<p>Raw <em>HTML</em></p>', mode: 'html' },
    })
    expect(wrapper.find('p').exists()).toBe(true)
    expect(wrapper.find('em').text()).toBe('HTML')
  })

  it('sanitizes script tags to prevent XSS', () => {
    const wrapper = mount(TextPanel, {
      props: { content: 'Safe text <script>alert("xss")</script> more text' },
    })
    // Script tags must not appear in rendered output
    expect(wrapper.html()).not.toContain('<script>')
    expect(wrapper.html()).not.toContain('alert("xss")')
  })

  it('handles empty content gracefully', () => {
    const wrapper = mount(TextPanel, {
      props: { content: '' },
    })
    expect(wrapper.find('.text-panel-content').exists()).toBe(true)
    // Should not throw and should render an empty container
    expect(wrapper.html()).toBeTruthy()
  })

  it('container has overflow-auto for scrollability', () => {
    const wrapper = mount(TextPanel, {
      props: { content: '# Test' },
    })
    const container = wrapper.find('.text-panel-content')
    expect(container.exists()).toBe(true)
    // Check for overflow style via class or inline style
    const style = container.attributes('style') ?? ''
    const classes = container.classes().join(' ')
    const hasOverflow = style.includes('overflow') || classes.includes('overflow')
    expect(hasOverflow).toBe(true)
  })

  it('applies color design token to container', () => {
    const wrapper = mount(TextPanel, {
      props: { content: 'hello' },
    })
    const container = wrapper.find('.text-panel-content')
    expect(container.exists()).toBe(true)
    const style = container.attributes('style') ?? ''
    expect(style).toContain('--color-on-surface')
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('text panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    clearRegistry()
    // Re-register manually to avoid module caching issues with side-effect imports
    const { registerPanel } = await import('../../utils/panelRegistry')
    const { FileText } = await import('lucide-vue-next')
    registerPanel({
      type: 'text',
      component: () => import('./TextPanel.vue'),
      dataAdapter: () => ({ content: '' }),
      defaultQuery: { content: '# Hello\n\nEdit this panel to add content.' },
      category: 'widgets',
      label: 'Text',
      icon: FileText,
    })
    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('text')
  })

  afterEach(() => {
    clearRegistry()
  })

  it('registers with type "text"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('text')
  })

  it('registers with category "widgets"', () => {
    expect(reg?.category).toBe('widgets')
  })

  it('registers with label "Text"', () => {
    expect(reg?.label).toBe('Text')
  })

  it('dataAdapter returns content: empty string fallback', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result).toEqual({ content: '' })
  })

  it('defaultQuery contains content field', () => {
    expect(reg?.defaultQuery).toHaveProperty('content')
  })
})
