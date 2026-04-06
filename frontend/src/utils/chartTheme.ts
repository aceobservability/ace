/**
 * Kinetic visualization theme — centralized ECharts color and style tokens.
 *
 * All 16 chart panel types import from here to guarantee visual consistency.
 * Existing charts (LineChart, BarChart, etc.) are NOT migrated in this PR.
 */

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

/**
 * 10-color Kinetic data visualization palette.
 *
 * Ordering rules:
 * - Index 0 (Steel Blue) is the default series 1 color.
 * - Warm-orange family colors (Rust Orange @ 1, Heated Copper @ 9) are kept
 *   non-adjacent — they are separated by 7 other hues.
 * - Signal Brass (index 4) is reserved for emphasis / thresholds; it should
 *   not be the first automatic color assigned to a new series.
 */
export const chartPalette = [
  '#4D8BBD', // 0 — Steel Blue         (default series 1)
  '#C65D3A', // 1 — Rust Orange
  '#7A9E46', // 2 — Machine Olive
  '#8B6FB3', // 3 — Muted Violet
  '#D4A11E', // 4 — Signal Brass       (emphasis / thresholds only)
  '#3FA7A3', // 5 — Oxidized Teal
  '#CB6F8A', // 6 — Dusty Rose
  '#A7B0BA', // 7 — Alloy Silver       (supporting)
  '#6C7C94', // 8 — Slate Blue-Grey    (supporting)
  '#E07B39', // 9 — Heated Copper
] as const

// ---------------------------------------------------------------------------
// Threshold colors
// ---------------------------------------------------------------------------

export const thresholdColors = {
  good: '#4FAF78',
  warning: '#D4A11E',
  critical: '#D95C54',
} as const

// ---------------------------------------------------------------------------
// Convenience aliases used by Kinetic v2 components (from master)
// ---------------------------------------------------------------------------

export const chartColors = {
  grid: 'rgba(42,49,56,0.3)',
  label: '#8A847A',
  text: '#B8B2A7',
  tooltipBg: '#1E2429',
  tooltipBorder: 'rgba(58,68,78,0.4)',
  surface: '#111417',
  fontDisplay: 'Space Grotesk, DM Sans, sans-serif',
  fontBody: 'DM Sans, sans-serif',
  fontMono: 'JetBrains Mono, monospace',
} as const

// ---------------------------------------------------------------------------
// Shared ECharts style objects
// ---------------------------------------------------------------------------

/** Shared grid / border style for all chart types. */
export const chartGridStyle = {
  gridColor: 'rgba(71,72,74,0.15)', // --color-outline-variant at 15 %
  borderWidth: 0,
}

/** Shared tooltip appearance for all chart types. */
export const chartTooltipStyle = {
  backgroundColor: '#252830', // --color-surface-bright
  borderColor: 'rgba(71,72,74,0.15)',
  textStyle: {
    color: '#F5F5F4', // --color-on-surface
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
  },
}

/** Shared axis style (xAxis / yAxis) for all chart types. */
export const chartAxisStyle = {
  axisLine: {
    lineStyle: {
      color: 'rgba(71,72,74,0.15)',
    },
  },
  axisTick: {
    show: false,
  },
  axisLabel: {
    color: '#757578', // --color-outline
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
  },
  splitLine: {
    lineStyle: {
      color: 'rgba(71,72,74,0.15)',
    },
  },
}

/** Shared legend style for all chart types. */
export const chartLegendStyle = {
  textStyle: {
    color: '#A8A8A4', // --color-on-surface-variant
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
  },
}

// ---------------------------------------------------------------------------
// Crosshair pointer
// ---------------------------------------------------------------------------

/** Shared axisPointer style for cross-panel crosshair sync. */
export const crosshairPointerStyle = {
  lineStyle: {
    color: '#757578',
    width: 1,
    type: 'dashed' as const,
  },
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Returns the palette color for a given series index, wrapping around when
 * the index exceeds the palette length.
 */
export function getSeriesColor(index: number): string {
  return chartPalette[index % chartPalette.length]
}
