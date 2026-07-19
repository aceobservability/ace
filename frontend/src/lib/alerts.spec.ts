import { describe, expect, it } from 'vitest'
import {
  formatAlertDuration,
  matcherOperator,
  ruleToYaml,
  stateToStatusDot,
} from '@/lib/alerts'
import type { VMAlertRule } from '@/types/datasource'

describe('alerts helpers', () => {
  it('maps alert states to status dots', () => {
    expect(stateToStatusDot('firing')).toBe('critical')
    expect(stateToStatusDot('pending')).toBe('warning')
    expect(stateToStatusDot('inactive')).toBe('healthy')
  })

  it('formats durations and matcher operators', () => {
    expect(formatAlertDuration(45)).toBe('45s')
    expect(formatAlertDuration(120)).toBe('2m')
    expect(matcherOperator({ name: 'a', value: 'b', isEqual: true, isRegex: false })).toBe('=')
    expect(matcherOperator({ name: 'a', value: 'b', isEqual: false, isRegex: true })).toBe('!~')
  })

  it('serializes rules to YAML', () => {
    const rule: VMAlertRule = {
      name: 'HighCPU',
      type: 'alerting',
      state: 'firing',
      query: 'cpu > 0.9',
      duration: 60,
      labels: { severity: 'critical' },
      annotations: { summary: 'CPU high' },
    }
    const yaml = ruleToYaml(rule, 'node.rules')
    expect(yaml).toContain('# group: node.rules')
    expect(yaml).toContain('- alert: HighCPU')
    expect(yaml).toContain('expr: cpu > 0.9')
    expect(yaml).toContain('for: 1m')
    expect(yaml).toContain('severity: "critical"')
  })
})
