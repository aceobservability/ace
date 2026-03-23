# Multi-Provider AI Support

Replace the Copilot-only chat system with a provider abstraction that supports OpenAI, OpenRouter, Ollama, vLLM, and any OpenAI-compatible endpoint — while keeping Copilot as a personal fallback.

Note: Anthropic's native API (`/v1/messages`) is not OpenAI-compatible — different request schema, auth header (`x-api-key`), and streaming format. To use Anthropic models, configure them through OpenRouter (which wraps Anthropic in an OpenAI-compatible API) or any other OpenAI-compatible gateway. This avoids needing a separate provider implementation for a single vendor's proprietary format.

## Provider Hierarchy

1. Org has AI providers configured and enabled -> use those
2. No org providers -> user's personal Copilot connection (if any)
3. Neither -> "no AI provider configured" error

When org providers exist, Copilot does not appear in the provider list regardless of user's Copilot connection status.

## Database Schema

### New table: `ai_providers`

```sql
CREATE TABLE ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,  -- 'openai', 'openrouter', 'ollama', 'custom'
    display_name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,              -- e.g. 'https://api.openai.com/v1'
    api_key TEXT,                        -- encrypted AES-GCM, nullable for local providers
    enabled BOOLEAN NOT NULL DEFAULT true,
    models_override JSONB,              -- e.g. [{"id":"gpt-4o","name":"GPT-4o"}], null for auto-discover
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, provider_type, base_url)
);
```

### Existing tables unchanged

- `user_github_connections` — Copilot device flow auth (user-level)
- `sso_configs` with `github_copilot` — stays as-is. These rows store org-level GitHub OAuth app credentials for the device flow (client_id/client_secret). They are independent of the AI provider system — they configure *how users authenticate with GitHub*, not which AI provider to use. The old `POST/GET /api/orgs/{id}/github-app` endpoints are removed; the same config can be managed via the existing `sso_configs` admin UI if needed in the future.

## Backend Provider Interface

```go
type AIProvider interface {
    ListModels(ctx context.Context) ([]AIModel, error)
    Chat(ctx context.Context, req ChatRequest, w http.ResponseWriter) error
}

type AIModel struct {
    ID       string                 `json:"id"`
    Name     string                 `json:"name"`
    Vendor   string                 `json:"vendor"`
    Category string                 `json:"category"`
    Meta     map[string]interface{} `json:"meta,omitempty"` // provider-specific (e.g. Copilot premium_multiplier, preview)
}

type ChatRequest struct {
    Model    string            `json:"model"`
    Messages []json.RawMessage `json:"messages"`  // preserved as raw JSON for provider passthrough
    Tools    []json.RawMessage `json:"tools,omitempty"`
    Stream   bool              `json:"stream"`
}
```

### Implementations

**`OpenAICompatibleProvider`** — covers OpenAI, OpenRouter, Ollama, and any OpenAI-compatible endpoint (vLLM, LiteLLM, etc. use `provider_type = 'custom'`). Needs `baseURL` + `apiKey`. Calls `baseURL/models` for discovery, `baseURL/chat/completions` for chat. Handles both SSE streaming and JSON non-streaming passthrough.

**`CopilotProvider`** — wraps existing Copilot token-fetching logic. `ListModels()` fetches a Copilot token then hits the models endpoint with special headers. `Chat()` does the same token dance then forwards to Copilot chat completions with `Editor-Version`, `Copilot-Integration-Id`, etc.

### System Prompt Injection

System prompts are injected at the orchestration layer *before* dispatching to any provider. The existing `copilotSystemPrompts` map (mapping `datasource_type` to expert prompts for PromQL, LogQL, TraceQL, etc.) moves out of `github_copilot.go` into a shared `system_prompts.go` file. The `AIHandler.Chat()` method prepends the appropriate system prompt to the messages array before calling `provider.Chat()`. This ensures all providers get the same datasource-specific expertise regardless of backend.

### Provider Resolution

```
1. Query ai_providers WHERE organization_id = org_id (from URL) AND enabled = true
2. If found -> return as available providers
3. If none -> check user_github_connections for Copilot token
4. If Copilot connected -> return CopilotProvider as sole provider
5. If neither -> error
```

### Copilot as provider_id

When the user's Copilot fallback is active, it appears with `provider_id = "copilot"` (a reserved string). The backend routing logic: if `provider_id == "copilot"`, use `CopilotProvider` with the user's stored GitHub token; otherwise, parse as UUID and look up in `ai_providers`.

## API Endpoints

### New endpoints

All AI endpoints are scoped to an org via the URL path. This is consistent with existing patterns (e.g., `/api/orgs/{id}/github-app`) and avoids ambiguity for users in multiple orgs. The frontend already tracks the current org via `useOrganization()`.

**User-facing (any org member):**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/orgs/{id}/ai/providers` | List available providers (resolved: org providers + Copilot fallback) |
| `GET` | `/api/orgs/{id}/ai/models` | List models across available providers |
| `POST` | `/api/orgs/{id}/ai/chat` | Chat request with `provider_id` routing |

**Admin-only (org admin):**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/orgs/{id}/ai/providers` | Create a provider |
| `PUT` | `/api/orgs/{id}/ai/providers/{pid}` | Update a provider |
| `DELETE` | `/api/orgs/{id}/ai/providers/{pid}` | Delete a provider |
| `POST` | `/api/orgs/{id}/ai/providers/{pid}/test` | Test connection (hits `/models`) |

### Kept (Copilot auth is user-level)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/github/device` | Start Copilot device flow |
| `POST` | `/api/auth/github/device/poll` | Poll device flow |
| `GET` | `/api/auth/github/connection` | Check Copilot connection |
| `DELETE` | `/api/auth/github/connection` | Disconnect Copilot |

### Removed

- `GET /api/copilot/models` -> replaced by `GET /api/orgs/{id}/ai/models`
- `POST /api/copilot/chat` -> replaced by `POST /api/orgs/{id}/ai/chat`
- `POST /api/orgs/{id}/github-app` and `GET /api/orgs/{id}/github-app` -> removed (sso_configs stays for GitHub OAuth credentials)

### Chat request body

```json
{
  "provider_id": "uuid-or-copilot",
  "model": "claude-sonnet-4.6",
  "datasource_type": "victoriametrics",
  "datasource_name": "prod",
  "messages": [],
  "tools": [],
  "stream": true
}
```

## Frontend Changes

### `useCopilot.ts` -> `useAIProvider.ts`

Same module-level shared state pattern, provider-aware:

```ts
// State
const providers = ref<AIProviderInfo[]>([])
const selectedProviderId = ref<string>('')    // uuid or 'copilot'
const models = ref<AIModel[]>([])
const selectedModel = ref<string>('')

// Functions (all org-scoped, orgId from useOrganization())
fetchProviders()     // GET /api/orgs/{orgId}/ai/providers
fetchModels()        // GET /api/orgs/{orgId}/ai/models?provider_id=X
sendMessage()        // POST /api/orgs/{orgId}/ai/chat with provider_id (SSE streaming)
sendChatRequest()    // POST /api/orgs/{orgId}/ai/chat non-streaming (tool calling)
```

### `useCopilotAuth.ts` (extracted)

Copilot-specific auth state: `isConnected`, `hasCopilot`, `githubUsername`, device flow refs. Only used by `CopilotConnectionPanel` and provider resolution display.

### Component changes

- **`CmdKModal.vue`** — gate on `providers.length > 0` instead of `isConnected`
- **`CmdKChatView.vue`** — model selector grouped by provider. Uses `useAIProvider` instead of `useCopilot`
- **`CopilotConnectionPanel.vue`** — shown only when no org providers configured. Unchanged internally.
- **`UnifiedSettingsView.vue`** — new "AI Providers" admin section: add/edit/delete providers, test connection, see discovered models. Copilot connection moves under "Personal Fallback" subsection.
- **`useCopilotTools.ts`** — unchanged. Tools are datasource-specific, passed to whichever provider handles chat.

## Error Handling

- **Provider unavailable** (401, connection refused): return clear error, no automatic fallback to another provider. User can manually switch.
- **Copilot token expiry**: `fetchCopilotToken()` gets fresh token per request, no change needed.
- **API key rotation**: admin updates via PUT, takes effect immediately (read per-request, not cached).
- **Provider deleted mid-session**: next request returns "provider not found", frontend refreshes provider list.
- **Model discovery fails**: fall back to `models_override` from DB for the model *listing* endpoint only. If `models_override` is also empty, return the provider with an empty model list and a warning. Note: a provider being unreachable for model listing likely means it will also fail for chat — but these are separate error paths. Chat errors are handled independently per the "provider unavailable" case above.
- **Org providers exist + user has Copilot**: Copilot does NOT appear. Org providers take full precedence.

## Deferred

- **Rate limiting / usage tracking**: When an admin configures an API key for the org, all members share it. Per-user rate limiting and usage tracking are deferred to a future iteration. For now, the assumption is that org admins manage their API key quotas externally.
- **Anthropic native API**: Anthropic's `/v1/messages` API is not OpenAI-compatible. Supporting it natively would require a separate provider implementation. Deferred — use OpenRouter or any OpenAI-compatible gateway for Anthropic models.

## Route Registration

New endpoints follow the same router registration pattern and `auth.RequireAuth` middleware as existing endpoints. Admin endpoints additionally check `role = 'admin'` in `organization_memberships` (same pattern as the existing `ConfigureGitHubApp` handler).

## Testing

### Backend

- Provider resolution logic (org > copilot fallback > none)
- `OpenAICompatibleProvider` against mock HTTP server (models list, streaming chat, non-streaming chat)
- Provider CRUD endpoints (create, update, delete, test connection)
- Full chat flow through `/api/ai/chat`
- Existing Copilot tests adapted to new interface

### Frontend

- `useAIProvider.spec.ts` — provider fetching, model fetching, selection, Copilot fallback
- `AIProviderSettings.spec.ts` — add/edit/delete provider, test connection
- `CmdKChatView.spec.ts` — updated for provider_id, model grouping
- `CmdKModal.spec.ts` — gate on providers instead of isConnected
- `CopilotConnectionPanel.spec.ts` — only shown when no org providers
