# Multi-Provider AI Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Copilot-only chat system with a provider abstraction supporting OpenAI, OpenRouter, Ollama, and any OpenAI-compatible endpoint, with Copilot as a personal fallback.

**Architecture:** Go backend with AIProvider interface (OpenAICompatibleProvider + CopilotProvider). Org-scoped endpoints under `/api/orgs/{id}/ai/`. Frontend composable `useAIProvider.ts` replaces `useCopilot.ts`. System prompts injected at orchestration layer.

**Tech Stack:** Go 1.22+ (stdlib net/http, pgxpool), Vue 3 Composition API, TypeScript, Vitest, Tailwind CSS + Kinetic design tokens.

**Spec:** `docs/superpowers/specs/2026-03-23-multi-provider-ai-design.md`

---

## File Structure

### Backend — New Files
- `backend/internal/crypto/crypto.go` — extracted encrypt/decrypt token functions
- `backend/internal/crypto/crypto_test.go` — round-trip tests
- `backend/internal/handlers/ai_provider.go` — AIProvider interface + OpenAICompatibleProvider + CopilotProvider
- `backend/internal/handlers/ai_provider_test.go` — provider unit tests with mock HTTP server
- `backend/internal/handlers/ai_handler.go` — AI HTTP handler (CRUD, chat, models, resolution)
- `backend/internal/handlers/ai_handler_test.go` — handler tests
- `backend/internal/handlers/system_prompts.go` — extracted from github_copilot.go
- `backend/internal/auth/org_middleware.go` — RequireOrgMember middleware
- `backend/internal/auth/org_middleware_test.go` — middleware tests

### Backend — Modified Files
- `backend/internal/db/migrations.go` — add ai_providers table migration
- `backend/internal/handlers/github_copilot.go` — remove Chat, ListModels, ConfigureGitHubApp, GetGitHubApp; keep auth endpoints
- `backend/cmd/api/main.go` — register new AI routes, remove old Copilot routes

### Frontend — New Files
- `frontend/src/composables/useAIProvider.ts` — provider-aware composable replacing useCopilot
- `frontend/src/composables/useAIProvider.spec.ts` — tests
- `frontend/src/composables/useCopilotAuth.ts` — extracted Copilot auth state
- `frontend/src/composables/useCopilotAuth.spec.ts` — tests
- `frontend/src/api/aiProviders.ts` — API functions for provider CRUD
- `frontend/src/api/aiProviders.spec.ts` — API function tests
- `frontend/src/components/AIProviderSettings.vue` — admin settings UI
- `frontend/src/components/AIProviderSettings.spec.ts` — tests

### Frontend — Modified Files
- `frontend/src/components/CmdKModal.vue` — gate on providers instead of isConnected
- `frontend/src/components/CmdKModal.spec.ts` — updated tests
- `frontend/src/components/CmdKChatView.vue` — use useAIProvider, grouped model selector
- `frontend/src/components/CmdKChatView.spec.ts` — updated tests
- `frontend/src/components/CmdKSearchResults.vue` — update useCopilot → useAIProvider
- `frontend/src/components/CmdKSearchResults.spec.ts` — updated tests
- `frontend/src/components/CopilotConnectionPanel.vue` — import from useCopilotAuth
- `frontend/src/components/CopilotConnectionPanel.spec.ts` — updated mock
- `frontend/src/views/UnifiedSettingsView.vue` — AI section with provider list + Copilot fallback

---

## Task 1: Extract crypto to shared package

**Files:**
- Create: `backend/internal/crypto/crypto.go`
- Create: `backend/internal/crypto/crypto_test.go`
- Modify: `backend/internal/handlers/github_copilot.go`

- [ ] **Step 1: Write the failing test for encrypt/decrypt round-trip**

```go
// backend/internal/crypto/crypto_test.go
package crypto

import "testing"

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-key-for-encryption")
	plaintext := "sk-abc123-my-api-key"

	encrypted, err := EncryptToken(plaintext)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}
	if encrypted == plaintext {
		t.Fatal("encrypted should differ from plaintext")
	}

	decrypted, err := DecryptToken(encrypted)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}
	if decrypted != plaintext {
		t.Errorf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestDecryptToken_InvalidCiphertext(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-key")
	_, err := DecryptToken("not-valid-base64!!")
	if err == nil {
		t.Fatal("expected error for invalid ciphertext")
	}
}

func TestDeriveEncryptionKey_MissingSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("JWT_PRIVATE_KEY", "")
	_, err := DeriveEncryptionKey()
	if err == nil {
		t.Fatal("expected error when no secret available")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/crypto/ -v`
Expected: FAIL — package does not exist

- [ ] **Step 3: Move encrypt/decrypt functions to new package**

Create `backend/internal/crypto/crypto.go` by extracting the `deriveEncryptionKey`, `encryptToken`, `decryptToken` functions from `github_copilot.go`. Export them as `DeriveEncryptionKey`, `EncryptToken`, `DecryptToken`.

```go
// backend/internal/crypto/crypto.go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
)

func DeriveEncryptionKey() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = os.Getenv("JWT_PRIVATE_KEY")
	}
	if secret == "" {
		data, err := os.ReadFile(".data/jwt.key")
		if err != nil {
			return nil, fmt.Errorf("no encryption key material available")
		}
		secret = string(data)
	}
	hash := sha256.Sum256([]byte(secret))
	return hash[:], nil
}

func EncryptToken(plaintext string) (string, error) {
	key, err := DeriveEncryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func DecryptToken(encoded string) (string, error) {
	key, err := DeriveEncryptionKey()
	if err != nil {
		return "", err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/crypto/ -v`
Expected: 3 PASS

- [ ] **Step 5: Update github_copilot.go to use the new package**

Replace the local `encryptToken`/`decryptToken`/`deriveEncryptionKey` functions in `github_copilot.go` with imports from `crypto` package. Remove the local functions (lines 199-276). Update all call sites: `encryptToken(...)` → `crypto.EncryptToken(...)`, `decryptToken(...)` → `crypto.DecryptToken(...)`.

- [ ] **Step 6: Verify existing code still compiles**

Run: `cd backend && go build ./...`
Expected: builds successfully

- [ ] **Step 7: Commit**

```bash
git add backend/internal/crypto/ backend/internal/handlers/github_copilot.go
git commit -m "refactor: extract encrypt/decrypt to internal/crypto package"
```

---

## Task 2: Extract system prompts

**Files:**
- Create: `backend/internal/handlers/system_prompts.go`
- Create: `backend/internal/handlers/system_prompts_test.go`
- Modify: `backend/internal/handlers/github_copilot.go`

- [ ] **Step 1: Write the failing test**

```go
// backend/internal/handlers/system_prompts_test.go
package handlers

import (
	"strings"
	"testing"
)

func TestSystemPrompts_ContainsExpectedTypes(t *testing.T) {
	expectedTypes := []string{"prometheus", "victoriametrics", "loki", "elasticsearch", "tempo"}
	for _, dsType := range expectedTypes {
		if _, ok := SystemPrompts[dsType]; !ok {
			t.Errorf("SystemPrompts missing key %q", dsType)
		}
	}
}

func TestSystemPrompts_PrometheusContainsPromQL(t *testing.T) {
	prompt, ok := SystemPrompts["prometheus"]
	if !ok {
		t.Fatal("missing prometheus prompt")
	}
	if !strings.Contains(prompt, "PromQL") {
		t.Error("prometheus prompt should mention PromQL")
	}
}

func TestDefaultSystemPrompt_NotEmpty(t *testing.T) {
	if DefaultSystemPrompt == "" {
		t.Fatal("DefaultSystemPrompt should not be empty")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/handlers/ -run TestSystemPrompts -v`
Expected: FAIL — `SystemPrompts` and `DefaultSystemPrompt` not defined

- [ ] **Step 3: Create system_prompts.go**

Move the `copilotSystemPrompts` map and `defaultSystemPrompt` constant from `github_copilot.go` to a new file. Rename to exported `SystemPrompts` and `DefaultSystemPrompt`.

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./internal/handlers/ -run TestSystemPrompts -v`
Expected: 3 PASS

- [ ] **Step 5: Update github_copilot.go to use exported names**

In the `Chat` method of `github_copilot.go`, replace `copilotSystemPrompts` with `SystemPrompts` and `defaultSystemPrompt` with `DefaultSystemPrompt`. Remove the old local declarations.

- [ ] **Step 6: Verify compilation**

Run: `cd backend && go build ./...`
Expected: builds successfully

- [ ] **Step 7: Commit**

```bash
git add backend/internal/handlers/system_prompts.go backend/internal/handlers/system_prompts_test.go backend/internal/handlers/github_copilot.go
git commit -m "refactor: extract system prompts to shared file"
```

---

## Task 3: Database migration for ai_providers table

**Files:**
- Create: `backend/internal/db/migrations/010_ai_providers.sql` (documentation)
- Modify: `backend/internal/db/migrations.go`

- [ ] **Step 1: Add migration SQL to migrations.go**

Add the ai_providers table creation to the migrations slice in `migrations.go`, after the existing migrations. Use the same inline string pattern.

```go
// Add to migrations slice in migrations.go:
`CREATE TABLE IF NOT EXISTS ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    models_override JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, display_name)
);
CREATE INDEX IF NOT EXISTS idx_ai_providers_org_id ON ai_providers(organization_id);`,
```

- [ ] **Step 2: Create documentation migration file**

```sql
-- backend/internal/db/migrations/010_ai_providers.sql
-- +migrate Up
CREATE TABLE IF NOT EXISTS ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    models_override JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, display_name)
);
CREATE INDEX IF NOT EXISTS idx_ai_providers_org_id ON ai_providers(organization_id);

-- +migrate Down
DROP TABLE IF EXISTS ai_providers;
DROP INDEX IF EXISTS idx_ai_providers_org_id;
```

- [ ] **Step 3: Verify the app starts and migration runs**

Run: `cd backend && go build ./... && go run ./cmd/api/`
Expected: starts without errors (migration creates table idempotently)

- [ ] **Step 4: Commit**

```bash
git add backend/internal/db/migrations.go backend/internal/db/migrations/010_ai_providers.sql
git commit -m "feat: add ai_providers database migration"
```

---

## Task 4: RequireOrgMember middleware

**Files:**
- Create: `backend/internal/auth/org_middleware.go`
- Create: `backend/internal/auth/org_middleware_test.go`

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/auth/org_middleware_test.go
package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func TestRequireOrgMember_MissingOrgID(t *testing.T) {
	handler := RequireOrgMember(nil, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	})
	req := httptest.NewRequest("GET", "/api/orgs/invalid/ai/providers", nil)
	req.SetPathValue("id", "not-a-uuid")
	rr := httptest.NewRecorder()
	handler(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestRequireOrgMember_MissingUserID(t *testing.T) {
	handler := RequireOrgMember(nil, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	})
	orgID := uuid.New()
	req := httptest.NewRequest("GET", "/api/orgs/"+orgID.String()+"/ai/providers", nil)
	req.SetPathValue("id", orgID.String())
	// No user ID in context
	rr := httptest.NewRecorder()
	handler(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/auth/ -run TestRequireOrgMember -v`
Expected: FAIL — function not defined

- [ ] **Step 3: Implement RequireOrgMember**

```go
// backend/internal/auth/org_middleware.go
package auth

import (
	"context"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type orgIDContextKey struct{}

// GetOrgID extracts the validated org ID from the request context.
func GetOrgID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(orgIDContextKey{}).(uuid.UUID)
	return id, ok
}

// RequireOrgMember validates that the authenticated user is a member of the org
// specified in the URL path parameter "id". Injects org_id into context.
func RequireOrgMember(pool *pgxpool.Pool, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orgID, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
			return
		}

		userID, ok := GetUserID(r.Context())
		if !ok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		// Verify membership
		var role string
		err = pool.QueryRow(r.Context(),
			`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		).Scan(&role)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"not a member of this organization"}`), http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), orgIDContextKey{}, orgID)
		handler(w, r.WithContext(ctx))
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./internal/auth/ -run TestRequireOrgMember -v`
Expected: PASS (the DB-dependent test with nil pool will panic on membership check — update tests to check for the expected path)

- [ ] **Step 5: Commit**

```bash
git add backend/internal/auth/org_middleware.go backend/internal/auth/org_middleware_test.go
git commit -m "feat: add RequireOrgMember middleware for org-scoped endpoints"
```

---

## Task 5: AIProvider interface and OpenAICompatibleProvider

**Files:**
- Create: `backend/internal/handlers/ai_provider.go`
- Create: `backend/internal/handlers/ai_provider_test.go`

- [ ] **Step 1: Write tests for OpenAICompatibleProvider with mock HTTP server**

```go
// backend/internal/handlers/ai_provider_test.go
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAICompatibleProvider_ListModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/models" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing auth header")
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{
				{"id": "gpt-4o", "owned_by": "openai"},
				{"id": "gpt-4o-mini", "owned_by": "openai"},
			},
		})
	}))
	defer server.Close()

	p := NewOpenAICompatibleProvider(server.URL, "test-key", "OpenAI")
	models, err := p.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels failed: %v", err)
	}
	if len(models) != 2 {
		t.Errorf("expected 2 models, got %d", len(models))
	}
	if models[0].ID != "gpt-4o" {
		t.Errorf("expected gpt-4o, got %s", models[0].ID)
	}
}

func TestOpenAICompatibleProvider_ListModels_NoAPIKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Error("should not send auth header when no API key")
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]string{{"id": "llama3", "owned_by": "meta"}},
		})
	}))
	defer server.Close()

	p := NewOpenAICompatibleProvider(server.URL, "", "Ollama")
	models, err := p.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels failed: %v", err)
	}
	if len(models) != 1 {
		t.Errorf("expected 1 model, got %d", len(models))
	}
}

func TestOpenAICompatibleProvider_ListModels_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}))
	defer server.Close()

	p := NewOpenAICompatibleProvider(server.URL, "key", "Test")
	_, err := p.ListModels(context.Background())
	if err == nil {
		t.Fatal("expected error for server error response")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/handlers/ -run TestOpenAICompatible -v`
Expected: FAIL — types not defined

- [ ] **Step 3: Implement AIProvider interface and OpenAICompatibleProvider**

Create `backend/internal/handlers/ai_provider.go` with the `AIProvider` interface, `AIModel`, `ChatRequest` types, and the `OpenAICompatibleProvider` struct implementing `ListModels()` and `Chat()`. The `Chat()` method handles both streaming (SSE passthrough) and non-streaming (JSON passthrough) modes.

Key implementation details:
- `NewOpenAICompatibleProvider(baseURL, apiKey, displayName string) *OpenAICompatibleProvider`
- `ListModels()` calls `GET baseURL/models` with optional `Authorization: Bearer` header
- `Chat()` calls `POST baseURL/chat/completions`, sets `Content-Type: application/json`
- For streaming: set response headers `text/event-stream`, flush chunks as received
- For non-streaming: forward JSON response body directly
- No API key → no Authorization header (for Ollama/local providers)

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./internal/handlers/ -run TestOpenAICompatible -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/ai_provider.go backend/internal/handlers/ai_provider_test.go
git commit -m "feat: add AIProvider interface and OpenAICompatibleProvider"
```

---

## Task 6: CopilotProvider implementation

**Files:**
- Modify: `backend/internal/handlers/ai_provider.go`
- Modify: `backend/internal/handlers/ai_provider_test.go`
- Modify: `backend/internal/handlers/github_copilot.go`

- [ ] **Step 1: Write tests for CopilotProvider**

Test `CopilotProvider.ListModels()` and `CopilotProvider.Chat()` using mock servers that simulate the Copilot token endpoint and API. Test the special headers (`Editor-Version`, `Copilot-Integration-Id`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/handlers/ -run TestCopilotProvider -v`
Expected: FAIL

- [ ] **Step 3: Implement CopilotProvider**

Add `CopilotProvider` struct to `ai_provider.go`. It wraps the existing `fetchCopilotToken()` logic from `github_copilot.go`. Extract `fetchCopilotToken` as an exported method or move the relevant code.

Includes a `sync.Map`-based token cache keyed by userID. Each cached entry stores the Copilot session token and its `expires_at` timestamp. Before hitting GitHub's token endpoint, check the cache — if `expires_at - 60s > now`, reuse it.

- `ListModels()`: decrypt token → fetchCopilotToken (cache-aware) → GET apiEndpoint/models with Copilot headers
- `Chat()`: decrypt token → fetchCopilotToken (cache-aware) → POST apiEndpoint/chat/completions with Copilot headers, stream or JSON passthrough

Include a test that calls `ListModels()` twice and verifies the mock token endpoint only receives one request (second call uses cache).

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./internal/handlers/ -run TestCopilotProvider -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/ai_provider.go backend/internal/handlers/ai_provider_test.go backend/internal/handlers/github_copilot.go
git commit -m "feat: add CopilotProvider wrapping existing Copilot token logic"
```

---

## Task 7: AI handler — provider resolution, CRUD, chat, models

**Files:**
- Create: `backend/internal/handlers/ai_handler.go`
- Create: `backend/internal/handlers/ai_handler_test.go`

- [ ] **Step 1: Write tests for provider resolution**

Test the three cases: org has providers → return them; no org providers + Copilot → return CopilotProvider; neither → error. Test admin CRUD: create provider (encrypts API key), list, update, delete. Test chat routing: provider_id=UUID → OpenAICompatibleProvider; provider_id="copilot" → CopilotProvider.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/handlers/ -run TestAIHandler -v`
Expected: FAIL

- [ ] **Step 3: Implement AIHandler**

```go
type AIHandler struct {
	pool *pgxpool.Pool
}

func NewAIHandler(pool *pgxpool.Pool) *AIHandler {
	return &AIHandler{pool: pool}
}
```

Implement methods:
- `ListProviders(w, r)` — resolve providers for the user's org (from context via RequireOrgMember), include Copilot fallback
- `ListModels(w, r)` — get provider by ID, call ListModels(), fall back to models_override
- `Chat(w, r)` — parse request, resolve provider, prepend system prompt from SystemPrompts map, call provider.Chat()
- `CreateProvider(w, r)` — admin check, validate, encrypt API key, INSERT
- `UpdateProvider(w, r)` — admin check, encrypt API key if changed, UPDATE
- `DeleteProvider(w, r)` — admin check, DELETE
- `TestProvider(w, r)` — admin check, build provider from DB row, call ListModels()

System prompt injection: before calling `provider.Chat()`, prepend `{"role": "system", "content": systemPrompt}` to the messages array based on `datasource_type`.

Graceful tool degradation in `Chat()`: if the provider returns an error response when tools are included (e.g., 400/422 with a message about unsupported tools), retry the request without the `tools` field and include a `"tools_unsupported": true` flag in the response metadata. Include tests for: (a) detecting a tool-incompatible error, (b) retrying without tools, (c) the flag in the response.

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./internal/handlers/ -run TestAIHandler -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/ai_handler.go backend/internal/handlers/ai_handler_test.go
git commit -m "feat: add AI handler with provider resolution, CRUD, and chat"
```

---

## Task 8: Route registration and cleanup

**Files:**
- Modify: `backend/cmd/api/main.go`
- Modify: `backend/internal/handlers/github_copilot.go`

- [ ] **Step 1: Register new AI routes in main.go**

```go
// AI routes (org-scoped)
aiHandler := handlers.NewAIHandler(pool)
mux.HandleFunc("GET /api/orgs/{id}/ai/providers", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.ListProviders)))
mux.HandleFunc("GET /api/orgs/{id}/ai/models", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.ListModels)))
mux.HandleFunc("POST /api/orgs/{id}/ai/chat", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.Chat)))
mux.HandleFunc("POST /api/orgs/{id}/ai/providers", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.CreateProvider)))
mux.HandleFunc("PUT /api/orgs/{id}/ai/providers/{pid}", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.UpdateProvider)))
mux.HandleFunc("DELETE /api/orgs/{id}/ai/providers/{pid}", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.DeleteProvider)))
mux.HandleFunc("POST /api/orgs/{id}/ai/providers/{pid}/test", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.TestProvider)))
```

- [ ] **Step 2: Remove old Copilot routes**

Remove from main.go:
- `GET /api/copilot/models`
- `POST /api/copilot/chat`
- `POST /api/orgs/{id}/github-app`
- `GET /api/orgs/{id}/github-app`

- [ ] **Step 3: Remove dead code from github_copilot.go**

Remove the `Chat`, `ListModels`, `ConfigureGitHubApp`, `GetGitHubApp` methods and related types (`copilotChatRequest`, `copilotModel`, `premiumMultipliers`). Keep: `StartDeviceFlow`, `PollDeviceFlow`, `GetConnection`, `Disconnect`, `fetchGitHubUser`, `fetchCopilotToken`.

- [ ] **Step 3.5: Increase WriteTimeout for SSE streaming**

The existing `WriteTimeout: 15 * time.Second` in `main.go` will kill SSE streams before they complete (chat can run 60+ seconds). Set `WriteTimeout: 0` (no timeout — the per-request context timeout of 60s handles this) or increase to 120s.

- [ ] **Step 4: Verify compilation**

Run: `cd backend && go build ./...`
Expected: builds successfully

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/api/main.go backend/internal/handlers/github_copilot.go
git commit -m "feat: register AI routes, remove old Copilot chat/models endpoints"
```

---

## Task 9: Frontend — extract useCopilotAuth.ts

**Files:**
- Create: `frontend/src/composables/useCopilotAuth.ts`
- Create: `frontend/src/composables/useCopilotAuth.spec.ts`

- [ ] **Step 1: Write tests for shared auth state**

```typescript
// frontend/src/composables/useCopilotAuth.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useRoute: vi.fn(() => ({ params: {}, query: {} })),
}))

describe('useCopilotAuth', () => {
  beforeEach(async () => { vi.resetModules() })

  it('shares isConnected across calls', async () => {
    const { useCopilotAuth } = await import('./useCopilotAuth')
    const a = useCopilotAuth()
    const b = useCopilotAuth()
    a.isConnected.value = true
    expect(b.isConnected.value).toBe(true)
  })

  it('does NOT share deviceFlowActive across calls', async () => {
    const { useCopilotAuth } = await import('./useCopilotAuth')
    const a = useCopilotAuth()
    const b = useCopilotAuth()
    a.deviceFlowActive.value = true
    expect(b.deviceFlowActive.value).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/composables/useCopilotAuth.spec.ts`
Expected: FAIL

- [ ] **Step 3: Create useCopilotAuth.ts**

Extract from `useCopilot.ts`: the Copilot-specific auth state (`isConnected`, `hasCopilot`, `githubUsername`), device flow state, and methods (`checkConnection`, `connect`, `cancelDeviceFlow`, `disconnect`). Keep the same module-level shared state pattern.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/composables/useCopilotAuth.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useCopilotAuth.ts frontend/src/composables/useCopilotAuth.spec.ts
git commit -m "refactor: extract useCopilotAuth from useCopilot"
```

---

## Task 10: Frontend — useAIProvider.ts composable

**Files:**
- Create: `frontend/src/composables/useAIProvider.ts`
- Create: `frontend/src/composables/useAIProvider.spec.ts`

- [ ] **Step 1: Write tests**

Test: `fetchProviders()` populates providers list, auto-selects first provider. `fetchModels()` populates models for selected provider. Shared state across calls. Org switch resets state. Error handling for provider unavailable.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/composables/useAIProvider.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement useAIProvider.ts**

Module-level shared state pattern matching `useCopilot.ts`. Key differences:
- `providers` ref, `selectedProviderId` ref
- All API calls include org ID from `useOrganization().currentOrgId`
- `watch(currentOrgId)` resets all state and re-fetches
- `sendMessage()` and `sendChatRequest()` include `provider_id` in request body
- SSE parsing logic reused from current `useCopilot.ts`

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/composables/useAIProvider.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useAIProvider.ts frontend/src/composables/useAIProvider.spec.ts
git commit -m "feat: add useAIProvider composable with provider resolution"
```

---

## Task 11: Frontend — API functions for provider CRUD

**Files:**
- Create: `frontend/src/api/aiProviders.ts`
- Create: `frontend/src/api/aiProviders.spec.ts`

- [ ] **Step 1: Write tests for API functions**

Test each function with a mocked `fetch`: verify correct URL construction, HTTP method, auth headers, and response parsing. Follow the same test pattern as existing API specs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/aiProviders.spec.ts`
Expected: FAIL

- [ ] **Step 3: Create API functions**

Follow the pattern from `frontend/src/api/datasources.ts`. Create functions:
- `listAIProviders(orgId: string)` — GET /api/orgs/{orgId}/ai/providers
- `createAIProvider(orgId, data)` — POST
- `updateAIProvider(orgId, providerId, data)` — PUT
- `deleteAIProvider(orgId, providerId)` — DELETE
- `testAIProvider(orgId, providerId)` — POST test endpoint
- `listAIModels(orgId, providerId?)` — GET /api/orgs/{orgId}/ai/models

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/api/aiProviders.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/aiProviders.ts frontend/src/api/aiProviders.spec.ts
git commit -m "feat: add AI provider API functions"
```

---

## Task 12: Frontend — AIProviderSettings component

**Files:**
- Create: `frontend/src/components/AIProviderSettings.vue`
- Create: `frontend/src/components/AIProviderSettings.spec.ts`
- Modify: `frontend/src/views/UnifiedSettingsView.vue`

- [ ] **Step 1: Write tests**

Test: renders provider list, empty state with CTA, add provider form, test connection button, delete with confirmation. Mock the API functions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AIProviderSettings.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement AIProviderSettings.vue**

Admin-only component with:
- Provider list with rows (display_name, base_url truncated, model count badge, enabled badge, overflow menu)
- Empty state: "No providers configured. Add one to enable AI chat for your team."
- Add/Edit form: provider_type select, display_name, base_url (pre-filled hint per type), api_key (password field, optional), enabled toggle
- Test connection button with spinner and inline result
- Delete with confirmation dialog
- All styled with Kinetic tokens (`var(--color-surface-container-low)`, etc.)
- Accessibility: provider list uses `role="list"`, each row `role="listitem"`, test connection button has `aria-label="Test connection for [name]"`, status badges have `aria-label` describing state, all buttons 44px min touch target
- Include tests that verify `role` and `aria-label` attributes are rendered

- [ ] **Step 4: Wire into UnifiedSettingsView.vue**

Replace the AI section (lines 779-786) with the new component structure:
```vue
<section v-if="activeSection === 'ai'" class="flex flex-col gap-4 max-w-2xl">
  <AIProviderSettings v-if="orgId" :org-id="orgId" :is-admin="isAdmin" />
  <CopilotConnectionPanel v-if="orgId && !hasOrgProviders" :org-id="orgId" />
</section>
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/components/AIProviderSettings.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AIProviderSettings.vue frontend/src/components/AIProviderSettings.spec.ts frontend/src/views/UnifiedSettingsView.vue
git commit -m "feat: add AI provider settings component with CRUD"
```

---

## Task 13: Frontend — Update CmdKModal, CmdKChatView, CmdKSearchResults

**Files:**
- Modify: `frontend/src/components/CmdKModal.vue`
- Modify: `frontend/src/components/CmdKModal.spec.ts`
- Modify: `frontend/src/components/CmdKChatView.vue`
- Modify: `frontend/src/components/CmdKChatView.spec.ts`
- Modify: `frontend/src/components/CmdKSearchResults.vue`
- Modify: `frontend/src/components/CmdKSearchResults.spec.ts`

- [ ] **Step 1: Update CmdKModal.vue**

Replace `useCopilot` import with `useAIProvider`. Gate chat on `providers.length > 0` instead of `isConnected`. Update the not-connected message to "Configure an AI provider in Settings, or connect GitHub Copilot." with link to `/app/settings/ai`.

- [ ] **Step 2: Update CmdKModal.spec.ts**

Replace `mockIsConnected` with `mockProviders`. Test: providers exist → chat mode works; no providers → shows "no provider configured" message.

- [ ] **Step 3: Update CmdKChatView.vue**

Replace `useCopilot` import with `useAIProvider`. Update model selector to use `<optgroup>` per provider when multiple providers exist. Pass `provider_id` via `sendChatRequest()`.

- [ ] **Step 4: Update CmdKChatView.spec.ts**

Update mocks from `useCopilot` to `useAIProvider`. Add test for grouped model selector with multiple providers.

- [ ] **Step 4.5: Update CmdKSearchResults.vue and spec**

`CmdKSearchResults.vue` also imports `useCopilot` and checks `isConnected`. Update to use `useAIProvider` and check `providers.length > 0`. Update the mock in `CmdKSearchResults.spec.ts` accordingly.

- [ ] **Step 5: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CmdKModal.vue frontend/src/components/CmdKModal.spec.ts frontend/src/components/CmdKChatView.vue frontend/src/components/CmdKChatView.spec.ts
git commit -m "feat: update Cmd+K to use AI provider system"
```

---

## Task 14: Remove old useCopilot.ts

**Files:**
- Delete: `frontend/src/composables/useCopilot.ts`
- Delete: `frontend/src/composables/useCopilot.spec.ts`
- Modify: `frontend/src/components/CopilotConnectionPanel.vue` — import from `useCopilotAuth`

- [ ] **Step 1: Update CopilotConnectionPanel.vue and its spec**

Change import from `useCopilot` to `useCopilotAuth`. The component only uses auth-related state. Also update `CopilotConnectionPanel.spec.ts` — change the mock from `vi.mock('../composables/useCopilot', ...)` to `vi.mock('../composables/useCopilotAuth', ...)`.

- [ ] **Step 2: Search for remaining useCopilot imports**

Run: `grep -r "useCopilot" frontend/src/ --include="*.ts" --include="*.vue" -l`
Expected: only `useCopilotAuth.ts` and `useCopilotTools.ts` (which imports types, not the composable)

- [ ] **Step 3: Update useCopilotTools.ts imports**

If `useCopilotTools.ts` imports types from `useCopilot`, move those type definitions (`ToolDefinition`, `ToolCall`) to a shared types file or into `useAIProvider.ts` and update the import.

- [ ] **Step 4: Delete old files**

```bash
rm frontend/src/composables/useCopilot.ts frontend/src/composables/useCopilot.spec.ts
```

- [ ] **Step 5: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: all PASS

- [ ] **Step 6: Run lint**

Run: `cd frontend && npm run lint:fix`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/
git commit -m "refactor: remove useCopilot.ts, migrate all consumers to useAIProvider/useCopilotAuth"
```

---

## Task 15: End-to-end verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v`
Expected: all PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && npm run test`
Expected: all PASS

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: builds successfully with no type errors

- [ ] **Step 4: Run lint**

Run: `cd frontend && npm run lint:fix`
Expected: clean

- [ ] **Step 5: Manual smoke test (if dev server available)**

Start the app, navigate to Settings > AI, verify the provider list renders (empty state). Open Cmd+K, verify the "no provider configured" message appears (if no providers and no Copilot). If Copilot is connected, verify chat still works through the new CopilotProvider path.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: address issues found during e2e verification"
```
