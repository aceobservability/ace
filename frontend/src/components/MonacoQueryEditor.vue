<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import '../monaco/setupWorkers'
import * as monaco from 'monaco-editor'
import {
  LOGQL_LANGUAGE_ID,
  LOGSQL_LANGUAGE_ID,
  registerLogQueryLanguages,
  setLogQLIndexedLabels,
} from '../logquery/language'
import { useTheme } from '../composables/useTheme'
import { registerCompletionProvider } from '../promql/completionProvider'
import { registerHoverProvider } from '../promql/hoverProvider'
import { definePromQLLightTheme, definePromQLTheme, PROMQL_LANGUAGE_ID, registerPromQLLanguage } from '../promql/language'

type QueryLanguage = 'promql' | 'logql' | 'logsql'

function getMonacoLanguageId(language: QueryLanguage): string {
  if (language === 'logql') return LOGQL_LANGUAGE_ID
  if (language === 'logsql') return LOGSQL_LANGUAGE_ID
  return PROMQL_LANGUAGE_ID
}

// Initialize Monaco language support (only once)
let initialized = false
function initializeMonaco() {
  if (initialized) return
  initialized = true

  registerPromQLLanguage(monaco)
  definePromQLTheme(monaco)
  definePromQLLightTheme(monaco)
  registerCompletionProvider(monaco)
  registerHoverProvider(monaco)
  registerLogQueryLanguages(monaco)
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    height?: number
    placeholder?: string
    language?: QueryLanguage
    indexedLabels?: string[]
  }>(),
  {
    height: 100,
    placeholder: 'Enter PromQL query...',
    language: 'promql',
    indexedLabels: () => [],
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
}>()

const { isDark } = useTheme()

const containerRef = ref<HTMLElement | null>(null)
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
const isFocused = ref(false)
const showPlaceholder = computed(() => !props.modelValue && !isFocused.value)

// Create editor on mount
onMounted(() => {
  if (!containerRef.value) return

  // Initialize Monaco once
  initializeMonaco()

  // Create editor
  const editor = monaco.editor.create(containerRef.value, {
    value: props.modelValue,
    language: getMonacoLanguageId(props.language),
    theme: isDark.value ? 'promql-dark' : 'promql-light',
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
    // Fix autocomplete dropdown being clipped by container
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
    readOnly: props.disabled,
  })

  editorInstance.value = editor

  // Listen for content changes
  editor.onDidChangeModelContent(() => {
    const value = editor.getValue()
    if (value !== props.modelValue) {
      emit('update:modelValue', value)
    }
  })

  editor.onDidFocusEditorText(() => {
    isFocused.value = true
  })

  editor.onDidBlurEditorText(() => {
    isFocused.value = false
  })

  // Handle Ctrl+Enter to submit
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    emit('submit')
  })
})

// Clean up on unmount
onUnmounted(() => {
  if (editorInstance.value) {
    editorInstance.value.dispose()
    editorInstance.value = null
  }
})

// Sync external value changes to editor
watch(
  () => props.modelValue,
  (newValue) => {
    if (editorInstance.value && editorInstance.value.getValue() !== newValue) {
      editorInstance.value.setValue(newValue)
    }
  },
)

// Handle disabled state
watch(
  () => props.disabled,
  (disabled) => {
    if (editorInstance.value) {
      editorInstance.value.updateOptions({ readOnly: disabled })
    }
  },
)

// Handle height changes
watch(
  () => props.height,
  () => {
    if (editorInstance.value) {
      editorInstance.value.layout()
    }
  },
)

watch(
  () => props.language,
  (language) => {
    const model = editorInstance.value?.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, getMonacoLanguageId(language))
    }
  },
)

watch(isDark, (dark) => {
  monaco.editor.setTheme(dark ? 'promql-dark' : 'promql-light')
})

watch(
  () => props.indexedLabels,
  (labels) => {
    setLogQLIndexedLabels(labels)
  },
  { immediate: true },
)

// Focus the editor
function focus() {
  editorInstance.value?.focus()
}

// Expose methods
defineExpose({ focus })
</script>

<template>
  <div class="relative rounded-sm border border-border overflow-hidden bg-surface-raised transition-colors duration-200 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20" :class="{ 'opacity-60 pointer-events-none': disabled }">
    <div
      ref="containerRef"
      class="w-full min-h-[60px]"
      :style="{ height: `${height}px` }"
    ></div>
    <div v-if="showPlaceholder" class="absolute top-2 left-12 text-text-muted font-mono text-[13px] pointer-events-none">
      {{ placeholder }}
    </div>
  </div>
</template>

<!-- Monaco editor deep overrides (must stay non-scoped / not Tailwind) -->
<style>
.monaco-editor {
  border-radius: 2px;
}

.monaco-editor .margin {
  background: var(--color-surface-overlay) !important;
}

.monaco-editor .monaco-scrollable-element > .scrollbar > .slider {
  background: var(--color-border-strong) !important;
  border-radius: 2px;
}

.monaco-editor .monaco-scrollable-element > .scrollbar > .slider:hover {
  background: var(--color-text-muted) !important;
}

.monaco-editor .suggest-widget {
  border-radius: 2px !important;
}

.monaco-editor .suggest-widget .monaco-list-row.focused {
  background-color: var(--color-surface-overlay) !important;
}

.monaco-editor .monaco-hover {
  border-radius: 2px !important;
}
</style>

<!-- Global styles for Monaco overflow widgets (rendered at body level) -->
<style>
.monaco-editor .overflow-guard > .overflowingContentWidgets,
body > .monaco-editor-overlaymessage,
body > .monaco-aria-container {
  z-index: 9999 !important;
}

/* Style the fixed overflow widgets */
.overflowingContentWidgets .suggest-widget {
  background: var(--color-surface-raised) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 2px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}

.overflowingContentWidgets .suggest-widget .monaco-list-row.focused {
  background-color: var(--color-surface-overlay) !important;
}

.overflowingContentWidgets .suggest-widget .monaco-list-row:hover {
  background-color: var(--color-surface-overlay) !important;
}

.overflowingContentWidgets .monaco-hover {
  background: var(--color-surface-raised) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 2px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}

.overflowingContentWidgets .monaco-hover-content {
  padding: 8px 12px !important;
}
</style>
