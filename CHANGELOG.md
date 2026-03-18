# Changelog

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
