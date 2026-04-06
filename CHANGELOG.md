# Changelog

## [0.9.1](https://github.com/aceobservability/ace/compare/v0.9.0...v0.9.1) (2026-04-06)


### Fixed

* Add shared SSRF protection package blocking requests to private/internal IPs, preventing server-side request forgery via user-controlled URLs in Grafana discovery and datasource connection checks
* Remove unused imports in useSidebar test file

## [0.9.0.1] - 2026-04-06

### Fixed
- Frontend Biome lint warnings: replaced `any` type annotations with proper types (`LucideIcon`, `DataSource`, `PanelType`)
- Frontend dead code: removed 11 unused exports, 11 unused exported types, and 3 unused files
- Backend gofmt formatting in 4 files
- Backend staticcheck: converted bare switch to tagged switch in `errorType()`

### Removed
- `ImportFidelityReport.vue`, `useGrafanaImport.ts`, `dashboardTemplates/index.ts` (unused dead code)
- `UserSettingsView.vue` from knip ignore list (no longer needed)

## [0.9.0](https://github.com/aceobservability/ace/compare/v0.8.0...v0.9.0) (2026-03-24)


### Features

* fix Cmd+K datasource tools and add full metrics/logs/traces support ([#149](https://github.com/aceobservability/ace/issues/149)) ([8ac4cf8](https://github.com/aceobservatory/ace/commit/8ac4cf88a6a5e0cd175b1a0bb7161cbf04f0971b))
