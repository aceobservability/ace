<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    content: string
    mode?: 'markdown' | 'html'
  }>(),
  {
    mode: 'markdown',
  },
)

const renderedHtml = computed(() => {
  let html: string

  if (props.mode === 'html') {
    html = props.content
  } else {
    // marked.parse returns string | Promise<string>; in sync mode it's always string
    html = marked.parse(props.content) as string
  }

  // Sanitize to prevent XSS — strip script tags and dangerous attributes
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  })
})

const containerStyle = {
  color: 'var(--color-on-surface)',
  overflow: 'auto',
  height: '100%',
  width: '100%',
  padding: '1rem',
  fontFamily: 'DM Sans, sans-serif',
}
</script>

<template>
  <div
    class="text-panel-content"
    :style="containerStyle"
    v-html="renderedHtml"
  />
</template>

<style scoped>
.text-panel-content :deep(h1),
.text-panel-content :deep(h2),
.text-panel-content :deep(h3),
.text-panel-content :deep(h4),
.text-panel-content :deep(h5),
.text-panel-content :deep(h6) {
  color: var(--color-on-surface);
  font-family: 'DM Sans', sans-serif;
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.text-panel-content :deep(p) {
  color: var(--color-on-surface);
  font-family: 'DM Sans', sans-serif;
  margin-bottom: 0.75em;
  line-height: 1.6;
}

.text-panel-content :deep(a) {
  color: var(--color-primary);
  text-decoration: underline;
}

.text-panel-content :deep(a:hover) {
  opacity: 0.8;
}

.text-panel-content :deep(code) {
  font-family: 'JetBrains Mono', monospace;
  background: var(--color-surface-container-high);
  color: var(--color-on-surface);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.875em;
}

.text-panel-content :deep(pre) {
  background: var(--color-surface-container-high);
  border-radius: 6px;
  padding: 1em;
  overflow-x: auto;
  margin-bottom: 1em;
}

.text-panel-content :deep(pre code) {
  background: transparent;
  padding: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875em;
}

.text-panel-content :deep(ul),
.text-panel-content :deep(ol) {
  color: var(--color-on-surface);
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}

.text-panel-content :deep(li) {
  margin-bottom: 0.25em;
  line-height: 1.6;
}

.text-panel-content :deep(blockquote) {
  border-left: 3px solid var(--color-primary);
  margin: 0.5em 0;
  padding-left: 1em;
  color: var(--color-on-surface-variant);
}

.text-panel-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-surface-container-high);
  margin: 1em 0;
}

.text-panel-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
}

.text-panel-content :deep(th),
.text-panel-content :deep(td) {
  border: 1px solid var(--color-surface-container-high);
  padding: 0.5em 0.75em;
  text-align: left;
  color: var(--color-on-surface);
}

.text-panel-content :deep(th) {
  background: var(--color-surface-container-high);
  font-weight: 600;
}
</style>
