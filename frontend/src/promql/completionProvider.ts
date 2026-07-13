import type * as Monaco from 'monaco-editor'
import { fetchLabels, fetchLabelValues, fetchMetrics } from '@/promql/client'
import { PROMQL_FUNCTIONS, PROMQL_KEYWORDS, PROMQL_LANGUAGE_ID } from './language'

// Cache for metrics and labels
interface MetadataCache {
  metrics: string[]
  labels: string[]
  labelValues: Map<string, string[]>
  lastFetch: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const cache: MetadataCache = {
  metrics: [],
  labels: [],
  labelValues: new Map(),
  lastFetch: 0,
}

// Debounce helper
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function debounce<T>(fn: () => Promise<T>, delay: number): Promise<T> {
  return new Promise((resolve, reject) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      fn().then(resolve).catch(reject)
    }, delay)
  })
}

// Load metrics if cache is stale
async function ensureMetrics(): Promise<string[]> {
  const now = Date.now()
  if (cache.metrics.length > 0 && now - cache.lastFetch < CACHE_TTL) {
    return cache.metrics
  }

  try {
    cache.metrics = await fetchMetrics()
    cache.lastFetch = now
  } catch (error) {
    console.error('Failed to fetch metrics:', error)
  }
  return cache.metrics
}

// Load labels if cache is stale
async function ensureLabels(): Promise<string[]> {
  const now = Date.now()
  if (cache.labels.length > 0 && now - cache.lastFetch < CACHE_TTL) {
    return cache.labels
  }

  try {
    cache.labels = await fetchLabels()
    cache.lastFetch = now
  } catch (error) {
    console.error('Failed to fetch labels:', error)
  }
  return cache.labels
}

// Load label values with debouncing
async function getLabelValues(labelName: string): Promise<string[]> {
  if (cache.labelValues.has(labelName)) {
    return cache.labelValues.get(labelName) || []
  }

  try {
    const values = await debounce(() => fetchLabelValues(labelName), 250)
    cache.labelValues.set(labelName, values)
    return values
  } catch (error) {
    console.error(`Failed to fetch values for label ${labelName}:`, error)
    return []
  }
}

// Determine context for completions
interface CompletionContext {
  type: 'metric' | 'function' | 'label' | 'labelValue' | 'keyword' | 'general'
  labelName?: string
}

function getCompletionContext(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): CompletionContext {
  const textUntilPosition = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })

  // Check if we're inside label selectors { }
  const lastOpenBrace = textUntilPosition.lastIndexOf('{')
  const lastCloseBrace = textUntilPosition.lastIndexOf('}')

  if (lastOpenBrace > lastCloseBrace) {
    // We're inside { }, determine if we need label name or value
    const textAfterBrace = textUntilPosition.slice(lastOpenBrace + 1)

    // Check if we just typed an operator (=, !=, =~, !~)
    const labelValueMatch = textAfterBrace.match(/(\w+)\s*(!?=~?)\s*["']?([^"',}]*)$/)
    if (labelValueMatch?.[2]) {
      const operator = labelValueMatch[2]
      const afterOperator = textAfterBrace
        .slice(textAfterBrace.lastIndexOf(operator) + operator.length)
        .trim()
      // If we have an operator and cursor is after it
      if (
        afterOperator.startsWith('"') ||
        afterOperator.startsWith("'") ||
        afterOperator === '' ||
        afterOperator.match(/^[^=!{},]+$/)
      ) {
        return { type: 'labelValue', labelName: labelValueMatch[1] }
      }
    }

    // Check if we need a label name
    const needsLabelName = textAfterBrace.match(/^[^=]*$/) || textAfterBrace.match(/,\s*[^=]*$/)
    if (needsLabelName) {
      return { type: 'label' }
    }

    return { type: 'labelValue', labelName: extractLabelName(textAfterBrace) }
  }

  // Check if we're after by/without/on/ignoring keywords (need label names)
  const keywordMatch = textUntilPosition.match(/\b(by|without|on|ignoring)\s*\(\s*[^)]*$/i)
  if (keywordMatch) {
    return { type: 'label' }
  }

  // Default: suggest metrics, functions, and keywords
  return { type: 'general' }
}

function extractLabelName(text: string): string | undefined {
  // Extract the last label name before an operator
  const match = text.match(/(\w+)\s*(!?=~?)\s*["']?[^"',}]*$/)
  return match?.[1]
}

// Create completion provider
function createCompletionProvider(monaco: typeof Monaco): Monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['{', ',', '=', '(', ' '],

    async provideCompletionItems(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
    ): Promise<Monaco.languages.CompletionList> {
      const context = getCompletionContext(model, position)
      const word = model.getWordUntilPosition(position)
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const suggestions: Monaco.languages.CompletionItem[] = []

      switch (context.type) {
        case 'metric':
        case 'general': {
          // Add metrics
          const metrics = await ensureMetrics()
          for (const metric of metrics) {
            suggestions.push({
              label: metric,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: metric,
              range,
              detail: 'Metric',
            })
          }

          // Add functions
          for (const [name, info] of Object.entries(PROMQL_FUNCTIONS)) {
            suggestions.push({
              label: name,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: `${name}($0)`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              detail: info.signature,
              documentation: info.description,
            })
          }

          // Add keywords
          for (const keyword of PROMQL_KEYWORDS) {
            suggestions.push({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: keyword,
              range,
              detail: 'Keyword',
            })
          }
          break
        }

        case 'label': {
          const labels = await ensureLabels()
          for (const label of labels) {
            suggestions.push({
              label,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: label,
              range,
              detail: 'Label',
            })
          }
          break
        }

        case 'labelValue': {
          if (context.labelName) {
            const values = await getLabelValues(context.labelName)
            for (const value of values) {
              suggestions.push({
                label: value,
                kind: monaco.languages.CompletionItemKind.Value,
                insertText: `"${value}"`,
                range,
                detail: `Value for ${context.labelName}`,
              })
            }
          }
          break
        }
      }

      return { suggestions }
    },
  }
}

// Register the completion provider
export function registerCompletionProvider(monaco: typeof Monaco) {
  monaco.languages.registerCompletionItemProvider(
    PROMQL_LANGUAGE_ID,
    createCompletionProvider(monaco),
  )
}
