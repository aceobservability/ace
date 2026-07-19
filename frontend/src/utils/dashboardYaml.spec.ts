import { describe, expect, it } from 'vitest'
import {
  buildDashboardYamlPreview,
  DASHBOARD_YAML_VERSION,
  extractYamlTitleAndDescription,
  validateDashboardYaml,
} from './dashboardYaml'

describe('validateDashboardYaml', () => {
  it('accepts flat v2 documents', () => {
    const yaml = `version: ${DASHBOARD_YAML_VERSION}
title: Prod
description: Overview
panels: []
`
    expect(validateDashboardYaml(yaml)).toBeNull()
  })

  it('rejects nested v1 schema', () => {
    const yaml = `schema_version: 1
dashboard:
  title: Nested
  panels: []
`
    expect(validateDashboardYaml(yaml)).toBe('Missing version')
  })

  it('rejects wrong version', () => {
    const yaml = `version: 1
title: Old
panels: []
`
    expect(validateDashboardYaml(yaml)).toContain('Unsupported version')
  })

  it('requires panels key', () => {
    const yaml = `version: 2
title: No panels
`
    expect(validateDashboardYaml(yaml)).toBe('Missing panels section')
  })
})

describe('extractYamlTitleAndDescription', () => {
  it('reads top-level title and description', () => {
    const yaml = `version: 2
title: "API Latency"
description: 'Service health'
panels: []
`
    expect(extractYamlTitleAndDescription(yaml)).toEqual({
      title: 'API Latency',
      description: 'Service health',
    })
  })
})

describe('buildDashboardYamlPreview', () => {
  it('counts block-list panels', () => {
    const yaml = `version: 2
title: Imported
panels:
  - title: Requests
    type: line_chart
  - title: Errors
    type: stat
`
    expect(buildDashboardYamlPreview(yaml)).toEqual({
      title: 'Imported',
      description: '',
      panelCount: 2,
    })
  })
})
