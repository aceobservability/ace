export const chartPalette = [
  '#4D8BBD', // Steel Blue (viz-0, default series 1)
  '#C65D3A', // Rust Orange
  '#7A9E46', // Machine Olive
  '#8B6FB3', // Muted Violet
  '#D4A11E', // Signal Brass (emphasis/thresholds)
  '#3FA7A3', // Oxidized Teal
  '#CB6F8A', // Dusty Rose
  '#A7B0BA', // Alloy Silver
  '#6C7C94', // Slate Blue-Grey
  '#E07B39', // Heated Copper
] as const

export function getSeriesColor(index: number): string {
  return chartPalette[index % chartPalette.length]
}

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

export const thresholdColors = {
  good: '#4FAF78',
  warning: '#D4A11E',
  critical: '#D95C54',
} as const
