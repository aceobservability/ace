import { describe, it, expect } from 'vitest'
import { isMetricsType, isLogsType, isTracingType, isAlertingType, dataSourceTypeLabels } from './datasource'
import type { DataSourceType } from './datasource'

describe('datasource types', () => {
  describe('isMetricsType', () => {
    it('returns true for prometheus', () => {
      expect(isMetricsType('prometheus')).toBe(true)
    })

    it('returns true for victoriametrics', () => {
      expect(isMetricsType('victoriametrics')).toBe(true)
    })

    it('returns false for loki', () => {
      expect(isMetricsType('loki')).toBe(false)
    })

    it('returns false for victorialogs', () => {
      expect(isMetricsType('victorialogs')).toBe(false)
    })

    it('returns false for tempo', () => {
      expect(isMetricsType('tempo')).toBe(false)
    })

    it('returns true for clickhouse', () => {
      expect(isMetricsType('clickhouse')).toBe(true)
    })

    it('returns true for cloudwatch', () => {
      expect(isMetricsType('cloudwatch')).toBe(true)
    })

    it('returns true for elasticsearch', () => {
      expect(isMetricsType('elasticsearch')).toBe(true)
    })
  })

  describe('isLogsType', () => {
    it('returns true for loki', () => {
      expect(isLogsType('loki')).toBe(true)
    })

    it('returns true for victorialogs', () => {
      expect(isLogsType('victorialogs')).toBe(true)
    })

    it('returns false for prometheus', () => {
      expect(isLogsType('prometheus')).toBe(false)
    })

    it('returns false for victoriametrics', () => {
      expect(isLogsType('victoriametrics')).toBe(false)
    })

    it('returns false for victoriatraces', () => {
      expect(isLogsType('victoriatraces')).toBe(false)
    })

    it('returns true for clickhouse', () => {
      expect(isLogsType('clickhouse')).toBe(true)
    })

    it('returns true for cloudwatch', () => {
      expect(isLogsType('cloudwatch')).toBe(true)
    })

    it('returns true for elasticsearch', () => {
      expect(isLogsType('elasticsearch')).toBe(true)
    })
  })

  describe('isTracingType', () => {
    it('returns true for tempo', () => {
      expect(isTracingType('tempo')).toBe(true)
    })

    it('returns true for victoriatraces', () => {
      expect(isTracingType('victoriatraces')).toBe(true)
    })

    it('returns false for loki', () => {
      expect(isTracingType('loki')).toBe(false)
    })

    it('returns true for clickhouse', () => {
      expect(isTracingType('clickhouse')).toBe(true)
    })

    it('returns false for elasticsearch', () => {
      expect(isTracingType('elasticsearch')).toBe(false)
    })
  })

  describe('isAlertingType', () => {
    it('returns true for vmalert', () => {
      expect(isAlertingType('vmalert')).toBe(true)
    })

    it('returns true for alertmanager', () => {
      expect(isAlertingType('alertmanager')).toBe(true)
    })

    it('returns false for prometheus', () => {
      expect(isAlertingType('prometheus')).toBe(false)
    })
  })

  describe('dataSourceTypeLabels', () => {
    it('has labels for all types', () => {
      const types: DataSourceType[] = [
        'prometheus',
        'loki',
        'victorialogs',
        'victoriametrics',
        'tempo',
        'victoriatraces',
        'clickhouse',
        'cloudwatch',
        'elasticsearch',
        'vmalert',
        'alertmanager',
      ]
      for (const type_ of types) {
        expect(dataSourceTypeLabels[type_]).toBeDefined()
        expect(typeof dataSourceTypeLabels[type_]).toBe('string')
      }
    })

    it('returns correct label for prometheus', () => {
      expect(dataSourceTypeLabels.prometheus).toBe('Prometheus')
    })

    it('returns correct label for loki', () => {
      expect(dataSourceTypeLabels.loki).toBe('Loki')
    })

    it('returns correct label for victorialogs', () => {
      expect(dataSourceTypeLabels.victorialogs).toBe('Victoria Logs')
    })

    it('returns correct label for victoriametrics', () => {
      expect(dataSourceTypeLabels.victoriametrics).toBe('VictoriaMetrics')
    })

    it('returns correct label for tempo', () => {
      expect(dataSourceTypeLabels.tempo).toBe('Tempo')
    })

    it('returns correct label for victoriatraces', () => {
      expect(dataSourceTypeLabels.victoriatraces).toBe('VictoriaTraces')
    })

    it('returns correct label for clickhouse', () => {
      expect(dataSourceTypeLabels.clickhouse).toBe('ClickHouse')
    })

    it('returns correct label for cloudwatch', () => {
      expect(dataSourceTypeLabels.cloudwatch).toBe('CloudWatch')
    })

    it('returns correct label for elasticsearch', () => {
      expect(dataSourceTypeLabels.elasticsearch).toBe('Elasticsearch')
    })

    it('returns correct label for vmalert', () => {
      expect(dataSourceTypeLabels.vmalert).toBe('VMAlert')
    })

    it('returns correct label for alertmanager', () => {
      expect(dataSourceTypeLabels.alertmanager).toBe('AlertManager')
    })
  })
})
