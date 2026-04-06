# Changelog

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

* fix Cmd+K datasource tools and add full metrics/logs/traces support ([#149](https://github.com/aceobservability/ace/issues/149)) ([8ac4cf8](https://github.com/aceobservability/ace/commit/8ac4cf88a6a5e0cd175b1a0bb7161cbf04f0971b))

## [0.8.0](https://github.com/aceobservability/ace/compare/v0.7.0...v0.8.0) (2026-03-24)


### Features

* chart types expansion — Tier 1 (6 new panel types + registry infrastructure) ([#148](https://github.com/aceobservability/ace/issues/148)) ([a969bb9](https://github.com/aceobservability/ace/commit/a969bb90e92ddd295877e0fd96d9ad5d674e2540))
* enterprise auth phase 1 — audit logging + auditor role ([#146](https://github.com/aceobservability/ace/issues/146)) ([5433ac9](https://github.com/aceobservability/ace/commit/5433ac9cad32b3586731418ca9cb9fea7b1de94e))

## [0.7.0](https://github.com/aceobservability/ace/compare/v0.6.0...v0.7.0) (2026-03-23)


### Features

* Copilot device flow + Cmd+K search and AI chat ([#144](https://github.com/aceobservability/ace/issues/144)) ([630fbac](https://github.com/aceobservability/ace/commit/630fbac8ab9133620cadbbfe61d2e66ecb49c463))
* **design:** add data viz palette tokens and chartTheme utility ([ad4c04e](https://github.com/aceobservability/ace/commit/ad4c04e1e24299ea42de285f2b3c0c4e46ed1f6e))
* **design:** add Kinetic v2 motion tokens, data-pulse, and stagger-enter animations ([4133b3e](https://github.com/aceobservability/ace/commit/4133b3e10429e47b2368997394c38daeb94e3a19))
* **design:** update core Kinetic v2 tokens — primary, surfaces, shadows, overlays ([4d5eed6](https://github.com/aceobservability/ace/commit/4d5eed6701e536f19a32b9f8f02545bf7c10071d))
* **design:** update hardcoded colors in AiInsightCard and HomeView for Kinetic v2 ([c640344](https://github.com/aceobservability/ace/commit/c64034492e38fb96c6a406efa71e44b252f2480b))
* **design:** update Monaco/PromQL theme to Kinetic v2 palette ([94c4673](https://github.com/aceobservability/ace/commit/94c4673a67cf4adb332c20346d9f8c6b67b08622))
* implement Kinetic v2 design system ([bd821dc](https://github.com/aceobservability/ace/commit/bd821dc165792467a87f0c66dbafbfe92fc89e93))
* implement Kinetic v2 design system ([#145](https://github.com/aceobservability/ace/issues/145)) ([bd821dc](https://github.com/aceobservability/ace/commit/bd821dc165792467a87f0c66dbafbfe92fc89e93))


### Bug Fixes

* address Greptile review comments ([178246a](https://github.com/aceobservability/ace/commit/178246ae710eb7483fef6b84735a852fdfc2aec9))
* make bold text readable in Cmd+K chat panel ([a642696](https://github.com/aceobservability/ace/commit/a642696c2ac0d57bde47c057e0e3e5139e361b6e))
* replace remaining #fdfbfe tooltip colors with #F3F1EA ([88d84af](https://github.com/aceobservability/ace/commit/88d84afe93ffd76e8b8273dca7310d5918ebe78c))
* resolve CHANGELOG.md merge conflict with master ([1ba5d0b](https://github.com/aceobservability/ace/commit/1ba5d0bb12fb6e786ca55fcaf5cebd9d995074d7))
* resolve lint warnings ([237dcc3](https://github.com/aceobservability/ace/commit/237dcc32018e7d17d0f3cbff852ca0ae7fce34a1))
* restore org selector to sidebar rail ([8421f53](https://github.com/aceobservability/ace/commit/8421f530edfd60a56a679391898c71f5ab799c2c))


### Refactoring

* **charts:** use chartTheme in BarChart ([09c43f3](https://github.com/aceobservability/ace/commit/09c43f34c5676cd2b0aef4a77439df6539929fd3))
* **charts:** use chartTheme in GaugeChart and StatPanel ([8a3a10d](https://github.com/aceobservability/ace/commit/8a3a10de6d2361c8e1f70f236a815c48fb03cba4))
* **charts:** use chartTheme in LineChart ([b21fab2](https://github.com/aceobservability/ace/commit/b21fab2a124d6931d24f6f3330dbb9fc5a62f8df))
* **charts:** use chartTheme in PieChart ([1b77c78](https://github.com/aceobservability/ace/commit/1b77c784a79e7380a7a0d20e8b196fd9711a6663))
* **layout:** tokenize sidebar rail and flyout dimensions ([4811fff](https://github.com/aceobservability/ace/commit/4811fffb71359d04d070f8dfd5bf5c68cf00a853))


### Documentation

* add Copilot + Cmd+K implementation plan (8 tasks, TDD) ([8656172](https://github.com/aceobservability/ace/commit/86561722f29805b1d75347138131f614b746c939))
* add Kinetic v2 design system implementation spec ([3db4c55](https://github.com/aceobservability/ace/commit/3db4c556888a1a609fe13093f1523b23c32d5f59))
* add Kinetic v2 implementation plan ([9feb5ca](https://github.com/aceobservability/ace/commit/9feb5caa33eacd37d917412493f97f9f1141c191))
* autoplan review complete — CEO + Eng + Design all cleared ([bd5bbdc](https://github.com/aceobservability/ace/commit/bd5bbdc296cc53f7a98d2913205c8d8fe7558e1b))
* update spec with review fixes — shared state, tool loop, correct exports ([abd9abe](https://github.com/aceobservability/ace/commit/abd9abea8028406c7d81ae8c9eb8079cb776bcd2))

## [0.7.0] - 2026-03-23

### Added

* Per-user GitHub Copilot device flow authentication in Settings > AI Configuration — any user can connect their own Copilot subscription without admin-configured OAuth credentials
* Cmd+K command palette with dashboard search — filter dashboards by title/description with keyboard navigation
* AI chat mode in Cmd+K powered by GitHub Copilot — multi-turn tool-calling loop with metric exploration and dashboard generation via DashboardSpecPreview
* Model selector dropdown in Cmd+K chat for choosing between available Copilot models
* Datasource context awareness — Cmd+K chat uses the current view's datasource type and ID

### Changed

* Refactored `useCopilot` composable to shared module-level state so connection status is consistent across Settings and Cmd+K
* Renamed `getVictoriaMetricsTools` to `getMetricsTools` with generic tool descriptions to support both VictoriaMetrics and Prometheus datasources
* Added `datasourceType` and `datasourceName` fields to `CommandContext` interface

### Removed

* Admin-only GitHub OAuth App configuration form (`GitHubAppSettings.vue`) — replaced by per-user device flow
* Unused `getGitHubAppConfig` and `configureGitHubApp` API functions and their types

## [0.6.1] - 2026-03-23

### Fixed

* Restore org selector to sidebar — the sidebar redesign accidentally removed the organization dropdown, leaving users with no visible way to switch orgs and causing dashboards to appear empty when no org was auto-selected

## [0.6.0](https://github.com/aceobservability/ace/compare/v0.5.0...v0.6.0) (2026-03-23)


### Features

* chat-to-dashboard — AI-generated dashboard specs from copilot ([#123](https://github.com/aceobservability/ace/issues/123)) ([96fb6fa](https://github.com/aceobservability/ace/commit/96fb6faf849abb07ca16f03525a464d0fcab3602))
* Kinetic Observability Redesign — full UI replacement ([#125](https://github.com/aceobservability/ace/issues/125)) ([3111b77](https://github.com/aceobservability/ace/commit/3111b7740f58a27888988ee76478151072026b96))
* Kinetic redesign — new design system, sidebar, and home page ([#127](https://github.com/aceobservability/ace/issues/127)) ([bbdb6ad](https://github.com/aceobservability/ace/commit/bbdb6adab7a132ab3b0efee7fa15ac4e18a46b56))
* sidebar redesign — icon rail + flyout with Kinetic palette ([#126](https://github.com/aceobservability/ace/issues/126)) ([ace7334](https://github.com/aceobservability/ace/commit/ace73340f58e73b07e1555baad8046b57d9f2533))


### Bug Fixes

* redirect to /app home screen after login instead of /dashboards ([7e4b29e](https://github.com/aceobservability/ace/commit/7e4b29ecb742d8d46cf74c0575a3a8dfc8ec8902))
* use real datasource store for home screen empty state ([ca5d477](https://github.com/aceobservability/ace/commit/ca5d4773657e58d37e08c1c0aa71201d978bd7e1))


### Documentation

* add Kinetic Observability Redesign implementation plan ([c0b3fc2](https://github.com/aceobservability/ace/commit/c0b3fc2e29f69cf23705d47e65afaf2dd4bb81d9))

## [0.6.0] - 2026-03-22

### Added

* Kinetic design system — warm amber palette, Satoshi/DM Sans typography, industrial-utilitarian aesthetic replacing the previous Deep Space theme
* Home page "Hero + Panels" redesign — cinematic AI search hero with ambient amber glow, two-column health/insights panels with tinted problem rows and type-coded insight cards
* Icon rail + flyout sidebar — replaces hamburger menu with a 52px icon strip and hoverable/pinnable flyout navigation
* StatusDot automatic glow pulse — critical and warning service indicators now breathe with a box-shadow glow animation
* AiInsightCard type system — anomaly (amber), optimization (blue), and forecast (orange) color-coded left-border accents
* Unified Settings and Explore views — tabbed layouts consolidating previously separate pages
* Services Overview, Dashboard AI Generation, and Cmd+K command palette

### Changed

* All chart components rethemed with transparent backgrounds and monospace metrics
* Dashboard detail view updated with AI anomaly badges and refresh indicator
* Alert Explorer redesigned with dense table layout and expandable rows

## [0.5.0](https://github.com/aceobservability/ace/compare/v0.4.1...v0.5.0) (2026-03-21)


### Features

* [#407](https://github.com/aceobservability/ace/issues/407) VMAlert datasource — client, proxy handlers, AlertsView with active alerts + rule groups ([#56](https://github.com/aceobservability/ace/issues/56)) ([ec4d774](https://github.com/aceobservability/ace/commit/ec4d774567817230010e5faa7e18e96b3ce91d72))
* [#408](https://github.com/aceobservability/ace/issues/408) AlertManager datasource — client, proxy handlers, silences management, receivers ([#58](https://github.com/aceobservability/ace/issues/58)) ([a8cddc4](https://github.com/aceobservability/ace/commit/a8cddc4a43fe58a4ee9b0cefc16a4fe70f764c76))
* [#409](https://github.com/aceobservability/ace/issues/409) app UI styling overhaul — amber accent system, component sweep, typography ([#57](https://github.com/aceobservability/ace/issues/57)) ([e650ab5](https://github.com/aceobservability/ace/commit/e650ab5d86f60c0d00459e03b793d725d6b8b958))
* [#410](https://github.com/aceobservability/ace/issues/410) migrate frontend to Tailwind CSS v4 — styles live in components ([#59](https://github.com/aceobservability/ace/issues/59)) ([8eb644a](https://github.com/aceobservability/ace/commit/8eb644a81cc52dfe810f6780fe5c9d43014cb8e7))
* [#428](https://github.com/aceobservability/ace/issues/428) move datasources from sidebar to organisation settings ([#62](https://github.com/aceobservability/ace/issues/62)) ([b3e3042](https://github.com/aceobservability/ace/commit/b3e30427fb201711d1aaf4c0cf6b47c5a35a551e))
* [#431](https://github.com/aceobservability/ace/issues/431) GitHub Copilot AI query assistant — OAuth connect, chat panel, datasource-aware system prompts ([#64](https://github.com/aceobservability/ace/issues/64)) ([b2daafd](https://github.com/aceobservability/ace/commit/b2daafd14f63360d072dc4493361e0bf9313a716))
* [#432](https://github.com/aceobservability/ace/issues/432) log→trace correlation — trace_id_field config, clickable trace IDs in LogViewer, correlated seed data generator ([#63](https://github.com/aceobservability/ace/issues/63)) ([27bdf17](https://github.com/aceobservability/ace/commit/27bdf1742e7e3da6902aa004733fde7e54fb1ad4))
* [#433](https://github.com/aceobservability/ace/issues/433) dark/light mode toggle — CSS token system, useTheme composable, localStorage + browser preference ([#65](https://github.com/aceobservability/ace/issues/65)) ([4f2a908](https://github.com/aceobservability/ace/commit/4f2a908559a0e463b3a6bf85452de7d9fbf8a820))
* [#434](https://github.com/aceobservability/ace/issues/434) org white-labelling — custom accent color, logo upload, app title per org ([#67](https://github.com/aceobservability/ace/issues/67)) ([6729fc8](https://github.com/aceobservability/ace/commit/6729fc8c17a7a22f2ad294fcb2982ccd5a1d6cd8))
* [#435](https://github.com/aceobservability/ace/issues/435) GitHub Copilot per-org OAuth App credentials — replaces global env vars with org-scoped sso_configs ([#68](https://github.com/aceobservability/ace/issues/68)) ([e7674f5](https://github.com/aceobservability/ace/commit/e7674f5a4637248a5e43ab63924981601c01a7b3))
* 265 add ClickHouse backend datasource core ([2b3cb60](https://github.com/aceobservability/ace/commit/2b3cb604ba57f8d10452746e860e24c67e4c6ece))
* 266 - agent/prd.json.backup agent/progress.txt.backup frontend/src/components/Panel.vue frontend/src/composables/useDatasource.ts frontend/src/types/datasource.ts frontend/src/views/Explore.vue frontend/src/views/ExploreLogs.spec.ts frontend/src/views/ExploreLogs.vue frontend/src/views/ExploreTraces.vue ([fa19d15](https://github.com/aceobservability/ace/commit/fa19d15b4200b10fbd1a9cc51dec07610c119d86))
* 266 - agent/prd.json.backup agent/progress.txt.backup frontend/src/components/Panel.vue frontend/src/composables/useDatasource.ts frontend/src/types/datasource.ts frontend/src/views/Explore.vue frontend/src/views/ExploreLogs.spec.ts frontend/src/views/ExploreLogs.vue frontend/src/views/ExploreTraces.vue ([c8d4296](https://github.com/aceobservability/ace/commit/c8d429637a4fe3aeabf89dae8f12992684253463))
* 266 add clickhouse sql editor and settings ([1e10f39](https://github.com/aceobservability/ace/commit/1e10f39935091eb8da6f06904d99d2a7662ff623))
* 267 clickhouse explore views and panel routing ([8a4803b](https://github.com/aceobservability/ace/commit/8a4803b0efaf8765d4bd43dc70cdf5bfa2aa6146))
* Add auto-refresh pause/resume and refresh UI indicators ([a1d9c33](https://github.com/aceobservability/ace/commit/a1d9c33047e2d770bd70c61acf4d6462a18d5b92))
* Add auto-refresh pause/resume and UI indicators ([c9812a8](https://github.com/aceobservability/ace/commit/c9812a8566e178d5868ef93929a9d42e40cbf4a4))
* add automated release versioning and publishing pipeline ([5b13f4c](https://github.com/aceobservability/ace/commit/5b13f4c10a5c3d09a65ddd4ccf663adb513e98f5))
* add ClickHouse datasource tickets [#265](https://github.com/aceobservability/ace/issues/265), [#266](https://github.com/aceobservability/ace/issues/266), [#267](https://github.com/aceobservability/ace/issues/267) to PRD ([102aea5](https://github.com/aceobservability/ace/commit/102aea5e10f4638d3960ae443f38f1d823e6dd50))
* add CloudWatch datasource integration across backend and frontend ([6a9330f](https://github.com/aceobservability/ace/commit/6a9330f2fb47f765e33fef1a2d7d10359812c4f6))
* add compose-reset target and vmalert/alertmanager datasource types ([3355d07](https://github.com/aceobservability/ace/commit/3355d07ba14a85de80ea615e6f0dfc30611408e9))
* Add core authentication system with JWT and Argon2id ([#14](https://github.com/aceobservability/ace/issues/14)) ([86af8ec](https://github.com/aceobservability/ace/commit/86af8ec2a03a07c446a3b2caaf4e5370e035e586))
* Add dashboard grid layout with drag-and-drop using vue-grid-layout ([5883547](https://github.com/aceobservability/ace/commit/58835474c4d039ee9cbdbfe105040d9ec06b6418))
* Add dashboard grid layout with drag-and-drop using vue-grid-layout ([3245a7e](https://github.com/aceobservability/ace/commit/3245a7e13532745102a1ea75bc8c52e5d6a9ac3e))
* add datasource creation view with draft connection testing ([7f51207](https://github.com/aceobservability/ace/commit/7f512073fb25220691768a7fecc147e977779951))
* add datasource health check to traces screen and OTel collector/telemetrygen infra ([78c567a](https://github.com/aceobservability/ace/commit/78c567aacb4795187eec1ae31f0b9f42194c97fd))
* add datasource logo mapping utility ([9e9129c](https://github.com/aceobservability/ace/commit/9e9129cd6ad30acd500b81cb14da7d5e77a60041))
* add dedicated logs explore flow and label discovery ([d5963b2](https://github.com/aceobservability/ace/commit/d5963b2f49a3d409d2f158b4daa6f9ea58870263))
* add ELK Elasticsearch datasource integration ([b3eca66](https://github.com/aceobservability/ace/commit/b3eca66c5e0e11f2c7d3eb6f6d788b96456534b2))
* Add full dashboard CRUD operations ([425365b](https://github.com/aceobservability/ace/commit/425365b5c05f724086ad4112127f94aed3bb6327))
* Add full dashboard CRUD operations ([be36c8e](https://github.com/aceobservability/ace/commit/be36c8e36063cf46010c7d6ad4714c8be40514ba))
* Add gauge chart visualization ([2408a8f](https://github.com/aceobservability/ace/commit/2408a8ff9f9f362b3e028cdee2e93b33b73b4e7a))
* Add gauge chart visualization component ([c61e342](https://github.com/aceobservability/ace/commit/c61e342d97776739aadfcf12439b6ac4c7669f2c))
* Add Google SSO authentication ([#16](https://github.com/aceobservability/ace/issues/16)) ([a67c6a4](https://github.com/aceobservability/ace/commit/a67c6a43787afa8d6b3b36b588276486ad225c7e))
* add inter-service topology to otel loadgen ([ff6a16b](https://github.com/aceobservability/ace/commit/ff6a16b23e184fad5e488ccb259c798603daae37))
* Add Line Chart component for time-series visualization ([2f4372c](https://github.com/aceobservability/ace/commit/2f4372ccd7ad90d095e9b6ad8b63692d354b489a))
* add markdown rendering dependencies (marked, shiki, dompurify, typography) ([96a8c43](https://github.com/aceobservability/ace/commit/96a8c43380538d3ab099b1de4975e6af55b50199))
* add markdown rendering utility with shiki syntax highlighting ([e19a1b4](https://github.com/aceobservability/ace/commit/e19a1b4774b5258c8f013d055b79d0a29dc46dc9))
* add MCP tool definitions and executor for VictoriaMetrics ([5204a04](https://github.com/aceobservability/ace/commit/5204a040c51da7d0cefef444d779d0b6aef38c4d))
* add metadata methods to VictoriaMetrics client ([b176908](https://github.com/aceobservability/ace/commit/b17690865a439518a64403bebaab0f2a90fd77ed))
* add metric-names API and extend labels with metric filter ([8938fe0](https://github.com/aceobservability/ace/commit/8938fe03482ca9a90e45d6351a646188e2ccb84d))
* add metric-names endpoint and extend labels for VictoriaMetrics ([a748f0c](https://github.com/aceobservability/ace/commit/a748f0c15875bd922e3f9627ae1d1df2610a45df))
* Add Microsoft Entra ID SSO authentication ([b74c3a8](https://github.com/aceobservability/ace/commit/b74c3a85ec6a67d7d11a50afbf2f49ecda9cf5e3))
* Add Microsoft Entra ID SSO authentication ([2361558](https://github.com/aceobservability/ace/commit/23615582f3bfcbeed8ee3e57b7b07313ce1bbe3d))
* Add Monaco Editor with PromQL IntelliSense ([#12](https://github.com/aceobservability/ace/issues/12)) ([9c70e32](https://github.com/aceobservability/ace/commit/9c70e32ac307016a01815805bf27aa3971b5b6c7))
* Add multi-auth linking for user accounts ([3d31ffe](https://github.com/aceobservability/ace/commit/3d31ffe3682d634b792e6a8993ee3a2d3bb162d4))
* Add multi-auth linking for user accounts ([ceb1790](https://github.com/aceobservability/ace/commit/ceb17903df690779dbefd881eca9b35dbd0fdf9a))
* Add multi-tenancy database schema ([#13](https://github.com/aceobservability/ace/issues/13)) ([4c469da](https://github.com/aceobservability/ace/commit/4c469da16c2a98b34e24f16099f252b61cfa962c))
* Add organization management with invitations and member roles ([9182eab](https://github.com/aceobservability/ace/commit/9182eab865a794b9d149dce1ba383b6c86055e98))
* Add panel system with CRUD operations and 12-column grid ([b756f4e](https://github.com/aceobservability/ace/commit/b756f4ef2ea6f318fae1b8250760bb720e8d5cc4))
* Add panel system with CRUD operations and 12-column grid ([d3bac14](https://github.com/aceobservability/ace/commit/d3bac1431f249b99c5c941c9fd7b49f19eaa7a99))
* Add pie/donut chart visualization ([58afcbc](https://github.com/aceobservability/ace/commit/58afcbcb08da3cd84775a0c21a3ba0c420df973a))
* Add pie/donut chart visualization component ([4fe3fc0](https://github.com/aceobservability/ace/commit/4fe3fc028782e9971bdc79e3b4316760bb9567fc))
* add production Helm chart for Ace with VictoriaMetrics stack ([#494](https://github.com/aceobservability/ace/issues/494)) ([23de2ac](https://github.com/aceobservability/ace/commit/23de2ac2628a59f1d5c4d093309299a6be992ccd))
* add production Helm chart for Ace with VictoriaMetrics stack ([#494](https://github.com/aceobservability/ace/issues/494)) ([a9527ae](https://github.com/aceobservability/ace/commit/a9527aecfba2f4fd21106e5affde5097f5ca7b48))
* Add Prometheus data source integration with useProm composable ([88d5c44](https://github.com/aceobservability/ace/commit/88d5c444d80482e4582403d7b9c29f739f571016))
* Add Prometheus query API endpoint ([eee08bc](https://github.com/aceobservability/ace/commit/eee08bcac3774361a263bbf3e70f64f6bb554c61))
* Add PromQL Query Editor with validation and preview ([9b19151](https://github.com/aceobservability/ace/commit/9b19151f9b7abbd6f227d5737f68eea9ffd14b55))
* Add PromQL Query Explorer page ([8942384](https://github.com/aceobservability/ace/commit/894238457281396053b394c7791ec4848129f64e))
* add resizable copilot panel with drag handle ([96078cf](https://github.com/aceobservability/ace/commit/96078cf7227fec8488cb21d5d06c5526d8f7dbeb))
* add seed-dashboards command with default dashboards for local dev stack ([#61](https://github.com/aceobservability/ace/issues/61)) ([8617716](https://github.com/aceobservability/ace/commit/8617716528fafe42e5d3226bb8744be529f2d799))
* add sendChatRequest with tool calling support to useCopilot ([f4c85f1](https://github.com/aceobservability/ace/commit/f4c85f191c6f3cbed95001f37f1024428fa7dc7d))
* Add stat/KPI panel visualization ([1b6b3f6](https://github.com/aceobservability/ace/commit/1b6b3f6e1a65dcf2032ec1ab46163998f63bc482))
* Add stat/KPI panel visualization component ([8d041ad](https://github.com/aceobservability/ace/commit/8d041ad6477ff5e1b130684c186a5d4ecc8ec7ce))
* add tailwind typography plugin and copilot prose overrides ([b133cb2](https://github.com/aceobservability/ace/commit/b133cb26da1fefe31555beb5c514119fc7d87439))
* Add time range picker component ([73ebba0](https://github.com/aceobservability/ace/commit/73ebba066c79a5a3d420a71d4cc531cabde70df8))
* Add time range picker component with presets and auto-refresh ([8cd822d](https://github.com/aceobservability/ace/commit/8cd822df39ce39f9f67535a1006c2e6b437abce2))
* add tool calling loop to CopilotPanel for VictoriaMetrics MCP ([804103a](https://github.com/aceobservability/ace/commit/804103af0cc01a9b0ee48bfa4e907c2389359982))
* Add universal chart formatting utilities ([4c7356e](https://github.com/aceobservability/ace/commit/4c7356e92d0edd5606c4fcbae61227aef3e358b4))
* Add universal chart formatting utilities ([671abc5](https://github.com/aceobservability/ace/commit/671abc54974c0d251f385534b31468560ca6e530))
* add useQueryEditor composable for copilot editor bridge ([636599d](https://github.com/aceobservability/ace/commit/636599d14bf6c6608f1abf4973f7ffb0f9ddd1cb))
* Add Valkey-backed refresh token system ([#15](https://github.com/aceobservability/ace/issues/15)) ([8ac4802](https://github.com/aceobservability/ace/commit/8ac4802bcec50939b23ad5bfc56de6c117e39e73))
* Add visual PromQL Query Builder ([c0ed877](https://github.com/aceobservability/ace/commit/c0ed877608aa6282191c8deaf83eb08f5e3829c5))
* BREADCRUMBS-CLEANUP-001 remove breadcrumb count subtext ([5b33b75](https://github.com/aceobservability/ace/commit/5b33b751a801876430fc093cc7c72af6de9d9c60))
* CAC-001 add dashboard CaC import export ([2ee354d](https://github.com/aceobservability/ace/commit/2ee354da300bd26c8d8ddaab5e9f7aa101ab090b))
* convert App.vue layout to Tailwind with light bg-slate-50 content area ([0eca1f0](https://github.com/aceobservability/ace/commit/0eca1f05ac2d9953a7a618b839d32fce192cedf2))
* copilot device flow auth, model selection, and bug fixes ([7d5d7fa](https://github.com/aceobservability/ace/commit/7d5d7fa725ccf1d4040d5d6e8a51c44cfcb17a3a))
* COVERAGE-PIPELINE-001 add CI-driven coverage badge and workflow concurrency ([da7ea6c](https://github.com/aceobservability/ace/commit/da7ea6c7f56169b8620f92b4dc0a1c129ce0c4ae))
* dark mode atmosphere, refined palette, and pinnable sidebar ([782630a](https://github.com/aceobservability/ace/commit/782630a4a3d9743b3df89e29511d3196bb33d5bd))
* DASHBOARD-EXPORT-001 add yaml export ([25fdab8](https://github.com/aceobservability/ace/commit/25fdab84374e9f7e256086c5a0b6a3f5ff244ee6))
* DASHBOARD-IMPORT-YAML-001 add yaml import flow ([d56036c](https://github.com/aceobservability/ace/commit/d56036c207be617e2e12c3837896d4ab40f99f0b))
* DASHBOARD-IMPORT-YAML-001 tighten YAML import validation ([7911faa](https://github.com/aceobservability/ace/commit/7911faadc1f7790843529404fa682a04e2417342))
* DASHBOARD-SETTINGS-001 add in-view dashboard settings modal ([0e6ba55](https://github.com/aceobservability/ace/commit/0e6ba554a13e243d5e75278194795333d0437f57))
* DASHBOARD-SETTINGS-VIEW-002 route dashboard settings and add frontend linting ([95700e3](https://github.com/aceobservability/ace/commit/95700e3a7d38d46c77384208e55214439a80f794))
* DASHBOARD-YAML-EDITOR-001 add dashboard YAML editor ([3c9497b](https://github.com/aceobservability/ace/commit/3c9497b0b6d68056432381d660bbb5b2255d4820))
* DASHBOARDS-DRAG-DROP-001 add drag move between folders ([7d38da9](https://github.com/aceobservability/ace/commit/7d38da913784ba380c5ff33ae06b51b2f5fcf3ed))
* DASHBOARDS-FILE-EXPLORER-001 file explorer dashboards view ([bbd7905](https://github.com/aceobservability/ace/commit/bbd7905018a1c2db423b019988f9991e5de805e0))
* DASHBOARDS-FILE-EXPLORER-002 unify finder list explorer ([c1e2298](https://github.com/aceobservability/ace/commit/c1e2298ed38f244119256cfd4c779ebe18562ae1))
* enhance log exploration and automate single-task agent runs ([2575787](https://github.com/aceobservability/ace/commit/2575787f218cd249303cea0976c2d32c2444cb92))
* expanded sidebar ([0634eb6](https://github.com/aceobservability/ace/commit/0634eb60f307afcb785b5b9b5123b45eedbc162d))
* FOLDER-BE-001 add folder CRUD endpoints ([5cf9c11](https://github.com/aceobservability/ace/commit/5cf9c11bb0e6fe8eab001a00dc8793f932e0a9d6))
* FOLDER-DB-001 add folder schema migrations ([8b7bccf](https://github.com/aceobservability/ace/commit/8b7bccffacc9c7a4ebe53394ba4c83d1b4381354))
* FOLDER-FE-API-001 add folder API client ([bc3e50e](https://github.com/aceobservability/ace/commit/bc3e50e54c5359feb338fb15eb868c967975747a))
* FOLDER-FE-API-001 mark task as passing ([45c338c](https://github.com/aceobservability/ace/commit/45c338ce016c3e4996d42ada43812e6f431007ae))
* FOLDER-FE-UI-001 group dashboards by folder ([4b36f2a](https://github.com/aceobservability/ace/commit/4b36f2a1adc89197f2a731c16559bb8b8a448ae1))
* FOLDER-FE-UI-003 allow dashboard folder moves ([c78c3b7](https://github.com/aceobservability/ace/commit/c78c3b700041d169bccd3a8815d0c680d6c624ce))
* FOLDER-FE-UI-004 add folder creation entry points ([fa49a04](https://github.com/aceobservability/ace/commit/fa49a047c2b5c55063229678d2d05d8276bfbf2f))
* GRAFANA-CONVERTER-001 add grafana conversion flow ([3052c13](https://github.com/aceobservability/ace/commit/3052c138e18e259cd7fbdd31c3222269774afbb8))
* GRAFANA-IMPORT-INTEGRATION-001 integrate grafana dashboard import flow ([b0f6e8b](https://github.com/aceobservability/ace/commit/b0f6e8bca89e97e23d447213d6b6f05158c2b631))
* improve local trace testing and Tempo visibility ([e8511b1](https://github.com/aceobservability/ace/commit/e8511b15afcf501f10aebbf405ecaf14c4e4862f))
* install Tailwind CSS v4 and replace global style.css with style guide theme ([6be95ed](https://github.com/aceobservability/ace/commit/6be95ed1c4a0925ff6039b3746cfa87ab9f817b9))
* integrate full markdown rendering into copilot messages ([b35e96c](https://github.com/aceobservability/ace/commit/b35e96cf01df4a061a1259dc7112145e533fad9d))
* LANDING-COMPARISON-001 add comparison table ([ae27477](https://github.com/aceobservability/ace/commit/ae27477149537798dd61014d89c6ae06b7715cb6))
* LANDING-FEATURES-001 add landing feature cards ([3ca4ae5](https://github.com/aceobservability/ace/commit/3ca4ae5b3535866016fb96ef225a84700b570443))
* LANDING-FOOTER-001 add landing footer CTA ([1bb0bf9](https://github.com/aceobservability/ace/commit/1bb0bf9b45d7fd0f9db6c4c2a497b7440185faa5))
* LANDING-HERO-001 build landing hero section ([ac8cb1e](https://github.com/aceobservability/ace/commit/ac8cb1edc9fc67b89938909b3a7b061829bf5726))
* LANDING-SCREENSHOTS-001 add landing screenshot gallery ([3c5cbc3](https://github.com/aceobservability/ace/commit/3c5cbc3429acf0c1adfbde9e0b445cc32bd8c8a3))
* LANDING-SETUP-001 add landing route and SEO foundation ([92698c3](https://github.com/aceobservability/ace/commit/92698c331208fbafd79a9efb12b883ee8157b041))
* Line Chart Component for Time-Series Visualization ([9f8dd99](https://github.com/aceobservability/ace/commit/9f8dd99550b4d3d2d591a6df38454a6c62598b57))
* LINT-INFRA-001 add lint automation and frontend biome cleanup ([ad8f109](https://github.com/aceobservability/ace/commit/ad8f109e95e2eda292631c11660fe705a39072ca))
* move copilot panel to app-level layout for global visibility ([c08e999](https://github.com/aceobservability/ace/commit/c08e999a249a69763723d87095c81e7c07d6b8f7))
* multi-source datasource support (Prometheus, Loki, Victoria Logs, VictoriaMetrics) ([7c8b32d](https://github.com/aceobservability/ace/commit/7c8b32d0aa1bbabc64628ff43bedab62eaa65751))
* ORG-FE-UI-002 center org creation modal ([f0f3d88](https://github.com/aceobservability/ace/commit/f0f3d88c67fe0735fcfc86500d140b2cbde6eb80))
* ORG-SETTINGS-SIDEBAR-001 add org settings sidebar sections ([be8ebca](https://github.com/aceobservability/ace/commit/be8ebcaf23f18e9d5ea288ce907e2d29ef973431))
* Organization Management ([05b8129](https://github.com/aceobservability/ace/commit/05b812913f6b0e31a6f63e4722c5e67ff581c81d))
* overhaul dashboard UX and refresh local dev stack ([ec64770](https://github.com/aceobservability/ace/commit/ec6477022a0302b004d7f8c674a8cbca87792571))
* pass through tools and support non-streaming in copilot chat handler ([9b6b455](https://github.com/aceobservability/ace/commit/9b6b4554ca802baf8570b1f918b287d41dfd684a))
* PERMISSIONS-FIX-001 set dashboard default acl ([76410e2](https://github.com/aceobservability/ace/commit/76410e26c82dbe9fcc639993662eb322a7bce034))
* POSTHOG-BACKEND-001 add backend PostHog analytics ([f80f912](https://github.com/aceobservability/ace/commit/f80f91268afb4c0b0885888e96e4cd3e2062c2fd))
* POSTHOG-FRONTEND-001 add frontend analytics ([64590d6](https://github.com/aceobservability/ace/commit/64590d65149e216e9e20ceb5205b7d5f4777de95))
* Prometheus Data Source Integration ([7ffa30a](https://github.com/aceobservability/ace/commit/7ffa30ae5242925e946092e966b53329e6c005de))
* PromQL Query Editor ([24103e8](https://github.com/aceobservability/ace/commit/24103e82e99e473c28c38cfc7555f8204950d70e))
* PromQL Query Explorer ([74830f9](https://github.com/aceobservability/ace/commit/74830f9f2a27fcb00b235f1035d3cb80ae9416d7))
* RBAC-BE-GROUPS-001 add org group CRUD endpoints ([d444f1b](https://github.com/aceobservability/ace/commit/d444f1b80df0e3a04a97a519622f6c1b9c92cf7f))
* RBAC-BE-GROUPS-001 update task pass status ([254a27c](https://github.com/aceobservability/ace/commit/254a27ccf7922b30abc5aa4aa2a5a87777876d06))
* RBAC-BE-GROUPS-002 add group membership endpoints ([be02514](https://github.com/aceobservability/ace/commit/be02514012f4ac7f041c43a7b20f21f76762b08e))
* RBAC-BE-PERM-001 add permission evaluation service ([3b51b0d](https://github.com/aceobservability/ace/commit/3b51b0d2fc2f902b7f42ab19548c2997af44d512))
* RBAC-BE-PERM-002 enforce handler permission checks ([e549eaf](https://github.com/aceobservability/ace/commit/e549eaf2320d11d6eac58034806b0b4181ba967c))
* RBAC-BE-PERM-003 add ACL management endpoints ([68a3b5c](https://github.com/aceobservability/ace/commit/68a3b5cf59f3c27bdec6243f258ce1ed93b7f8bf))
* RBAC-BE-TEST-001 add RBAC permission matrix tests ([e68680c](https://github.com/aceobservability/ace/commit/e68680c71126a4cb0f1fdadaf4bb8c76353f5eff))
* RBAC-DB-001 add group and ACL schema ([22abfdb](https://github.com/aceobservability/ace/commit/22abfdb157873b908326be33efd307c9ceeed28d))
* RBAC-FE-API-001 add RBAC frontend API modules ([c946a24](https://github.com/aceobservability/ace/commit/c946a24172f98ed644e772bbe6c71101851956d7))
* RBAC-FE-UI-DASH-001 add dashboard permissions editor UI ([7cbb2a0](https://github.com/aceobservability/ace/commit/7cbb2a0388c5fe81c42594a308465099c9f8b561))
* RBAC-FE-UI-DASH-001 update task pass status ([744fb9d](https://github.com/aceobservability/ace/commit/744fb9dbf9ebbba9904da0a4522ae3e766e6aef1))
* RBAC-FE-UI-FILTER-001 enforce forbidden dashboard UX ([3ada098](https://github.com/aceobservability/ace/commit/3ada0988db4538831deac656495069d05222633d))
* RBAC-FE-UI-FOLDER-001 add folder ACL editor ([800912a](https://github.com/aceobservability/ace/commit/800912aa20219bdb4c69b3326d2c41ac2047026f))
* RBAC-FE-UI-ORG-001 add org group management UI ([607f329](https://github.com/aceobservability/ace/commit/607f3294c51d17fe1f91833a85c19eb2933fc51f))
* redesign sidebar as slim icon rail with hover flyout ([5420617](https://github.com/aceobservability/ace/commit/54206172b77f297e8c7e549329d70ff5715e1686))
* register Explore metrics editor with useQueryEditor bridge ([9f44365](https://github.com/aceobservability/ace/commit/9f4436533448b37feeaa379a31e993c92bbcf408))
* replace hardcoded emerald classes with dynamic accent CSS variables for org branding ([1419e3e](https://github.com/aceobservability/ace/commit/1419e3ecafdca24ac827500970c82c5cf529d8fc))
* replace vite-plugin-monaco-editor with manual worker setup ([8272d09](https://github.com/aceobservability/ace/commit/8272d095c33eed19f8038b178f9597a8b0109644))
* restore alerts route to router configuration ([200602f](https://github.com/aceobservability/ace/commit/200602f8cc83759e629abd783df09ca02ddd08e2))
* restore compose/seed targets and add dark mode theming ([7766950](https://github.com/aceobservability/ace/commit/7766950312722b682c1b4ffe5956189d0a1beb2c))
* restyle AlertsView with Tailwind — tabbed layout, colored alert borders ([5e566a5](https://github.com/aceobservability/ace/commit/5e566a548e25dce2a2f518afb19a31be0eb5311f))
* restyle all query builders and editors with Tailwind ([c540cc0](https://github.com/aceobservability/ace/commit/c540cc06c7f8b4f281cc6f9f4f78f7736e8452e9))
* restyle chart and stat components with Tailwind — emerald palette, white cards ([383af70](https://github.com/aceobservability/ace/commit/383af70e40df43e05f027781c237b3500b4c2f7c))
* restyle CookieConsentBanner and CreateOrganizationModal with Tailwind ([6b0c78c](https://github.com/aceobservability/ace/commit/6b0c78c828acb9bca15c14d0ddeac31ed87f6744))
* restyle Create/Edit dashboard modals with Tailwind ([c61e162](https://github.com/aceobservability/ace/commit/c61e162164696cbb47dcc72869d708461eac3f40))
* restyle DashboardDetailView with Tailwind — white panel cards, light grid area ([7a3e046](https://github.com/aceobservability/ace/commit/7a3e046a2fcb35aad3ac7211a57fa3f6c69db748))
* restyle DashboardList with Tailwind — white cards, emerald folder accents ([59dec42](https://github.com/aceobservability/ace/commit/59dec426a539bdf92a733aa8d8e2118cfd32a269))
* restyle DashboardSettingsView with Tailwind — tabbed settings, white cards ([81e2b5e](https://github.com/aceobservability/ace/commit/81e2b5ed8d297f2eda99175ecd402c775e1f4b5d))
* restyle DataSource pages with Tailwind — white cards, health indicators, type selector ([77ae39b](https://github.com/aceobservability/ace/commit/77ae39b2d36b35a668190bf3a7570db79105b1e3))
* restyle Explore metrics view with Tailwind — white cards, emerald query button ([8e78ec4](https://github.com/aceobservability/ace/commit/8e78ec4e0cc1beb16e2b4d43262af212104c73cf))
* restyle ExploreLogs with Tailwind — signal tabs, white query card ([7c88347](https://github.com/aceobservability/ace/commit/7c883473ab9491df108ffe49662293b600567cf9))
* restyle ExploreTraces with Tailwind — white panels, filter bar ([4a95dd0](https://github.com/aceobservability/ace/commit/4a95dd0267ef994b57bb1a6735ef0d2bda8494dd))
* restyle LoginView with Tailwind — dark slate-950 bg, emerald primary button ([c5aafb9](https://github.com/aceobservability/ace/commit/c5aafb9e34543273b6c697099424079a3155c25e))
* restyle LogViewer with Tailwind — dark header, level badges, expandable rows ([17808bd](https://github.com/aceobservability/ace/commit/17808bd86e554b506cb39f59f62841c95ed4b350))
* restyle OrganizationDropdown with Tailwind — light dropdown, emerald accent ([e59d96f](https://github.com/aceobservability/ace/commit/e59d96f73aac5a16b1768d36c55aa43e9f4f522e))
* restyle OrganizationSettings with Tailwind — tabbed sections, member table ([e2f1b04](https://github.com/aceobservability/ace/commit/e2f1b046fb28e05bb58c7e3eb7167ecde2f14d4a))
* restyle Panel with Tailwind — white card with slate border ([e9b302f](https://github.com/aceobservability/ace/commit/e9b302f2c136e3ddbc2b60ff681523d8688982b9))
* restyle PanelEditModal with Tailwind — white dialog, emerald selections ([7a51467](https://github.com/aceobservability/ace/commit/7a51467c3b76d9f59cbde41a7b1c6a8d3fa8e603))
* restyle permission editors with Tailwind — light tables, emerald accents ([c9df1da](https://github.com/aceobservability/ace/commit/c9df1da0ecf6fac9f8825ce97d465b451cd4fd9a))
* restyle PrivacySettingsView with Tailwind — white card, emerald toggles ([fbe0b0f](https://github.com/aceobservability/ace/commit/fbe0b0f209637fc849e91d0d362790f2a67365d5))
* restyle Sidebar with Tailwind — dark slate-950 bg, emerald active states ([cc45f99](https://github.com/aceobservability/ace/commit/cc45f994676cc5373ecdfe3c7ac4022eb7f74f2e))
* restyle TimeRangePicker with Tailwind — light presets, emerald active state ([fe74f6c](https://github.com/aceobservability/ace/commit/fe74f6c694ca9f964937fa28727785dfcccf0749))
* restyle trace components with Tailwind — service graph, timeline, span details ([7cf6e99](https://github.com/aceobservability/ace/commit/7cf6e991671ee0547e524e5d5d2527a533af0aef))
* rewrite seed command with 4-org multi-stack support ([b4337aa](https://github.com/aceobservability/ace/commit/b4337aafcd902cb05b75b54abba038e583a16958))
* SECURITY-SCANNING-001 add automated security checks for CI and local runs ([93fbff3](https://github.com/aceobservability/ace/commit/93fbff3f53a4469090fafbbbdf04b95bc96fb386))
* Set up project architecture and foundation ([4ae5a49](https://github.com/aceobservability/ace/commit/4ae5a49bf8a437d9421056f78f065fe53bf04467))
* Set up project architecture and foundation ([e37e2b2](https://github.com/aceobservability/ace/commit/e37e2b2ad75ad4010cd461e58a70fa9fb7582368))
* SIDEBAR-OVERFLOW-001 fix collapsed sidebar toggle overflow ([27f618a](https://github.com/aceobservability/ace/commit/27f618a7e4238b07a4648dd07c0125a995e6c0f4))
* simplify routes by removing /app prefix, keep aliases for backwards compat ([1ee8c54](https://github.com/aceobservability/ace/commit/1ee8c543d3de4fa00f045019f7558204052b8b84))
* SINGLE-CLICK-001 single-click explorer interactions ([9fcfa7b](https://github.com/aceobservability/ace/commit/9fcfa7ba9be8e505e735c986ec54db628c412306))
* SSO-CONFIGURED-ONLY-001 streamline configured auth methods ([3818ebc](https://github.com/aceobservability/ace/commit/3818ebcf1769a88a94eedd6de6f0fa718867a384))
* SSO-FE-API-001 add org SSO API module ([65b94f5](https://github.com/aceobservability/ace/commit/65b94f5c664bc73d79728b4392422e65d1a17dc3))
* SSO-FE-TEST-001 add SSO settings UI tests ([16e8eee](https://github.com/aceobservability/ace/commit/16e8eee2bfe08d830d69b3f84eaab73d2bf6a0c0))
* SSO-FE-UI-001 add org settings SSO controls ([8d9fe1a](https://github.com/aceobservability/ace/commit/8d9fe1a70645cc0f57a3ea9872ed4e3cf4b8ace6))
* SSO-FE-UI-002 restructure SSO configure flow ([56cfee1](https://github.com/aceobservability/ace/commit/56cfee13459d52490228b59726dba31ea4fdb252))
* SSO-FE-UI-003 provider picker flow ([4aeeba2](https://github.com/aceobservability/ace/commit/4aeeba2a85dc44a2d1c675f6d597ec5992ac62d3))
* streamline local bootstrap and datasource identification ([8c5ab8d](https://github.com/aceobservability/ace/commit/8c5ab8d6978f979df6c3cf6669cdc4d60dd7287c))
* table and bar charts ([030593c](https://github.com/aceobservability/ace/commit/030593c7585e8ac985e35bf62ccce3b3cd63e82a))
* task-1 - frontend/src/views/Explore.spec.ts ([c1a67b0](https://github.com/aceobservability/ace/commit/c1a67b0499e67a886528c904b151ba8b824e4b29))
* task-1 - frontend/src/views/Explore.spec.ts ([e58d36f](https://github.com/aceobservability/ace/commit/e58d36f4de4065cfbf29116234f56bf170391a65))
* TRACING-API-001 add tracing datasource APIs ([d5c45df](https://github.com/aceobservability/ace/commit/d5c45dfde84e21a7c064b8fed55433c344245a13))
* TRACING-AUTO-INSTRUMENT-001 add otel tracing pipeline ([de5a49e](https://github.com/aceobservability/ace/commit/de5a49ecfb84e354682d65cd9e8375d0a9d9fbf8))
* TRACING-DATASOURCE-001 add tracing datasource setup ([f2917dd](https://github.com/aceobservability/ace/commit/f2917ddaf0f18790f8d68951c146f625b637deb8))
* TRACING-INTEGRATION-001 add trace-to-logs and metrics context ([b01759f](https://github.com/aceobservability/ace/commit/b01759f21617f96de54f086eb61c8189265000a1))
* TRACING-PANELS-001 add trace list and heatmap panels ([5cae6dd](https://github.com/aceobservability/ace/commit/5cae6ddc1983ef8e1e6353ea8fbfa7af22aa4d98))
* TRACING-SERVICE-GRAPH-001 add trace service dependency graph ([8eb3947](https://github.com/aceobservability/ace/commit/8eb394726fa4abc5a67ab62b3c9fe09059f26710))
* TRACING-SPAN-DETAILS-001 span details panel ([2d82b33](https://github.com/aceobservability/ace/commit/2d82b33c6c64d3f605afa77cb7d6beaeacaadbe8))
* TRACING-TIMELINE-001 trace timeline waterfall ([1d2f8b9](https://github.com/aceobservability/ace/commit/1d2f8b9070984dcce03c9a7c92c354f95832fce9))
* UI improvements across frontend components and backend models ([e0ccf93](https://github.com/aceobservability/ace/commit/e0ccf9338c4f045254c80aa380c85ced4046d795))
* UI overhaul and small fixes ([224ba48](https://github.com/aceobservability/ace/commit/224ba4829f6b77f4d60ba58c6362c2b0fb4a8b7e))
* UNFILED-DASHBOARDS-ROOT-001 move unfiled dashboards to root ([670aae4](https://github.com/aceobservability/ace/commit/670aae454c331b54b1c202330b8b0fd0b1f0a87f))
* update AlertsView with enterprise design language ([a84b709](https://github.com/aceobservability/ace/commit/a84b709de2c173d54e0029f0946f442951c11178))
* update dashboard views with enterprise design language ([914fbdd](https://github.com/aceobservability/ace/commit/914fbdd6398e8854c54860bfa1b6749357076eba))
* update DashboardList with enterprise design language ([6100e09](https://github.com/aceobservability/ace/commit/6100e091490143693e1821cd2677a986260693d2))
* update design tokens for enterprise redesign — Inter font, true gray palette, premium dark mode ([96b98e3](https://github.com/aceobservability/ace/commit/96b98e3ec7430be22c2c8c95fd451db8f7353e7b))
* update explore views with enterprise design language ([a65f30a](https://github.com/aceobservability/ace/commit/a65f30a3048a04a273deb8b1433f510cc18380da))
* update LoginView with enterprise design language ([5d82984](https://github.com/aceobservability/ace/commit/5d82984b5bc23f57561f1a48b762c083e1001c2b))
* update modal components with enterprise design language ([19175ae](https://github.com/aceobservability/ace/commit/19175ae274626a70babbf130d790729edf3aebca))
* update organization settings with enterprise design language ([5cbde31](https://github.com/aceobservability/ace/commit/5cbde31f2e91a4da7664855ba95d05b8e2888336))
* update panel components with enterprise design language ([9217045](https://github.com/aceobservability/ace/commit/9217045ea3d77056b653d022534d9e3c67957af6))
* update query components with enterprise design language ([105e065](https://github.com/aceobservability/ace/commit/105e0651eb84a6b0a06237f175aae54f538d8ed9))
* update Ralph workflow to use PRs for changelog tracking ([646f101](https://github.com/aceobservability/ace/commit/646f101044a6c30bc526b5a1f76c18dcd372c9d4))
* update remaining components with enterprise design language ([9081d4d](https://github.com/aceobservability/ace/commit/9081d4d25d2bad61a2011ed331607881c45f7bf9))
* update remaining views with enterprise design language ([bef385e](https://github.com/aceobservability/ace/commit/bef385e7c09c9b25110e29526006a403db5ab99e))
* update trace components with enterprise design language ([bf1197b](https://github.com/aceobservability/ace/commit/bf1197b0273bd27117e9ff74ef9bc33c8cbcce21))
* Visual PromQL Query Builder ([77488a3](https://github.com/aceobservability/ace/commit/77488a30ab4e6e7047d7265c09034ef848e578c1))


### Bug Fixes

* add AlertManager to Victoria stack and persist JWT keys across restarts ([c225924](https://github.com/aceobservability/ace/commit/c22592428e60108b45ec049fb8deb9d41953b854))
* add missing branding and trace correlation inline migrations ([e3a1a91](https://github.com/aceobservability/ace/commit/e3a1a916a930f88e06298ef10ae9bf4ba1c470a8))
* authentication on open ([fd64cd1](https://github.com/aceobservability/ace/commit/fd64cd17a51c85b8f0161fe87aeb818ec1f9ba4f))
* auto-expand copilot chat textarea up to four lines ([8586b57](https://github.com/aceobservability/ace/commit/8586b573a95fa53f06ba5b0bfbd062d95caf7f3b))
* charts and layouts fixes ([1c0dae7](https://github.com/aceobservability/ace/commit/1c0dae74bd258d1216e16b9023c50325c327f4b5))
* clear rendered HTML cache when chat is cleared ([3b02175](https://github.com/aceobservability/ace/commit/3b021757bd18107358a003ee9b7a6164639cd880))
* copilot panel initialization, button overlap, and tool call parsing ([c80b2ea](https://github.com/aceobservability/ace/commit/c80b2ead7b52d484951e06fee1bd7690dff018a3))
* DASHBOARD-401-001 prevent dashboard open 401s ([c160534](https://github.com/aceobservability/ace/commit/c1605344c046801717ec9b743468df0f6450b149))
* DASHBOARD-TIME-RANGE-OVERLAY-001 keep picker dropdown above panels ([c8ba139](https://github.com/aceobservability/ace/commit/c8ba13923e5350fe8086a41a33787a6f9830366a))
* expand collapsed sidebar on hover ([702d4fd](https://github.com/aceobservability/ace/commit/702d4fd6896645df99b64e32a27932329d108a2e))
* handle expired token errors on organization settings page ([#66](https://github.com/aceobservability/ace/issues/66)) ([db14e03](https://github.com/aceobservability/ace/commit/db14e031ffe2d257c794e29ee8146fbb83563fa5))
* make backend use compatible Go and update air config ([b461e53](https://github.com/aceobservability/ace/commit/b461e53515acb36f16c511a89ac2bed9995b28ae))
* merge gauge and pie chart configurations ([5773bfd](https://github.com/aceobservability/ace/commit/5773bfd560c85d75aed9007120747190ca4220ad))
* merge stat panel with gauge and pie chart configurations ([5389a10](https://github.com/aceobservability/ace/commit/5389a1013cf6aa3033c5bcbd6bc470439219e848))
* monaco editor now works with overlap fixed ([d971dd0](https://github.com/aceobservability/ace/commit/d971dd021b0f2a9734e485297cbbd7e72825e127))
* move gitleaks secret check from job-level to step-level if ([ff06cd5](https://github.com/aceobservability/ace/commit/ff06cd508e79c29a02680d34dbc17e2103ff721e))
* normalize trace search results and refine graph arrows ([8513820](https://github.com/aceobservability/ace/commit/8513820742075f67c9b8c00532a16fba113d249f))
* remap settings button ([6e9a81c](https://github.com/aceobservability/ace/commit/6e9a81c59757d661f450ec90e0b165d6639f3907))
* remove GitHub connection gate from copilot sidebar ([4aec830](https://github.com/aceobservability/ace/commit/4aec8305f1be7f8b887295aae7a886b228310137))
* resolve 7 CodeQL security alerts ([#122](https://github.com/aceobservability/ace/issues/122)) ([bd8be12](https://github.com/aceobservability/ace/commit/bd8be128d9b53bb8ace01e8e31e45f90654273e1))
* resolve all lint issues across backend and frontend ([765440c](https://github.com/aceobservability/ace/commit/765440c9834db6dd8f0b296a15e9886be035762f))
* Resolve merge conflicts in prd.json and progress.txt ([53e386b](https://github.com/aceobservability/ace/commit/53e386bd20327ac7540a2c86486dc2efba4ec48e))
* resolve merge conflicts with master ([10bbfd8](https://github.com/aceobservability/ace/commit/10bbfd82d9f8f08470edf00a9b492e59e9c7ad3b))
* resolve merge conflicts with master ([40c80f2](https://github.com/aceobservability/ace/commit/40c80f23a5a1dc9b5cf1e193ef7deae1ac424e5a))
* resolve security vulnerabilities and add frontend test IDs ([#119](https://github.com/aceobservability/ace/issues/119)) ([1cf2097](https://github.com/aceobservability/ace/commit/1cf2097ca92031ae19f08b2550d42271f061960a))
* secure SSO state cookies and close CodeQL alerts ([a83a49b](https://github.com/aceobservability/ace/commit/a83a49b3215d6463c754973b7e38be906b682963))
* stabilize release workflow checks and rerun support ([136c41d](https://github.com/aceobservability/ace/commit/136c41d6f086118fab4ebd241388df9a78dde0ec))
* sync frontend package-lock with package.json ([#117](https://github.com/aceobservability/ace/issues/117)) ([f7c39ae](https://github.com/aceobservability/ace/commit/f7c39aeacc4f3b070270b03c9de9703fc34537d3))
* update Monaco editor deep overrides to light theme values ([543d2be](https://github.com/aceobservability/ace/commit/543d2be3c5c476b5dcdcbdb8d135b63604265afc))
* update Panel.vue to use new useProm API with options object ([7faa2d3](https://github.com/aceobservability/ace/commit/7faa2d3577b7ff49e72ae14d13eaeb8bea0a3074))
* update tests and lint after dark mode theming changes ([f73687a](https://github.com/aceobservability/ace/commit/f73687a355e393186c62eb21ae3b0305901d9c3e))
* use Jaeger-compatible API for VictoriaTraces search ([5940185](https://github.com/aceobservability/ace/commit/59401856170aba6b4f5133abe45dc8dcbe9b5abf))
* use K8s service names instead of localhost in seed datasource URLs ([#60](https://github.com/aceobservability/ace/issues/60)) ([fcce07f](https://github.com/aceobservability/ace/commit/fcce07f98354368c74f4f0e636f11cc4cc897f86))


### Documentation

* add copilot MCP tools design for VictoriaMetrics ([3823b2b](https://github.com/aceobservability/ace/commit/3823b2b93dc0bf8110d03dfa03fadafa3101d335))
* add copilot MCP tools implementation plan ([be12e01](https://github.com/aceobservability/ace/commit/be12e012cb70e6800f3ec61e6869c1dfb1827652))
* add design for copilot markdown support and resizable panel ([53f6be2](https://github.com/aceobservability/ace/commit/53f6be2c62e79274fc38e1a3a0f2d9b18e963431))
* add implementation plan for copilot markdown and resizable panel ([0e201c7](https://github.com/aceobservability/ace/commit/0e201c715572e97ce0d88bebb34d02b29d7d97b7))
* Add PostHog backend and frontend integration tickets ([#249](https://github.com/aceobservability/ace/issues/249), [#250](https://github.com/aceobservability/ace/issues/250)) ([5143d75](https://github.com/aceobservability/ace/commit/5143d75092d9a161aa856ae567a2e3a4db69af30))
* Add PostHog EU region config and API keys ([2ff560b](https://github.com/aceobservability/ace/commit/2ff560b76b2833b385292e28e95f122517fba293))
* AGENTS-DOC-001 refresh agent workflow guide ([2d0b7c9](https://github.com/aceobservability/ace/commit/2d0b7c9f35b05aae74b9522f96d66ab4495513be))
* clarify local logstash pipeline for ELK ([d7679bd](https://github.com/aceobservability/ace/commit/d7679bdbd5099d35150b4a34a2d353f9881d44f4))
* README-BADGES-002 add workflow status badges ([0ef68b0](https://github.com/aceobservability/ace/commit/0ef68b069488a1bf53eb7e9fe2b36b05bf2cb579))
* Remove PostHog API keys (moved to Speke) ([bdc1752](https://github.com/aceobservability/ace/commit/bdc1752450fec3b61581d8b6b5904ec5bfd64ef3))
* Update PostHog host to https://eu.i.posthog.com ([173c726](https://github.com/aceobservability/ace/commit/173c7266436d2d969bfc2d63337fd08a231a391b))


### CI

* harden security workflow and extend local quality checks ([d35faa7](https://github.com/aceobservability/ace/commit/d35faa70fa3a0e0f424dd7efb93a6eb13ff84946))
* unblock dependabot security workflow ([045990f](https://github.com/aceobservability/ace/commit/045990fd11f93107c82097f1a2f1039a47a3da33))
* unblock dependabot security workflow ([ae49aa4](https://github.com/aceobservability/ace/commit/ae49aa47cea6925a7f140e6b65372c71771f2382))
* update coverage badge [skip ci] ([9f139c6](https://github.com/aceobservability/ace/commit/9f139c60253ca727fa18e50ca322b5cbc0a9b2e9))
* update coverage badge [skip ci] ([c2b5305](https://github.com/aceobservability/ace/commit/c2b5305881a2d8065f0734364373eed2008c5778))
* update coverage badge [skip ci] ([6b9d245](https://github.com/aceobservability/ace/commit/6b9d2453512f5fe479f63442f13c598a3e58b26f))
* update coverage badge [skip ci] ([79e3e08](https://github.com/aceobservability/ace/commit/79e3e08da8c36d33111bcd571a279c7481a2f53e))
* update coverage badge [skip ci] ([390807e](https://github.com/aceobservability/ace/commit/390807ebf73e3934f41e0cc99854eef1d9a8ad03))
* update coverage badge [skip ci] ([94856f8](https://github.com/aceobservability/ace/commit/94856f8151ecf26ae88eea6919938ba2d2d56562))
* update coverage badge [skip ci] ([b2104e2](https://github.com/aceobservability/ace/commit/b2104e269c411006dc4fd2520848b1d251879591))
* update coverage badge [skip ci] ([3ae3e4f](https://github.com/aceobservability/ace/commit/3ae3e4fb8807c0e4cda74e3bec2f3ee43f341b80))
* update coverage badge [skip ci] ([0833767](https://github.com/aceobservability/ace/commit/0833767315aaedf3df554bf4da317c431c99eebf))
* update coverage badge [skip ci] ([1a0d947](https://github.com/aceobservability/ace/commit/1a0d947c69b95dd747540b2eb8482860a23367b1))
* update coverage badge [skip ci] ([7124b09](https://github.com/aceobservability/ace/commit/7124b09353a9a2fcbf2fd61f8b571fda4ce7c756))

## [0.4.1](https://github.com/aceobservability/ace/compare/v0.4.0...v0.4.1) (2026-03-21)


### Bug Fixes

* move gitleaks secret check from job-level to step-level if ([ff06cd5](https://github.com/aceobservability/ace/commit/ff06cd508e79c29a02680d34dbc17e2103ff721e))
* resolve security vulnerabilities and add frontend test IDs ([#119](https://github.com/aceobservability/ace/issues/119)) ([1cf2097](https://github.com/aceobservability/ace/commit/1cf2097ca92031ae19f08b2550d42271f061960a))
* sync frontend package-lock with package.json ([#117](https://github.com/aceobservability/ace/issues/117)) ([f7c39ae](https://github.com/aceobservability/ace/commit/f7c39aeacc4f3b070270b03c9de9703fc34537d3))

## [0.4.0](https://github.com/aceobservability/ace/compare/v0.3.0...v0.4.0) (2026-03-18)


### Features

* [#407](https://github.com/aceobservability/ace/issues/407) VMAlert datasource — client, proxy handlers, AlertsView with active alerts + rule groups ([#56](https://github.com/aceobservability/ace/issues/56)) ([ec4d774](https://github.com/aceobservability/ace/commit/ec4d774567817230010e5faa7e18e96b3ce91d72))
* [#408](https://github.com/aceobservability/ace/issues/408) AlertManager datasource — client, proxy handlers, silences management, receivers ([#58](https://github.com/aceobservability/ace/issues/58)) ([a8cddc4](https://github.com/aceobservability/ace/commit/a8cddc4a43fe58a4ee9b0cefc16a4fe70f764c76))
* [#409](https://github.com/aceobservability/ace/issues/409) app UI styling overhaul — amber accent system, component sweep, typography ([#57](https://github.com/aceobservability/ace/issues/57)) ([e650ab5](https://github.com/aceobservability/ace/commit/e650ab5d86f60c0d00459e03b793d725d6b8b958))
* [#410](https://github.com/aceobservability/ace/issues/410) migrate frontend to Tailwind CSS v4 — styles live in components ([#59](https://github.com/aceobservability/ace/issues/59)) ([8eb644a](https://github.com/aceobservability/ace/commit/8eb644a81cc52dfe810f6780fe5c9d43014cb8e7))
* [#428](https://github.com/aceobservability/ace/issues/428) move datasources from sidebar to organisation settings ([#62](https://github.com/aceobservability/ace/issues/62)) ([b3e3042](https://github.com/aceobservability/ace/commit/b3e30427fb201711d1aaf4c0cf6b47c5a35a551e))
* [#431](https://github.com/aceobservability/ace/issues/431) GitHub Copilot AI query assistant — OAuth connect, chat panel, datasource-aware system prompts ([#64](https://github.com/aceobservability/ace/issues/64)) ([b2daafd](https://github.com/aceobservability/ace/commit/b2daafd14f63360d072dc4493361e0bf9313a716))
* [#432](https://github.com/aceobservability/ace/issues/432) log→trace correlation — trace_id_field config, clickable trace IDs in LogViewer, correlated seed data generator ([#63](https://github.com/aceobservability/ace/issues/63)) ([27bdf17](https://github.com/aceobservability/ace/commit/27bdf1742e7e3da6902aa004733fde7e54fb1ad4))
* [#433](https://github.com/aceobservability/ace/issues/433) dark/light mode toggle — CSS token system, useTheme composable, localStorage + browser preference ([#65](https://github.com/aceobservability/ace/issues/65)) ([4f2a908](https://github.com/aceobservability/ace/commit/4f2a908559a0e463b3a6bf85452de7d9fbf8a820))
* [#434](https://github.com/aceobservability/ace/issues/434) org white-labelling — custom accent color, logo upload, app title per org ([#67](https://github.com/aceobservability/ace/issues/67)) ([6729fc8](https://github.com/aceobservability/ace/commit/6729fc8c17a7a22f2ad294fcb2982ccd5a1d6cd8))
* [#435](https://github.com/aceobservability/ace/issues/435) GitHub Copilot per-org OAuth App credentials — replaces global env vars with org-scoped sso_configs ([#68](https://github.com/aceobservability/ace/issues/68)) ([e7674f5](https://github.com/aceobservability/ace/commit/e7674f5a4637248a5e43ab63924981601c01a7b3))
* add CloudWatch datasource integration across backend and frontend ([6a9330f](https://github.com/aceobservability/ace/commit/6a9330f2fb47f765e33fef1a2d7d10359812c4f6))
* add compose-reset target and vmalert/alertmanager datasource types ([3355d07](https://github.com/aceobservability/ace/commit/3355d07ba14a85de80ea615e6f0dfc30611408e9))
* add datasource creation view with draft connection testing ([7f51207](https://github.com/aceobservability/ace/commit/7f512073fb25220691768a7fecc147e977779951))
* add datasource health check to traces screen and OTel collector/telemetrygen infra ([78c567a](https://github.com/aceobservability/ace/commit/78c567aacb4795187eec1ae31f0b9f42194c97fd))
* add datasource logo mapping utility ([9e9129c](https://github.com/aceobservability/ace/commit/9e9129cd6ad30acd500b81cb14da7d5e77a60041))
* add ELK Elasticsearch datasource integration ([b3eca66](https://github.com/aceobservability/ace/commit/b3eca66c5e0e11f2c7d3eb6f6d788b96456534b2))
* add markdown rendering dependencies (marked, shiki, dompurify, typography) ([96a8c43](https://github.com/aceobservability/ace/commit/96a8c43380538d3ab099b1de4975e6af55b50199))
* add markdown rendering utility with shiki syntax highlighting ([e19a1b4](https://github.com/aceobservability/ace/commit/e19a1b4774b5258c8f013d055b79d0a29dc46dc9))
* add MCP tool definitions and executor for VictoriaMetrics ([5204a04](https://github.com/aceobservability/ace/commit/5204a040c51da7d0cefef444d779d0b6aef38c4d))
* add metadata methods to VictoriaMetrics client ([b176908](https://github.com/aceobservability/ace/commit/b17690865a439518a64403bebaab0f2a90fd77ed))
* add metric-names API and extend labels with metric filter ([8938fe0](https://github.com/aceobservability/ace/commit/8938fe03482ca9a90e45d6351a646188e2ccb84d))
* add metric-names endpoint and extend labels for VictoriaMetrics ([a748f0c](https://github.com/aceobservability/ace/commit/a748f0c15875bd922e3f9627ae1d1df2610a45df))
* add production Helm chart for Ace with VictoriaMetrics stack ([#494](https://github.com/aceobservability/ace/issues/494)) ([23de2ac](https://github.com/aceobservability/ace/commit/23de2ac2628a59f1d5c4d093309299a6be992ccd))
* add production Helm chart for Ace with VictoriaMetrics stack ([#494](https://github.com/aceobservability/ace/issues/494)) ([a9527ae](https://github.com/aceobservability/ace/commit/a9527aecfba2f4fd21106e5affde5097f5ca7b48))
* add resizable copilot panel with drag handle ([96078cf](https://github.com/aceobservability/ace/commit/96078cf7227fec8488cb21d5d06c5526d8f7dbeb))
* add seed-dashboards command with default dashboards for local dev stack ([#61](https://github.com/aceobservability/ace/issues/61)) ([8617716](https://github.com/aceobservability/ace/commit/8617716528fafe42e5d3226bb8744be529f2d799))
* add sendChatRequest with tool calling support to useCopilot ([f4c85f1](https://github.com/aceobservability/ace/commit/f4c85f191c6f3cbed95001f37f1024428fa7dc7d))
* add tailwind typography plugin and copilot prose overrides ([b133cb2](https://github.com/aceobservability/ace/commit/b133cb26da1fefe31555beb5c514119fc7d87439))
* add tool calling loop to CopilotPanel for VictoriaMetrics MCP ([804103a](https://github.com/aceobservability/ace/commit/804103af0cc01a9b0ee48bfa4e907c2389359982))
* add useQueryEditor composable for copilot editor bridge ([636599d](https://github.com/aceobservability/ace/commit/636599d14bf6c6608f1abf4973f7ffb0f9ddd1cb))
* convert App.vue layout to Tailwind with light bg-slate-50 content area ([0eca1f0](https://github.com/aceobservability/ace/commit/0eca1f05ac2d9953a7a618b839d32fce192cedf2))
* copilot device flow auth, model selection, and bug fixes ([7d5d7fa](https://github.com/aceobservability/ace/commit/7d5d7fa725ccf1d4040d5d6e8a51c44cfcb17a3a))
* dark mode atmosphere, refined palette, and pinnable sidebar ([782630a](https://github.com/aceobservability/ace/commit/782630a4a3d9743b3df89e29511d3196bb33d5bd))
* install Tailwind CSS v4 and replace global style.css with style guide theme ([6be95ed](https://github.com/aceobservability/ace/commit/6be95ed1c4a0925ff6039b3746cfa87ab9f817b9))
* integrate full markdown rendering into copilot messages ([b35e96c](https://github.com/aceobservability/ace/commit/b35e96cf01df4a061a1259dc7112145e533fad9d))
* move copilot panel to app-level layout for global visibility ([c08e999](https://github.com/aceobservability/ace/commit/c08e999a249a69763723d87095c81e7c07d6b8f7))
* pass through tools and support non-streaming in copilot chat handler ([9b6b455](https://github.com/aceobservability/ace/commit/9b6b4554ca802baf8570b1f918b287d41dfd684a))
* redesign sidebar as slim icon rail with hover flyout ([5420617](https://github.com/aceobservability/ace/commit/54206172b77f297e8c7e549329d70ff5715e1686))
* register Explore metrics editor with useQueryEditor bridge ([9f44365](https://github.com/aceobservability/ace/commit/9f4436533448b37feeaa379a31e993c92bbcf408))
* replace hardcoded emerald classes with dynamic accent CSS variables for org branding ([1419e3e](https://github.com/aceobservability/ace/commit/1419e3ecafdca24ac827500970c82c5cf529d8fc))
* replace vite-plugin-monaco-editor with manual worker setup ([8272d09](https://github.com/aceobservability/ace/commit/8272d095c33eed19f8038b178f9597a8b0109644))
* restore alerts route to router configuration ([200602f](https://github.com/aceobservability/ace/commit/200602f8cc83759e629abd783df09ca02ddd08e2))
* restore compose/seed targets and add dark mode theming ([7766950](https://github.com/aceobservability/ace/commit/7766950312722b682c1b4ffe5956189d0a1beb2c))
* restyle AlertsView with Tailwind — tabbed layout, colored alert borders ([5e566a5](https://github.com/aceobservability/ace/commit/5e566a548e25dce2a2f518afb19a31be0eb5311f))
* restyle all query builders and editors with Tailwind ([c540cc0](https://github.com/aceobservability/ace/commit/c540cc06c7f8b4f281cc6f9f4f78f7736e8452e9))
* restyle chart and stat components with Tailwind — emerald palette, white cards ([383af70](https://github.com/aceobservability/ace/commit/383af70e40df43e05f027781c237b3500b4c2f7c))
* restyle CookieConsentBanner and CreateOrganizationModal with Tailwind ([6b0c78c](https://github.com/aceobservability/ace/commit/6b0c78c828acb9bca15c14d0ddeac31ed87f6744))
* restyle Create/Edit dashboard modals with Tailwind ([c61e162](https://github.com/aceobservability/ace/commit/c61e162164696cbb47dcc72869d708461eac3f40))
* restyle DashboardDetailView with Tailwind — white panel cards, light grid area ([7a3e046](https://github.com/aceobservability/ace/commit/7a3e046a2fcb35aad3ac7211a57fa3f6c69db748))
* restyle DashboardList with Tailwind — white cards, emerald folder accents ([59dec42](https://github.com/aceobservability/ace/commit/59dec426a539bdf92a733aa8d8e2118cfd32a269))
* restyle DashboardSettingsView with Tailwind — tabbed settings, white cards ([81e2b5e](https://github.com/aceobservability/ace/commit/81e2b5ed8d297f2eda99175ecd402c775e1f4b5d))
* restyle DataSource pages with Tailwind — white cards, health indicators, type selector ([77ae39b](https://github.com/aceobservability/ace/commit/77ae39b2d36b35a668190bf3a7570db79105b1e3))
* restyle Explore metrics view with Tailwind — white cards, emerald query button ([8e78ec4](https://github.com/aceobservability/ace/commit/8e78ec4e0cc1beb16e2b4d43262af212104c73cf))
* restyle ExploreLogs with Tailwind — signal tabs, white query card ([7c88347](https://github.com/aceobservability/ace/commit/7c883473ab9491df108ffe49662293b600567cf9))
* restyle ExploreTraces with Tailwind — white panels, filter bar ([4a95dd0](https://github.com/aceobservability/ace/commit/4a95dd0267ef994b57bb1a6735ef0d2bda8494dd))
* restyle LoginView with Tailwind — dark slate-950 bg, emerald primary button ([c5aafb9](https://github.com/aceobservability/ace/commit/c5aafb9e34543273b6c697099424079a3155c25e))
* restyle LogViewer with Tailwind — dark header, level badges, expandable rows ([17808bd](https://github.com/aceobservability/ace/commit/17808bd86e554b506cb39f59f62841c95ed4b350))
* restyle OrganizationDropdown with Tailwind — light dropdown, emerald accent ([e59d96f](https://github.com/aceobservability/ace/commit/e59d96f73aac5a16b1768d36c55aa43e9f4f522e))
* restyle OrganizationSettings with Tailwind — tabbed sections, member table ([e2f1b04](https://github.com/aceobservability/ace/commit/e2f1b046fb28e05bb58c7e3eb7167ecde2f14d4a))
* restyle Panel with Tailwind — white card with slate border ([e9b302f](https://github.com/aceobservability/ace/commit/e9b302f2c136e3ddbc2b60ff681523d8688982b9))
* restyle PanelEditModal with Tailwind — white dialog, emerald selections ([7a51467](https://github.com/aceobservability/ace/commit/7a51467c3b76d9f59cbde41a7b1c6a8d3fa8e603))
* restyle permission editors with Tailwind — light tables, emerald accents ([c9df1da](https://github.com/aceobservability/ace/commit/c9df1da0ecf6fac9f8825ce97d465b451cd4fd9a))
* restyle PrivacySettingsView with Tailwind — white card, emerald toggles ([fbe0b0f](https://github.com/aceobservability/ace/commit/fbe0b0f209637fc849e91d0d362790f2a67365d5))
* restyle Sidebar with Tailwind — dark slate-950 bg, emerald active states ([cc45f99](https://github.com/aceobservability/ace/commit/cc45f994676cc5373ecdfe3c7ac4022eb7f74f2e))
* restyle TimeRangePicker with Tailwind — light presets, emerald active state ([fe74f6c](https://github.com/aceobservability/ace/commit/fe74f6c694ca9f964937fa28727785dfcccf0749))
* restyle trace components with Tailwind — service graph, timeline, span details ([7cf6e99](https://github.com/aceobservability/ace/commit/7cf6e991671ee0547e524e5d5d2527a533af0aef))
* rewrite seed command with 4-org multi-stack support ([b4337aa](https://github.com/aceobservability/ace/commit/b4337aafcd902cb05b75b54abba038e583a16958))
* simplify routes by removing /app prefix, keep aliases for backwards compat ([1ee8c54](https://github.com/aceobservability/ace/commit/1ee8c543d3de4fa00f045019f7558204052b8b84))
* UI improvements across frontend components and backend models ([e0ccf93](https://github.com/aceobservability/ace/commit/e0ccf9338c4f045254c80aa380c85ced4046d795))
* update AlertsView with enterprise design language ([a84b709](https://github.com/aceobservability/ace/commit/a84b709de2c173d54e0029f0946f442951c11178))
* update dashboard views with enterprise design language ([914fbdd](https://github.com/aceobservability/ace/commit/914fbdd6398e8854c54860bfa1b6749357076eba))
* update DashboardList with enterprise design language ([6100e09](https://github.com/aceobservability/ace/commit/6100e091490143693e1821cd2677a986260693d2))
* update design tokens for enterprise redesign — Inter font, true gray palette, premium dark mode ([96b98e3](https://github.com/aceobservability/ace/commit/96b98e3ec7430be22c2c8c95fd451db8f7353e7b))
* update explore views with enterprise design language ([a65f30a](https://github.com/aceobservability/ace/commit/a65f30a3048a04a273deb8b1433f510cc18380da))
* update LoginView with enterprise design language ([5d82984](https://github.com/aceobservability/ace/commit/5d82984b5bc23f57561f1a48b762c083e1001c2b))
* update modal components with enterprise design language ([19175ae](https://github.com/aceobservability/ace/commit/19175ae274626a70babbf130d790729edf3aebca))
* update organization settings with enterprise design language ([5cbde31](https://github.com/aceobservability/ace/commit/5cbde31f2e91a4da7664855ba95d05b8e2888336))
* update panel components with enterprise design language ([9217045](https://github.com/aceobservability/ace/commit/9217045ea3d77056b653d022534d9e3c67957af6))
* update query components with enterprise design language ([105e065](https://github.com/aceobservability/ace/commit/105e0651eb84a6b0a06237f175aae54f538d8ed9))
* update remaining components with enterprise design language ([9081d4d](https://github.com/aceobservability/ace/commit/9081d4d25d2bad61a2011ed331607881c45f7bf9))
* update remaining views with enterprise design language ([bef385e](https://github.com/aceobservability/ace/commit/bef385e7c09c9b25110e29526006a403db5ab99e))
* update trace components with enterprise design language ([bf1197b](https://github.com/aceobservability/ace/commit/bf1197b0273bd27117e9ff74ef9bc33c8cbcce21))


### Bug Fixes

* add AlertManager to Victoria stack and persist JWT keys across restarts ([c225924](https://github.com/aceobservability/ace/commit/c22592428e60108b45ec049fb8deb9d41953b854))
* add missing branding and trace correlation inline migrations ([e3a1a91](https://github.com/aceobservability/ace/commit/e3a1a916a930f88e06298ef10ae9bf4ba1c470a8))
* auto-expand copilot chat textarea up to four lines ([8586b57](https://github.com/aceobservability/ace/commit/8586b573a95fa53f06ba5b0bfbd062d95caf7f3b))
* clear rendered HTML cache when chat is cleared ([3b02175](https://github.com/aceobservability/ace/commit/3b021757bd18107358a003ee9b7a6164639cd880))
* copilot panel initialization, button overlap, and tool call parsing ([c80b2ea](https://github.com/aceobservability/ace/commit/c80b2ead7b52d484951e06fee1bd7690dff018a3))
* handle expired token errors on organization settings page ([#66](https://github.com/aceobservability/ace/issues/66)) ([db14e03](https://github.com/aceobservability/ace/commit/db14e031ffe2d257c794e29ee8146fbb83563fa5))
* remove GitHub connection gate from copilot sidebar ([4aec830](https://github.com/aceobservability/ace/commit/4aec8305f1be7f8b887295aae7a886b228310137))
* resolve all lint issues across backend and frontend ([765440c](https://github.com/aceobservability/ace/commit/765440c9834db6dd8f0b296a15e9886be035762f))
* update Monaco editor deep overrides to light theme values ([543d2be](https://github.com/aceobservability/ace/commit/543d2be3c5c476b5dcdcbdb8d135b63604265afc))
* update tests and lint after dark mode theming changes ([f73687a](https://github.com/aceobservability/ace/commit/f73687a355e393186c62eb21ae3b0305901d9c3e))
* use Jaeger-compatible API for VictoriaTraces search ([5940185](https://github.com/aceobservability/ace/commit/59401856170aba6b4f5133abe45dc8dcbe9b5abf))
* use K8s service names instead of localhost in seed datasource URLs ([#60](https://github.com/aceobservability/ace/issues/60)) ([fcce07f](https://github.com/aceobservability/ace/commit/fcce07f98354368c74f4f0e636f11cc4cc897f86))


### Documentation

* add copilot MCP tools design for VictoriaMetrics ([3823b2b](https://github.com/aceobservability/ace/commit/3823b2b93dc0bf8110d03dfa03fadafa3101d335))
* add copilot MCP tools implementation plan ([be12e01](https://github.com/aceobservability/ace/commit/be12e012cb70e6800f3ec61e6869c1dfb1827652))
* add design for copilot markdown support and resizable panel ([53f6be2](https://github.com/aceobservability/ace/commit/53f6be2c62e79274fc38e1a3a0f2d9b18e963431))
* add implementation plan for copilot markdown and resizable panel ([0e201c7](https://github.com/aceobservability/ace/commit/0e201c715572e97ce0d88bebb34d02b29d7d97b7))
* clarify local logstash pipeline for ELK ([d7679bd](https://github.com/aceobservability/ace/commit/d7679bdbd5099d35150b4a34a2d353f9881d44f4))


### CI

* unblock dependabot security workflow ([045990f](https://github.com/aceobservability/ace/commit/045990fd11f93107c82097f1a2f1039a47a3da33))
* unblock dependabot security workflow ([ae49aa4](https://github.com/aceobservability/ace/commit/ae49aa47cea6925a7f140e6b65372c71771f2382))

## [0.3.0](https://github.com/janhoon/ace/compare/v0.2.0...v0.3.0) (2026-02-20)


### Features

* 265 add ClickHouse backend datasource core ([2b3cb60](https://github.com/janhoon/ace/commit/2b3cb604ba57f8d10452746e860e24c67e4c6ece))
* 266 - agent/prd.json.backup agent/progress.txt.backup frontend/src/components/Panel.vue frontend/src/composables/useDatasource.ts frontend/src/types/datasource.ts frontend/src/views/Explore.vue frontend/src/views/ExploreLogs.spec.ts frontend/src/views/ExploreLogs.vue frontend/src/views/ExploreTraces.vue ([fa19d15](https://github.com/janhoon/ace/commit/fa19d15b4200b10fbd1a9cc51dec07610c119d86))
* 266 - agent/prd.json.backup agent/progress.txt.backup frontend/src/components/Panel.vue frontend/src/composables/useDatasource.ts frontend/src/types/datasource.ts frontend/src/views/Explore.vue frontend/src/views/ExploreLogs.spec.ts frontend/src/views/ExploreLogs.vue frontend/src/views/ExploreTraces.vue ([c8d4296](https://github.com/janhoon/ace/commit/c8d429637a4fe3aeabf89dae8f12992684253463))
* 266 add clickhouse sql editor and settings ([1e10f39](https://github.com/janhoon/ace/commit/1e10f39935091eb8da6f06904d99d2a7662ff623))
* 267 clickhouse explore views and panel routing ([8a4803b](https://github.com/janhoon/ace/commit/8a4803b0efaf8765d4bd43dc70cdf5bfa2aa6146))
* add ClickHouse datasource tickets [#265](https://github.com/janhoon/ace/issues/265), [#266](https://github.com/janhoon/ace/issues/266), [#267](https://github.com/janhoon/ace/issues/267) to PRD ([102aea5](https://github.com/janhoon/ace/commit/102aea5e10f4638d3960ae443f38f1d823e6dd50))
* LANDING-COMPARISON-001 add comparison table ([ae27477](https://github.com/janhoon/ace/commit/ae27477149537798dd61014d89c6ae06b7715cb6))
* LANDING-FEATURES-001 add landing feature cards ([3ca4ae5](https://github.com/janhoon/ace/commit/3ca4ae5b3535866016fb96ef225a84700b570443))
* LANDING-FOOTER-001 add landing footer CTA ([1bb0bf9](https://github.com/janhoon/ace/commit/1bb0bf9b45d7fd0f9db6c4c2a497b7440185faa5))
* LANDING-HERO-001 build landing hero section ([ac8cb1e](https://github.com/janhoon/ace/commit/ac8cb1edc9fc67b89938909b3a7b061829bf5726))
* LANDING-SCREENSHOTS-001 add landing screenshot gallery ([3c5cbc3](https://github.com/janhoon/ace/commit/3c5cbc3429acf0c1adfbde9e0b445cc32bd8c8a3))
* LANDING-SETUP-001 add landing route and SEO foundation ([92698c3](https://github.com/janhoon/ace/commit/92698c331208fbafd79a9efb12b883ee8157b041))
* POSTHOG-BACKEND-001 add backend PostHog analytics ([f80f912](https://github.com/janhoon/ace/commit/f80f91268afb4c0b0885888e96e4cd3e2062c2fd))
* POSTHOG-FRONTEND-001 add frontend analytics ([64590d6](https://github.com/janhoon/ace/commit/64590d65149e216e9e20ceb5205b7d5f4777de95))
* task-1 - frontend/src/views/Explore.spec.ts ([c1a67b0](https://github.com/janhoon/ace/commit/c1a67b0499e67a886528c904b151ba8b824e4b29))
* task-1 - frontend/src/views/Explore.spec.ts ([e58d36f](https://github.com/janhoon/ace/commit/e58d36f4de4065cfbf29116234f56bf170391a65))
* update Ralph workflow to use PRs for changelog tracking ([646f101](https://github.com/janhoon/ace/commit/646f101044a6c30bc526b5a1f76c18dcd372c9d4))


### Bug Fixes

* normalize trace search results and refine graph arrows ([8513820](https://github.com/janhoon/ace/commit/8513820742075f67c9b8c00532a16fba113d249f))


### Documentation

* Add PostHog backend and frontend integration tickets ([#249](https://github.com/janhoon/ace/issues/249), [#250](https://github.com/janhoon/ace/issues/250)) ([5143d75](https://github.com/janhoon/ace/commit/5143d75092d9a161aa856ae567a2e3a4db69af30))
* Add PostHog EU region config and API keys ([2ff560b](https://github.com/janhoon/ace/commit/2ff560b76b2833b385292e28e95f122517fba293))
* Remove PostHog API keys (moved to Speke) ([bdc1752](https://github.com/janhoon/ace/commit/bdc1752450fec3b61581d8b6b5904ec5bfd64ef3))
* Update PostHog host to https://eu.i.posthog.com ([173c726](https://github.com/janhoon/ace/commit/173c7266436d2d969bfc2d63337fd08a231a391b))

## [0.2.0](https://github.com/janhoon/dash/compare/v0.1.0...v0.2.0) (2026-02-10)


### Features

* add inter-service topology to otel loadgen ([ff6a16b](https://github.com/janhoon/dash/commit/ff6a16b23e184fad5e488ccb259c798603daae37))
* improve local trace testing and Tempo visibility ([e8511b1](https://github.com/janhoon/dash/commit/e8511b15afcf501f10aebbf405ecaf14c4e4862f))
* TRACING-API-001 add tracing datasource APIs ([d5c45df](https://github.com/janhoon/dash/commit/d5c45dfde84e21a7c064b8fed55433c344245a13))
* TRACING-AUTO-INSTRUMENT-001 add otel tracing pipeline ([de5a49e](https://github.com/janhoon/dash/commit/de5a49ecfb84e354682d65cd9e8375d0a9d9fbf8))
* TRACING-DATASOURCE-001 add tracing datasource setup ([f2917dd](https://github.com/janhoon/dash/commit/f2917ddaf0f18790f8d68951c146f625b637deb8))
* TRACING-INTEGRATION-001 add trace-to-logs and metrics context ([b01759f](https://github.com/janhoon/dash/commit/b01759f21617f96de54f086eb61c8189265000a1))
* TRACING-PANELS-001 add trace list and heatmap panels ([5cae6dd](https://github.com/janhoon/dash/commit/5cae6ddc1983ef8e1e6353ea8fbfa7af22aa4d98))
* TRACING-SERVICE-GRAPH-001 add trace service dependency graph ([8eb3947](https://github.com/janhoon/dash/commit/8eb394726fa4abc5a67ab62b3c9fe09059f26710))
* TRACING-SPAN-DETAILS-001 span details panel ([2d82b33](https://github.com/janhoon/dash/commit/2d82b33c6c64d3f605afa77cb7d6beaeacaadbe8))
* TRACING-TIMELINE-001 trace timeline waterfall ([1d2f8b9](https://github.com/janhoon/dash/commit/1d2f8b9070984dcce03c9a7c92c354f95832fce9))


### Bug Fixes

* expand collapsed sidebar on hover ([702d4fd](https://github.com/janhoon/dash/commit/702d4fd6896645df99b64e32a27932329d108a2e))
* stabilize release workflow checks and rerun support ([136c41d](https://github.com/janhoon/dash/commit/136c41d6f086118fab4ebd241388df9a78dde0ec))


### CI

* update coverage badge [skip ci] ([9f139c6](https://github.com/janhoon/dash/commit/9f139c60253ca727fa18e50ca322b5cbc0a9b2e9))
* update coverage badge [skip ci] ([c2b5305](https://github.com/janhoon/dash/commit/c2b5305881a2d8065f0734364373eed2008c5778))
* update coverage badge [skip ci] ([6b9d245](https://github.com/janhoon/dash/commit/6b9d2453512f5fe479f63442f13c598a3e58b26f))
* update coverage badge [skip ci] ([79e3e08](https://github.com/janhoon/dash/commit/79e3e08da8c36d33111bcd571a279c7481a2f53e))
* update coverage badge [skip ci] ([390807e](https://github.com/janhoon/dash/commit/390807ebf73e3934f41e0cc99854eef1d9a8ad03))
* update coverage badge [skip ci] ([94856f8](https://github.com/janhoon/dash/commit/94856f8151ecf26ae88eea6919938ba2d2d56562))
* update coverage badge [skip ci] ([b2104e2](https://github.com/janhoon/dash/commit/b2104e269c411006dc4fd2520848b1d251879591))
* update coverage badge [skip ci] ([3ae3e4f](https://github.com/janhoon/dash/commit/3ae3e4fb8807c0e4cda74e3bec2f3ee43f341b80))
* update coverage badge [skip ci] ([0833767](https://github.com/janhoon/dash/commit/0833767315aaedf3df554bf4da317c431c99eebf))
* update coverage badge [skip ci] ([1a0d947](https://github.com/janhoon/dash/commit/1a0d947c69b95dd747540b2eb8482860a23367b1))

## Changelog

All notable changes to this project are documented in this file.

This changelog is managed by release automation.
