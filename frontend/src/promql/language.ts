import type * as Monaco from 'monaco-editor'

export const PROMQL_LANGUAGE_ID = 'promql'

// PromQL functions documentation
export const PROMQL_FUNCTIONS: Record<string, { signature: string; description: string }> = {
  // Aggregation operators
  sum: {
    signature: 'sum(v vector) vector',
    description: 'Calculate sum over dimensions',
  },
  avg: {
    signature: 'avg(v vector) vector',
    description: 'Calculate the average over dimensions',
  },
  min: {
    signature: 'min(v vector) vector',
    description: 'Select minimum over dimensions',
  },
  max: {
    signature: 'max(v vector) vector',
    description: 'Select maximum over dimensions',
  },
  count: {
    signature: 'count(v vector) vector',
    description: 'Count number of elements in the vector',
  },
  stddev: {
    signature: 'stddev(v vector) vector',
    description: 'Calculate population standard deviation over dimensions',
  },
  stdvar: {
    signature: 'stdvar(v vector) vector',
    description: 'Calculate population standard variance over dimensions',
  },
  topk: {
    signature: 'topk(k scalar, v vector) vector',
    description: 'Select largest k elements by sample value',
  },
  bottomk: {
    signature: 'bottomk(k scalar, v vector) vector',
    description: 'Select smallest k elements by sample value',
  },
  count_values: {
    signature: 'count_values(label string, v vector) vector',
    description: 'Count number of elements with the same value',
  },
  quantile: {
    signature: 'quantile(φ scalar, v vector) vector',
    description: 'Calculate φ-quantile (0 ≤ φ ≤ 1) over dimensions',
  },

  // Functions
  rate: {
    signature: 'rate(v range-vector) vector',
    description:
      'Calculate the per-second average rate of increase of the time series in the range vector',
  },
  irate: {
    signature: 'irate(v range-vector) vector',
    description:
      'Calculate the per-second instant rate of increase of the time series based on the last two data points',
  },
  increase: {
    signature: 'increase(v range-vector) vector',
    description: 'Calculate the increase in the time series in the range vector',
  },
  delta: {
    signature: 'delta(v range-vector) vector',
    description:
      'Calculate the difference between the first and last value of each time series element',
  },
  idelta: {
    signature: 'idelta(v range-vector) vector',
    description: 'Calculate the difference between the last two samples',
  },
  deriv: {
    signature: 'deriv(v range-vector) vector',
    description: 'Calculate the per-second derivative using simple linear regression',
  },
  predict_linear: {
    signature: 'predict_linear(v range-vector, t scalar) vector',
    description: 'Predict the value of time series t seconds from now',
  },
  histogram_quantile: {
    signature: 'histogram_quantile(φ scalar, b vector) vector',
    description: 'Calculate the φ-quantile from a histogram',
  },

  // Math functions
  abs: {
    signature: 'abs(v vector) vector',
    description: 'Return absolute value',
  },
  ceil: {
    signature: 'ceil(v vector) vector',
    description: 'Round up to nearest integer',
  },
  floor: {
    signature: 'floor(v vector) vector',
    description: 'Round down to nearest integer',
  },
  round: {
    signature: 'round(v vector, to_nearest=1 scalar) vector',
    description: 'Round to nearest integer (or specified multiple)',
  },
  sqrt: {
    signature: 'sqrt(v vector) vector',
    description: 'Calculate square root',
  },
  exp: {
    signature: 'exp(v vector) vector',
    description: 'Calculate exponential function',
  },
  ln: {
    signature: 'ln(v vector) vector',
    description: 'Calculate natural logarithm',
  },
  log2: {
    signature: 'log2(v vector) vector',
    description: 'Calculate binary logarithm',
  },
  log10: {
    signature: 'log10(v vector) vector',
    description: 'Calculate decimal logarithm',
  },
  clamp: {
    signature: 'clamp(v vector, min scalar, max scalar) vector',
    description: 'Clamp samples to min/max values',
  },
  clamp_min: {
    signature: 'clamp_min(v vector, min scalar) vector',
    description: 'Clamp samples to minimum value',
  },
  clamp_max: {
    signature: 'clamp_max(v vector, max scalar) vector',
    description: 'Clamp samples to maximum value',
  },

  // Time functions
  time: {
    signature: 'time() scalar',
    description: 'Return the number of seconds since January 1, 1970 UTC',
  },
  timestamp: {
    signature: 'timestamp(v vector) vector',
    description: 'Return the timestamp of each sample',
  },
  day_of_month: {
    signature: 'day_of_month(v vector) vector',
    description: 'Return the day of the month for each sample timestamp (1-31)',
  },
  day_of_week: {
    signature: 'day_of_week(v vector) vector',
    description: 'Return the day of the week for each sample timestamp (0-6)',
  },
  day_of_year: {
    signature: 'day_of_year(v vector) vector',
    description: 'Return the day of the year for each sample timestamp (1-366)',
  },
  hour: {
    signature: 'hour(v vector) vector',
    description: 'Return the hour of the day for each sample timestamp (0-23)',
  },
  minute: {
    signature: 'minute(v vector) vector',
    description: 'Return the minute of the hour for each sample timestamp (0-59)',
  },
  month: {
    signature: 'month(v vector) vector',
    description: 'Return the month of the year for each sample timestamp (1-12)',
  },
  year: {
    signature: 'year(v vector) vector',
    description: 'Return the year for each sample timestamp',
  },

  // Label functions
  label_join: {
    signature:
      'label_join(v vector, dst_label string, separator string, src_label_1 string, ...) vector',
    description: 'Join label values together',
  },
  label_replace: {
    signature:
      'label_replace(v vector, dst_label string, replacement string, src_label string, regex string) vector',
    description: 'Replace label values with regex',
  },

  // Other functions
  absent: {
    signature: 'absent(v vector) vector',
    description: 'Return 1 if vector is empty, otherwise return nothing',
  },
  absent_over_time: {
    signature: 'absent_over_time(v range-vector) vector',
    description: 'Return 1 if range vector is empty, otherwise return nothing',
  },
  changes: {
    signature: 'changes(v range-vector) vector',
    description: 'Return number of times the value changed within the range',
  },
  resets: {
    signature: 'resets(v range-vector) vector',
    description: 'Return number of counter resets within the range',
  },
  sort: {
    signature: 'sort(v vector) vector',
    description: 'Sort by ascending sample value',
  },
  sort_desc: {
    signature: 'sort_desc(v vector) vector',
    description: 'Sort by descending sample value',
  },
  vector: {
    signature: 'vector(s scalar) vector',
    description: 'Return scalar as a vector with no labels',
  },
  scalar: {
    signature: 'scalar(v vector) scalar',
    description: 'Return single-element vector as scalar',
  },
}

// PromQL keywords
export const PROMQL_KEYWORDS = [
  'by',
  'without',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'bool',
  'offset',
  'and',
  'or',
  'unless',
]

// Register PromQL language with Monaco
export function registerPromQLLanguage(monaco: typeof Monaco) {
  // Register the language
  monaco.languages.register({ id: PROMQL_LANGUAGE_ID })

  // Set language configuration
  monaco.languages.setLanguageConfiguration(PROMQL_LANGUAGE_ID, {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })

  // Set tokenizer for syntax highlighting
  monaco.languages.setMonarchTokensProvider(PROMQL_LANGUAGE_ID, {
    keywords: PROMQL_KEYWORDS,
    functions: Object.keys(PROMQL_FUNCTIONS),

    tokenizer: {
      root: [
        // Comments
        [/#.*$/, 'comment'],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
        [/'([^'\\]|\\.)*$/, 'string.invalid'], // non-terminated string
        [/"/, 'string', '@string_double'],
        [/'/, 'string', '@string_single'],

        // Numbers
        [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],

        // Duration literals
        [/\d+[smhdwy]/, 'number.duration'],

        // Operators
        [/[=!<>]=?|[+\-*/%^]|=~|!~/, 'operator'],

        // Brackets
        [/[{}()[\]]/, '@brackets'],

        // Labels
        [/[a-zA-Z_][a-zA-Z0-9_]*(?=\s*[=!~])/, 'label'],

        // Functions and keywords
        [
          /[a-zA-Z_][a-zA-Z0-9_]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@functions': 'function',
              '@default': 'identifier',
            },
          },
        ],
      ],

      string_double: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],

      string_single: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, 'string', '@pop'],
      ],
    },
  })
}

// Define light theme colors for PromQL - matches app light design tokens
export function definePromQLLightTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme('promql-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'string', foreground: 'b45309' },
      { token: 'string.escape', foreground: 'b45309' },
      { token: 'string.invalid', foreground: 'e11d48' },
      { token: 'number', foreground: '0369a1' },
      { token: 'number.duration', foreground: '0369a1', fontStyle: 'bold' },
      { token: 'operator', foreground: '334155' },
      { token: 'keyword', foreground: '0284c7', fontStyle: 'bold' },
      { token: 'function', foreground: '059669' },
      { token: 'identifier', foreground: '2563eb' },
      { token: 'label', foreground: '0891b2' },
    ],
    colors: {
      'editor.background': '#f9fafb',
      'editor.foreground': '#1e293b',
      'editor.lineHighlightBackground': '#f1f5f9',
      'editor.lineHighlightBorder': '#e2e8f0',
      'editorCursor.foreground': '#059669',
      'editor.selectionBackground': '#dbeafe',
      'editor.selectionHighlightBackground': '#e0f2fe',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#64748b',
      'editorGutter.background': '#f9fafb',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#e2e8f0',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#e2e8f0',
      'editorSuggestWidget.selectedBackground': '#f1f5f9',
      'editorSuggestWidget.highlightForeground': '#059669',
      'editorSuggestWidget.focusHighlightForeground': '#059669',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#e2e8f0',
      'scrollbarSlider.background': '#cbd5e1',
      'scrollbarSlider.hoverBackground': '#94a3b8',
      'scrollbarSlider.activeBackground': '#64748b',
      'input.background': '#ffffff',
      'input.border': '#e2e8f0',
      'input.foreground': '#1e293b',
      'inputOption.activeBorder': '#059669',
      focusBorder: '#059669',
    },
  })
}

// Define dark theme colors for PromQL - matches Kinetic v2 design system
export function definePromQLTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme('promql-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8A847A', fontStyle: 'italic' },
      { token: 'string', foreground: 'D4A11E' },
      { token: 'string.escape', foreground: 'D4A11E' },
      { token: 'string.invalid', foreground: 'D95C54' },
      { token: 'number', foreground: '4D8BBD' },
      { token: 'number.duration', foreground: '4D8BBD', fontStyle: 'bold' },
      { token: 'operator', foreground: 'F3F1EA' },
      { token: 'keyword', foreground: '4D8BBD', fontStyle: 'bold' },
      { token: 'function', foreground: '4FAF78' },
      { token: 'identifier', foreground: 'B8B2A7' },
      { token: 'label', foreground: '3D9062' },
    ],
    colors: {
      'editor.background': '#111417',
      'editor.foreground': '#F3F1EA',
      'editor.lineHighlightBackground': '#171B1F',
      'editor.lineHighlightBorder': '#171B1F',
      'editorCursor.foreground': '#C9960F',
      'editor.selectionBackground': '#171B1F',
      'editor.selectionHighlightBackground': '#171B1F',
      'editorLineNumber.foreground': '#8A847A',
      'editorLineNumber.activeForeground': '#B8B2A7',
      'editorGutter.background': '#111417',
      'editorWidget.background': '#1E2429',
      'editorWidget.border': '#3A444E',
      'editorSuggestWidget.background': '#1E2429',
      'editorSuggestWidget.border': '#3A444E',
      'editorSuggestWidget.selectedBackground': '#171B1F',
      'editorSuggestWidget.highlightForeground': '#C9960F',
      'editorSuggestWidget.focusHighlightForeground': '#C9960F',
      'editorHoverWidget.background': '#1E2429',
      'editorHoverWidget.border': '#3A444E',
      'scrollbarSlider.background': '#3A444E',
      'scrollbarSlider.hoverBackground': '#8A847A',
      'scrollbarSlider.activeBackground': '#B8B2A7',
      'input.background': '#171B1F',
      'input.border': '#3A444E',
      'input.foreground': '#F3F1EA',
      'inputOption.activeBorder': '#C9960F',
      focusBorder: '#C9960F',
    },
  })
}
