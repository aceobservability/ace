import { describe, expect, it } from 'vitest'
import {
  chartAxisStyle,
  chartGridStyle,
  chartLegendStyle,
  chartPalette,
  chartTooltipStyle,
  getSeriesColor,
  thresholdColors,
} from './chartTheme'

describe('chartPalette', () => {
  it('exports exactly 10 colors', () => {
    expect(chartPalette).toHaveLength(10)
  })

  it('index 0 is Steel Blue #4D8BBD (not the brand primary color)', () => {
    expect(chartPalette[0]).toBe('#4D8BBD')
  })

  it('index 1 is Rust Orange #C65D3A', () => {
    expect(chartPalette[1]).toBe('#C65D3A')
  })

  it('index 2 is Machine Olive #7A9E46', () => {
    expect(chartPalette[2]).toBe('#7A9E46')
  })

  it('index 3 is Muted Violet #8B6FB3', () => {
    expect(chartPalette[3]).toBe('#8B6FB3')
  })

  it('index 4 is Signal Brass #D4A11E', () => {
    expect(chartPalette[4]).toBe('#D4A11E')
  })

  it('index 5 is Oxidized Teal #3FA7A3', () => {
    expect(chartPalette[5]).toBe('#3FA7A3')
  })

  it('index 6 is Dusty Rose #CB6F8A', () => {
    expect(chartPalette[6]).toBe('#CB6F8A')
  })

  it('index 7 is Alloy Silver #A7B0BA', () => {
    expect(chartPalette[7]).toBe('#A7B0BA')
  })

  it('index 8 is Slate Blue-Grey #6C7C94', () => {
    expect(chartPalette[8]).toBe('#6C7C94')
  })

  it('index 9 is Heated Copper #E07B39', () => {
    expect(chartPalette[9]).toBe('#E07B39')
  })

  it('no two warm-orange family colors are adjacent (indices 1 and 9 are not adjacent)', () => {
    // Rust Orange (#C65D3A) is at index 1, Heated Copper (#E07B39) is at index 9
    // They should not be at consecutive positions in the array
    const rustOrangeIdx = chartPalette.indexOf('#C65D3A')
    const heatedCopperIdx = chartPalette.indexOf('#E07B39')
    expect(Math.abs(rustOrangeIdx - heatedCopperIdx)).toBeGreaterThan(1)
  })

  it('all entries are valid hex color strings', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/
    for (const color of chartPalette) {
      expect(color).toMatch(hexPattern)
    }
  })
})

describe('thresholdColors', () => {
  it('has good, warning, and critical keys', () => {
    expect(thresholdColors).toHaveProperty('good')
    expect(thresholdColors).toHaveProperty('warning')
    expect(thresholdColors).toHaveProperty('critical')
  })

  it('good is #4FAF78', () => {
    expect(thresholdColors.good).toBe('#4FAF78')
  })

  it('warning is #D4A11E', () => {
    expect(thresholdColors.warning).toBe('#D4A11E')
  })

  it('critical is #D95C54', () => {
    expect(thresholdColors.critical).toBe('#D95C54')
  })
})

describe('getSeriesColor', () => {
  it('getSeriesColor(0) returns the first palette color', () => {
    expect(getSeriesColor(0)).toBe(chartPalette[0])
  })

  it('getSeriesColor(9) returns the last palette color', () => {
    expect(getSeriesColor(9)).toBe(chartPalette[9])
  })

  it('getSeriesColor(10) wraps around to the first palette color', () => {
    expect(getSeriesColor(10)).toBe(chartPalette[0])
  })

  it('getSeriesColor(11) wraps around to the second palette color', () => {
    expect(getSeriesColor(11)).toBe(chartPalette[1])
  })

  it('getSeriesColor(20) wraps around correctly for double length', () => {
    expect(getSeriesColor(20)).toBe(chartPalette[0])
  })
})

describe('chartGridStyle', () => {
  it('has expected structure', () => {
    expect(chartGridStyle).toMatchObject({
      gridColor: 'rgba(71,72,74,0.15)',
      borderWidth: 0,
    })
  })

  it('gridColor is the outline-variant color at 15% opacity', () => {
    expect(chartGridStyle.gridColor).toBe('rgba(71,72,74,0.15)')
  })

  it('borderWidth is 0', () => {
    expect(chartGridStyle.borderWidth).toBe(0)
  })
})

describe('chartTooltipStyle', () => {
  it('has expected structure with DM Sans font', () => {
    expect(chartTooltipStyle).toMatchObject({
      backgroundColor: '#252830',
      borderColor: 'rgba(71,72,74,0.15)',
      textStyle: {
        color: '#F5F5F4',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
      },
    })
  })

  it('backgroundColor is surface-bright #252830', () => {
    expect(chartTooltipStyle.backgroundColor).toBe('#252830')
  })

  it('textStyle uses DM Sans', () => {
    expect(chartTooltipStyle.textStyle.fontFamily).toBe("'DM Sans', sans-serif")
  })

  it('textStyle fontSize is 13', () => {
    expect(chartTooltipStyle.textStyle.fontSize).toBe(13)
  })

  it('textStyle color is on-surface #F5F5F4', () => {
    expect(chartTooltipStyle.textStyle.color).toBe('#F5F5F4')
  })
})

describe('chartAxisStyle', () => {
  it('has expected structure with JetBrains Mono font', () => {
    expect(chartAxisStyle).toMatchObject({
      axisLine: {
        lineStyle: {
          color: 'rgba(71,72,74,0.15)',
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: '#757578',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(71,72,74,0.15)',
        },
      },
    })
  })

  it('axisLabel uses JetBrains Mono', () => {
    expect(chartAxisStyle.axisLabel.fontFamily).toBe("'JetBrains Mono', monospace")
  })

  it('axisLabel color is outline #757578', () => {
    expect(chartAxisStyle.axisLabel.color).toBe('#757578')
  })

  it('axisLabel fontSize is 10', () => {
    expect(chartAxisStyle.axisLabel.fontSize).toBe(10)
  })

  it('axisTick is hidden', () => {
    expect(chartAxisStyle.axisTick.show).toBe(false)
  })

  it('splitLine uses the outline-variant color', () => {
    expect(chartAxisStyle.splitLine.lineStyle.color).toBe('rgba(71,72,74,0.15)')
  })
})

describe('chartLegendStyle', () => {
  it('has expected structure', () => {
    expect(chartLegendStyle).toMatchObject({
      textStyle: {
        color: '#A8A8A4',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
      },
    })
  })

  it('textStyle color is on-surface-variant #A8A8A4', () => {
    expect(chartLegendStyle.textStyle.color).toBe('#A8A8A4')
  })

  it('textStyle uses DM Sans', () => {
    expect(chartLegendStyle.textStyle.fontFamily).toBe("'DM Sans', sans-serif")
  })

  it('textStyle fontSize is 13', () => {
    expect(chartLegendStyle.textStyle.fontSize).toBe(13)
  })
})
