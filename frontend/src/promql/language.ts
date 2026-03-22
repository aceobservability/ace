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

// Define dark theme colors for PromQL - matches Stitch Kinetic design system
export function definePromQLTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme('promql-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '757578', fontStyle: 'italic' },
      { token: 'string', foreground: 'ffb148' },
      { token: 'string.escape', foreground: 'ffb148' },
      { token: 'string.invalid', foreground: 'ff6e84' },
      { token: 'number', foreground: 'a3a6ff' },
      { token: 'number.duration', foreground: 'a3a6ff', fontStyle: 'bold' },
      { token: 'operator', foreground: 'fdfbfe' },
      { token: 'keyword', foreground: 'a3a6ff', fontStyle: 'bold' },
      { token: 'function', foreground: '69f6b8' },
      { token: 'identifier', foreground: 'ababad' },
      { token: 'label', foreground: '58e7ab' },
    ],
    colors: {
      'editor.background': '#121316',
      'editor.foreground': '#fdfbfe',
      'editor.lineHighlightBackground': '#1e2022',
      'editor.lineHighlightBorder': '#1e2022',
      'editorCursor.foreground': '#a3a6ff',
      'editor.selectionBackground': '#1e2022',
      'editor.selectionHighlightBackground': '#1e2022',
      'editorLineNumber.foreground': '#757578',
      'editorLineNumber.activeForeground': '#ababad',
      'editorGutter.background': '#121316',
      'editorWidget.background': '#2b2c2f',
      'editorWidget.border': '#47484a',
      'editorSuggestWidget.background': '#2b2c2f',
      'editorSuggestWidget.border': '#47484a',
      'editorSuggestWidget.selectedBackground': '#1e2022',
      'editorSuggestWidget.highlightForeground': '#a3a6ff',
      'editorSuggestWidget.focusHighlightForeground': '#a3a6ff',
      'editorHoverWidget.background': '#2b2c2f',
      'editorHoverWidget.border': '#47484a',
      'scrollbarSlider.background': '#47484a',
      'scrollbarSlider.hoverBackground': '#757578',
      'scrollbarSlider.activeBackground': '#ababad',
      'input.background': '#1e2022',
      'input.border': '#47484a',
      'input.foreground': '#fdfbfe',
      'inputOption.activeBorder': '#a3a6ff',
      focusBorder: '#a3a6ff',
    },
  })
}
