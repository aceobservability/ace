# Changelog

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
