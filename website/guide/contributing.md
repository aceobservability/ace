---
title: "Contributing"
---

# AGENTS.md
Practical instructions for agentic coding workflows in this repository.

## 1) Project overview
- Monorepo with two main apps:
  - `backend/` - Go 1.25 API server
  - `frontend/` - Vue 3 + TypeScript + Vite + Vitest
- Key root files:
  - `Makefile` (dev/lint/seed/security entrypoints)
  - `Tiltfile` (local dev orchestration)
  - `deploy/charts/ace-local-infra/` (local infra Helm chart)
  - `mise.toml` (`go = 1.25`)
  - `backend/.golangci.yml` (backend lint policy)
  - `frontend/biome.jsonc` (frontend lint/format policy)

## 2) Prerequisites
- Node.js 18+
- Go 1.25+
- Docker
- A local Kubernetes cluster (kind/minikube/Docker Desktop Kubernetes)
- kubectl + Helm + Tilt
- Optional: `air` for backend hot reload

## 3) Core local commands
Run from repo root unless noted.

### Infra + dev servers
```bash
tilt up
tilt down

make backend
make frontend
```

Notes:
- Backend default URL: `http://localhost:8080`
- Frontend default URL: `http://localhost:5173`
- Optional observability services (`prometheus`, `loki`, `victoria-metrics`, `victoria-logs`, `tempo`) are disabled by default in Tilt and can be enabled from the Tilt UI
- `make backend` uses `air` if installed, else `go run ./cmd/api`

### Seed data
```bash
make seed-admin
make seed-admin EMAIL=admin@example.com PASSWORD='AdminPass123' ORG='my-org' NAME='First Admin' SLUG='my-org'
make seed-datasources
make seed-datasources ORG=my-org
```

## 4) Build/lint/test commands
### Frontend (`frontend/`)
```bash
cd frontend
npm install
npm run dev
npm run build
npm run preview
npm run type-check
npm run test
npm run test:watch
npm run test:coverage
npm run lint
npm run lint:dead-code
npm run format:check
npm run test -- src/api/datasources.spec.ts
npm run test -- src/api/datasources.spec.ts -t "throws on 403"
```
### Backend (`backend/`)
```bash
cd backend
go run ./cmd/api
go build ./cmd/api
go test ./...
go test ./internal/handlers
go test ./internal/handlers -run '^TestDataSourceHandler_Query_InvalidUUID$' -count=1
go test ./internal/auth -run '^TestVerifyPasswordIncorrect$' -count=1
go test ./internal/handlers -list '^Test'
```
### Root quality/security tasks
```bash
make backend-lint
make frontend-lint
make lint
make security-local
```

## 5) Lint and formatting reality
- Backend linting: `golangci-lint` with `govet`, `ineffassign`, `misspell`, `staticcheck`, `unconvert`
- Backend formatters in CI: `gofmt` and `goimports`
- Frontend linting: Biome (`npm run lint`) + Knip (`npm run lint:dead-code`)
- Biome formatting rules: 2-space indent, single quotes, semicolons as needed, trailing commas, line width 100
- Before finishing backend edits, run `gofmt -w` on touched Go files

## 6) Code style guidelines
Follow existing code patterns first. Use these defaults when unclear.

### Imports
- Go: stdlib imports first, then blank line, then external/internal imports
- TypeScript/Vue: external imports before local imports
- TypeScript: use `import type` for type-only imports

### Formatting
- Go: canonical `gofmt` output only
- TypeScript/Vue: 2-space indentation, single quotes, trailing commas in multiline literals
- Keep long expressions wrapped for readability

### Types and data modeling
- Frontend TS is strict (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Avoid `any`; prefer explicit interfaces/unions and narrow unknown values
- Backend optional update fields commonly use pointer fields in request structs
- Keep JSON tags and payload field names stable across frontend/backend
- Use `type_` if a variable name would collide with reserved words

### Naming conventions
- Go exported symbols: `PascalCase`; unexported symbols: `camelCase`
- Go constructors: `NewXxx(...)`
- Handler method verbs usually follow CRUD-ish names: `Create`, `List`, `Get`, `Update`, `Delete`, `Query`
- Vue components and view files: `PascalCase.vue`
- Composables: `useXxx`
- Test files: frontend `*.spec.ts`, backend `*_test.go`

### Error handling
- Backend:
  - Return early on auth/validation failures
  - Use deliberate HTTP status codes (`400`, `401`, `403`, `404`, `409`, `500`)
  - Return JSON error payloads consistently
  - Use `context.WithTimeout` for DB/external calls
- Frontend:
  - Throw concise `Error` messages from API helpers
  - Parse backend error JSON when available, with safe fallback messages
  - Normalize caught values via `e instanceof Error ? e.message : '<fallback>'`

## 7) Testing conventions
- Go tests: use `TestXxx`, prefer table-driven cases, use `httptest.NewRequest` + `httptest.NewRecorder`, and include expected/actual in failures
- Vitest tests: use behavior-focused `describe`/`it`, mock `fetch` with `vi.fn()` + `vi.stubGlobal`, reset mocks in `beforeEach`, and assert URL/method/headers/body for API calls

## 8) Cursor/Copilot instruction files
- `.cursorrules`: not present
- `.cursor/rules/`: not present
- `.github/copilot-instructions.md`: not present
- If any of these files are added later, treat them as higher-priority instructions and update this document

## 9) Agent workflow expectations
- Keep diffs minimal and scoped to the requested task
- Inspect nearby code before editing to mirror local style and architecture
- Preserve API contracts unless the task explicitly requires a contract change
- Run relevant checks for touched areas before finishing
- Avoid adding new dependencies unless clearly necessary

## 10) Progress log policy
- Maintain root `progress.txt` with recent implementation entries
- Keep only the 10 most recent entries
- When adding a new entry beyond 10, remove the oldest entry
