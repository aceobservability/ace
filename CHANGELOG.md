# Changelog

## [0.11.0](https://github.com/aceobservability/ace/compare/v0.10.0...v0.11.0) (2026-04-06)


### Features

* add Helm chart CI publishing and Artifact Hub metadata ([#191](https://github.com/aceobservability/ace/issues/191)) ([d5c2d07](https://github.com/aceobservability/ace/commit/d5c2d070ba2cf081a2b840bdce5d6f31a29299af))


### Bug Fixes

* update repo references from janhoon to aceobservability ([#189](https://github.com/aceobservability/ace/issues/189)) ([bbbc396](https://github.com/aceobservability/ace/commit/bbbc396890f14f4c9a1ab24052ab6c42d6f1365d))

## [0.10.0](https://github.com/aceobservability/ace/compare/v0.9.0...v0.10.0) (2026-04-06)


### Features

* add structured HTTP request logging with zap ([#156](https://github.com/aceobservability/ace/issues/156)) ([c3f0669](https://github.com/aceobservability/ace/commit/c3f0669065b6384db56ba2d0c88da86df570ec80))
* chart types expansion — Tier 2 (5 observability panel types) ([#151](https://github.com/aceobservability/ace/issues/151)) ([e4b806b](https://github.com/aceobservability/ace/commit/e4b806bfc21a26ee9d327614d4aa8e4fe5720171))
* chart types expansion — Tier 3 (5 completeness panel types) ([#154](https://github.com/aceobservability/ace/issues/154)) ([42bbdbf](https://github.com/aceobservability/ace/commit/42bbdbf7193a808a9075d7fa9cee92ca8f2d389b))
* enterprise auth phase 2 — Okta SSO, group-to-role mapping, admin UI ([#157](https://github.com/aceobservability/ace/issues/157)) ([164249f](https://github.com/aceobservability/ace/commit/164249fd813175aac8327bfbece69263f871707f))
* Grafana auto-discovery, AI sidebar, template variables, and demo infra ([7f8e3da](https://github.com/aceobservability/ace/commit/7f8e3da87b78feeb757fbb3f21cd86fa7d9f9cca))
* implement multi-provider AI support ([#153](https://github.com/aceobservability/ace/issues/153)) ([57ae758](https://github.com/aceobservability/ace/commit/57ae7589bbf53dc3d382f9f315686f5a1529e0ae))
* k3d + Tilt demo environment with auto-seed and Colima support ([2305d56](https://github.com/aceobservability/ace/commit/2305d5698ef3c213df07ee074f1ae1df8efae804))
* refactor sidebar into unified component, migrate to bun, and update panels ([405813c](https://github.com/aceobservability/ace/commit/405813c930367955f7e7178871c805e748356a5a))


### Bug Fixes

* align aiProviders test mock with updated response shape ([f1f0234](https://github.com/aceobservability/ace/commit/f1f0234bdc76718d9bd0156d3c7226e2dc0babeb))
* delete orphaned dashboard template JSON files ([c74e62f](https://github.com/aceobservability/ace/commit/c74e62fdc185ed06324c50a2dc6cf3e7b4c4d456))
* mock useDatasource in HomeView tests ([#155](https://github.com/aceobservability/ace/issues/155)) ([566523f](https://github.com/aceobservability/ace/commit/566523f341c72ca7c1734c64073c02cbfebbb455))
* resolve all backend lint issues (gofmt + staticcheck) ([c1bf436](https://github.com/aceobservability/ace/commit/c1bf43649ed548d20e0db8dc2508a166ac092abf))
* resolve all frontend and backend lint issues ([b34f956](https://github.com/aceobservability/ace/commit/b34f956ddb6b9d4f731f315590698d10c010a323))
* resolve all frontend lint warnings and dead code ([02fee7c](https://github.com/aceobservability/ace/commit/02fee7c9156606f30fb2dc6d58e594ede48b6944))
* resolve CodeQL SSRF and unused variable alerts ([#187](https://github.com/aceobservability/ace/issues/187)) ([787bc57](https://github.com/aceobservability/ace/commit/787bc577d1852f260946e51d4e5bb879e9349de2))
* use bun instead of npm in frontend lint CI workflow ([a131957](https://github.com/aceobservability/ace/commit/a131957a089a8227355544e9c83f91b8721304de))

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
