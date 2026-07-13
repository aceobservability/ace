---
status: accepted
---

# React frontend stack

> **Implementation status:** Accepted decision for the Vue → React rewrite ([#292](https://github.com/aceobservability/ace/issues/292)).
> Implementation proceeds in tracer bullets starting with foundation scaffold ([#294](https://github.com/aceobservability/ace/issues/294)).

Ace is replacing the Vue 3 SPA in `frontend/` with React while preserving Kinetic v2
([DESIGN.md](../../DESIGN.md)), the [same-origin API contract](../../CONTEXT.md), and the
existing Docker static-build pipeline (Bun → Vite → nginx). No backend API changes.

## Meta-framework: Vite SPA

### Considered options

| Option | Fit | Why not (or why yes) |
|--------|-----|----------------------|
| **Vite + React SPA** | ✅ Chosen | Matches today's deployment model: static `dist/` served by nginx, dev proxy to `/api`, no server runtime. Build and CI change only the framework plugin and type-check command. |
| **Next.js** | ❌ | Adds a Node server and SSR/SSG assumptions Ace does not use. Would require rethinking the frontend-only and combined Docker images, ingress routing, and the ADR-0001 same-origin proxy — all for no product gain (authenticated dashboard, no SEO-critical pages). |
| **Remix** | ❌ | Same server-runtime cost as Next.js, plus React Router coupling that does not simplify our migration. Ace has no full-document server rendering requirement. |

**Decision:** Stay on **Vite 8** with `@vitejs/plugin-react-swc`, Bun 1.3+, and the existing nginx image layout.

## Router

**Decision:** [**React Router v7**](https://reactrouter.com/) (`react-router-dom`).

- Closest mental model to `vue-router`: declarative route tree, lazy `React.lazy` imports, `loader`/guard patterns map cleanly to today's `beforeEach` auth guard.
- Supports the backward-compat redirect and alias routes the Vue app relies on (`/dashboards` → `/app/dashboards`, settings section redirects, etc.).
- **TanStack Router** was considered for end-to-end route typing; rejected for rewrite cost — parity migration is the priority, and route typing can be added later without a framework swap.

## Client state

**Decision:** [**Zustand**](https://zustand.docs.pmnd.rs/) for cross-cutting global state; local `useState`/`useReducer` for component-scoped state.

The Vue app uses module-level singleton refs in composables (`useAuth`, `useOrganization`, `useSidebar`, …) — not Pinia. Zustand mirrors that pattern with minimal boilerplate and no provider nesting. React Context is reserved for rare tree-local concerns (e.g. a panel editor subtree) where prop drilling would be worse than a scoped provider.

## Data fetching

**Decision:** [**TanStack Query v5**](https://tanstack.com/query) (`@tanstack/react-query`) for REST reads/writes; **plain `fetch`** (via existing `api/` modules) for streaming endpoints.

- Dashboards, settings, and explore views benefit from cached queries, background refetch, and consistent loading/error states.
- AI chat, SSE, and other streaming responses stay on the thin `api/base.ts` + `fetch` layer — React Query is a poor fit for long-lived streams.
- Mutations invalidate query keys rather than ad-hoc composable refresh calls.

## UI primitives

**Decision:** [**shadcn/ui**](https://ui.shadcn.com/) components on [**Base UI**](https://base-ui.com/) (`@base-ui/react`), themed to Kinetic v2 with Tailwind CSS v4.

shadcn/ui is a copy-into-the-repo workflow (CLI + `components.json`), not a runtime dependency — we own every file under `components/ui/`. As of July 2026, shadcn defaults to **Base UI** (not Radix) as its headless layer; Base UI is built by the Radix, Floating UI, and Material UI teams and is the direction shadcn is standardizing on.

| Option | Why not (or why yes) |
|--------|----------------------|
| **shadcn/ui + Base UI** | ✅ Chosen | Accessible primitives via `@base-ui/react`; shadcn gives battle-tested Dialog, Dropdown, Tabs, Tooltip, etc. as starting points we restyle to DESIGN.md. New projects scaffold with `npx shadcn@latest create` selecting Base UI. |
| **Radix UI directly** | ❌ | shadcn has moved on; Radix `asChild` APIs differ from Base UI's `render` prop. Starting fresh on Radix would fight the ecosystem and require a later migration. |
| **Full component kit** (MUI, Chakra) | ❌ | Prescribed look fights Kinetic v2; heavier bundles. |
| **Hand-built only** | ❌ | Reimplements focus traps, popover positioning, and ARIA patterns shadcn/Base UI already solve. |

**Theming:** Map Kinetic v2 tokens from `style.css` onto shadcn CSS variables at scaffold time, then adjust per-component. Dashboard-specific visuals (panels, charts, query editors) stay custom; shadcn covers shared interactive primitives (modals, menus, form fields, toasts).

## Forms

**Decision:** [**React Hook Form**](https://react-hook-form.com/) + [**Zod**](https://zod.dev/) resolvers.

The Vue app uses `v-model` on native inputs. RHF keeps forms performant (uncontrolled-by-default) and Zod gives shared validation schemas for settings, datasource create/edit, and auth — replacing scattered inline validation.

## Testing

**Decision:** **Vitest 4** + **happy-dom** + [**React Testing Library**](https://testing-library.com/docs/react-testing-library/intro/) (`@testing-library/react`, `@testing-library/user-event`).

| Vue (today) | React (target) |
|-------------|----------------|
| `vitest` | `vitest` (unchanged) |
| `happy-dom` | `happy-dom` (unchanged) |
| `@vue/test-utils` | `@testing-library/react` |
| `vue-tsc` | `tsc --noEmit` (project references via `tsconfig`) |

Behavior-focused tests assert rendered output and user interactions, not implementation details. Keep colocated `*.spec.tsx` beside components and `*.spec.ts` beside utilities/API helpers.

## Tooling (unchanged)

- **Package manager:** Bun
- **Lint/format:** Biome (`biome.jsonc` — JSX already supported)
- **Dead code:** Knip
- **CSS:** Tailwind v4 via `@tailwindcss/vite`
- **UI scaffold:** shadcn CLI (`npx shadcn@latest create` / `add`), `components.json` with Base UI as the primitive library

## Vue → React dependency mapping

| Vue package | React replacement | Notes |
|-------------|-------------------|-------|
| `vue` | `react`, `react-dom` | React 19 |
| `vue-router` | `react-router-dom` v7 | Route tree ported 1:1; SEO meta via `useEffect` or a small `usePageMeta` hook |
| Composables (`useXxx`) | Custom hooks + Zustand stores | `useAuth` → `useAuthStore` + `useAuth()` hook wrapper |
| `vue-echarts` | `echarts-for-react` | Direct `echarts` imports for `connect`/`disconnect` (crosshair sync) stay as-is |
| `vue3-grid-layout-next` | `react-grid-layout` | Dashboard panel drag/resize |
| `lucide-vue-next` | `lucide-react` | Icon names are 1:1; also used by shadcn/ui |
| Hand-built modals/menus | `shadcn/ui` + `@base-ui/react` | CLI copies into `components/ui/`; themed to Kinetic v2 |
| `@vitejs/plugin-vue` | `@vitejs/plugin-react-swc` | SWC for fast HMR/build |
| `vue-tsc` | `typescript` (`tsc -b` / `tsc --noEmit`) | Strict mode preserved |
| `@vue/test-utils` | `@testing-library/react` | See Testing above |
| `@excalidraw/excalidraw` | `@excalidraw/excalidraw` | Already React; remove Vue bridge mount in `CanvasPanel` |
| `monaco-editor` | `monaco-editor` | Unchanged; `@monaco-editor/react` wrapper optional |
| `shiki`, `marked`, `dompurify` | Same packages | Framework-agnostic |
| `posthog-js` | `posthog-js` | Re-init plugin as React effect on router |
| `d3-force` | `d3-force` | Unchanged (node graph panel) |
| `echarts` | `echarts` | Unchanged (theme in `chartTheme.ts`) |

## Consequences

- **Big-bang cutover** ([#292](https://github.com/aceobservability/ace/issues/292)): Vue and React dependencies do not coexist in the production bundle. During rewrite, feature work is frozen; React scaffold ([#294](https://github.com/aceobservability/ace/issues/294)) replaces Vue entrypoints in place.
- **Docker/CI:** `frontend/Dockerfile` keeps `bun run build`; only build output tooling changes.
- **No `VITE_*` API URL:** `API_BASE = ''` stays ([ADR-0001](./0001-standalone-image-and-runtime-api-proxy.md)).
- **Type-check script** becomes `tsc --noEmit` (or `tsc -b`) instead of `vue-tsc`.
- **UI scaffold:** Foundation ([#294](https://github.com/aceobservability/ace/issues/294)) runs `shadcn create` with Base UI and seeds Kinetic v2 CSS variables before feature ports.
- **Follow-up not in this ADR:** component-level migration order, folder layout inside `src/`, and Copilot/AI sidebar porting are tracked on [#292](https://github.com/aceobservability/ace/issues/292) sub-issues.