package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/crypto"
	"go.uber.org/zap"
)

// jsonError writes a JSON error response with proper encoding, preventing JSON injection.
func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// validateBaseURL checks that a URL is safe to use as a provider base URL.
// It requires http:// or https:// scheme, rejects userinfo (@) and fragments (#),
// and blocks cloud metadata IPs (169.254.169.254).
func validateBaseURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("base_url must use http or https scheme")
	}
	if strings.Contains(raw, "@") {
		return fmt.Errorf("base_url must not contain userinfo (@)")
	}
	if strings.Contains(raw, "#") {
		return fmt.Errorf("base_url must not contain a fragment (#)")
	}

	// Resolve hostname to check for dangerous IPs
	hostname := u.Hostname()

	// Allow localhost and 127.0.0.1 explicitly (needed for local providers like Ollama)
	if hostname == "localhost" || hostname == "127.0.0.1" {
		return nil
	}

	// Check literal hostname if it's an IP address
	if ip := net.ParseIP(hostname); ip != nil {
		if err := checkDangerousIP(ip); err != nil {
			return err
		}
	}

	// Resolve hostname and check all resolved IPs
	ips, err := net.LookupHost(hostname)
	if err == nil {
		for _, ipStr := range ips {
			ip := net.ParseIP(ipStr)
			if ip == nil {
				continue
			}
			if err := checkDangerousIP(ip); err != nil {
				return err
			}
		}
	}

	return nil
}

// checkDangerousIP returns an error if the given IP is a cloud metadata address,
// loopback (other than 127.0.0.1 which is allowed for Ollama), or private RFC 1918 range.
func checkDangerousIP(ip net.IP) error {
	// Block link-local / cloud metadata (169.254.x.x)
	if ip.Equal(net.ParseIP("169.254.169.254")) {
		return fmt.Errorf("base_url must not resolve to cloud metadata IP")
	}

	// Block loopback range (127.x.x.x) except 127.0.0.1 which is allowed above
	if ip.IsLoopback() {
		return fmt.Errorf("base_url must not resolve to loopback address")
	}

	// Block RFC 1918 private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
	if ip.IsPrivate() {
		return fmt.Errorf("base_url must not resolve to private network address")
	}

	return nil
}

// bytesWrittenResponseWriter wraps an http.ResponseWriter and tracks whether
// any bytes have been written to the response body.
type bytesWrittenResponseWriter struct {
	http.ResponseWriter
	wroteBytes bool
}

func (bw *bytesWrittenResponseWriter) Write(p []byte) (int, error) {
	if len(p) > 0 {
		bw.wroteBytes = true
	}
	return bw.ResponseWriter.Write(p)
}

// Flush delegates to the underlying ResponseWriter if it implements http.Flusher.
func (bw *bytesWrittenResponseWriter) Flush() {
	if f, ok := bw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// AIHandler orchestrates all AI endpoints: provider CRUD, model listing, and chat.
type AIHandler struct {
	pool *pgxpool.Pool

	// testProvider allows tests to inject a mock AIProvider, bypassing DB resolution.
	testProvider AIProvider
}

// NewAIHandler creates a new AI handler.
func NewAIHandler(pool *pgxpool.Pool) *AIHandler {
	return &AIHandler{pool: pool}
}

// providerRow represents a row from the ai_providers table.
type providerRow struct {
	ID             uuid.UUID
	ProviderType   string
	DisplayName    string
	BaseURL        string
	APIKey         *string // nullable
	Enabled        bool
	ModelsOverride json.RawMessage // nullable JSONB
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// providerJSON is the safe JSON representation of a provider (no api_key).
type providerJSON struct {
	ID             uuid.UUID        `json:"id"`
	ProviderType   string           `json:"provider_type"`
	DisplayName    string           `json:"display_name"`
	BaseURL        string           `json:"base_url"`
	Enabled        bool             `json:"enabled"`
	ModelsOverride *json.RawMessage `json:"models_override,omitempty"`
}

// providerToJSON converts a providerRow to a safe JSON representation,
// stripping the api_key to prevent leaking secrets.
func providerToJSON(p providerRow) providerJSON {
	var mo *json.RawMessage
	if len(p.ModelsOverride) > 0 {
		mo = &p.ModelsOverride
	}
	return providerJSON{
		ID:             p.ID,
		ProviderType:   p.ProviderType,
		DisplayName:    p.DisplayName,
		BaseURL:        p.BaseURL,
		Enabled:        p.Enabled,
		ModelsOverride: mo,
	}
}

// chatRequestBody is the JSON body for POST /ai/chat.
type chatRequestBody struct {
	ProviderID     string            `json:"provider_id"`
	Model          string            `json:"model"`
	DatasourceType string            `json:"datasource_type"`
	DatasourceName string            `json:"datasource_name"`
	Messages       []json.RawMessage `json:"messages"`
	Tools          []json.RawMessage `json:"tools,omitempty"`
	Stream         bool              `json:"stream"`
}

// createProviderRequest is the JSON body for creating a provider.
type createProviderRequest struct {
	ProviderType   string           `json:"provider_type"`
	DisplayName    string           `json:"display_name"`
	BaseURL        string           `json:"base_url"`
	APIKey         string           `json:"api_key"`
	Enabled        *bool            `json:"enabled"`
	ModelsOverride *json.RawMessage `json:"models_override,omitempty"`
}

// updateProviderRequest is the JSON body for updating a provider.
type updateProviderRequest struct {
	ProviderType   *string          `json:"provider_type,omitempty"`
	DisplayName    *string          `json:"display_name,omitempty"`
	BaseURL        *string          `json:"base_url,omitempty"`
	APIKey         *string          `json:"api_key,omitempty"`
	Enabled        *bool            `json:"enabled,omitempty"`
	ModelsOverride *json.RawMessage `json:"models_override,omitempty"`
}

// ---------------------------------------------------------------------------
// Helper: admin check
// ---------------------------------------------------------------------------

// requireAdmin verifies the user is an admin of the org. Returns true if ok,
// false if it already wrote an error response.
func (h *AIHandler) requireAdmin(ctx context.Context, w http.ResponseWriter, userID, orgID uuid.UUID) bool {
	if h.pool == nil {
		jsonError(w, "admin access required", http.StatusForbidden)
		return false
	}
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role)
	if err != nil || role != "admin" {
		jsonError(w, "admin access required", http.StatusForbidden)
		return false
	}
	return true
}

// ---------------------------------------------------------------------------
// Helper: resolve provider from provider_id
// ---------------------------------------------------------------------------

func (h *AIHandler) resolveProvider(ctx context.Context, providerID string, userID, orgID uuid.UUID) (AIProvider, error) {
	// Test bypass
	if h.testProvider != nil {
		return h.testProvider, nil
	}

	if providerID == "copilot" {
		return h.buildCopilotProvider(ctx, userID)
	}

	// Try to parse as UUID — it's a DB provider
	pid, err := uuid.Parse(providerID)
	if err != nil {
		return nil, fmt.Errorf("unknown provider: %s", providerID)
	}

	return h.buildDBProvider(ctx, pid, orgID)
}

func (h *AIHandler) buildCopilotProvider(ctx context.Context, userID uuid.UUID) (*CopilotProvider, error) {
	if h.pool == nil {
		return nil, fmt.Errorf("failed to load copilot connection")
	}

	var encryptedToken string
	var hasCopilot bool
	err := h.pool.QueryRow(ctx,
		`SELECT access_token, has_copilot FROM user_github_connections WHERE user_id = $1`,
		userID,
	).Scan(&encryptedToken, &hasCopilot)
	if err != nil {
		return nil, fmt.Errorf("GitHub not connected — link your GitHub account first")
	}
	if !hasCopilot {
		return nil, fmt.Errorf("copilot access not available for your GitHub account")
	}

	return &CopilotProvider{EncryptedGHToken: encryptedToken}, nil
}

func (h *AIHandler) buildDBProvider(ctx context.Context, providerID, orgID uuid.UUID) (*OpenAICompatibleProvider, error) {
	if h.pool == nil {
		return nil, fmt.Errorf("failed to load provider")
	}

	var p providerRow
	err := h.pool.QueryRow(ctx,
		`SELECT id, provider_type, display_name, base_url, api_key, enabled, models_override
		 FROM ai_providers WHERE id = $1 AND organization_id = $2`,
		providerID, orgID,
	).Scan(&p.ID, &p.ProviderType, &p.DisplayName, &p.BaseURL, &p.APIKey, &p.Enabled, &p.ModelsOverride)
	if err != nil {
		return nil, fmt.Errorf("provider not found")
	}

	apiKey := ""
	if p.APIKey != nil && *p.APIKey != "" {
		decrypted, err := crypto.DecryptToken(*p.APIKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt provider API key: %w", err)
		}
		apiKey = decrypted
	}

	return NewOpenAICompatibleProvider(p.BaseURL, apiKey, p.DisplayName), nil
}

// ---------------------------------------------------------------------------
// 1. ListProviders — GET /api/orgs/{id}/ai/providers
// ---------------------------------------------------------------------------

func (h *AIHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	orgID, ok := auth.GetOrgID(r.Context())
	if !ok {
		jsonError(w, "missing organization context", http.StatusBadRequest)
		return
	}
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Try to get org-level providers from the DB
	var providers []providerJSON
	if h.pool != nil {
		rows, err := h.pool.Query(ctx,
			`SELECT id, provider_type, display_name, base_url, enabled, models_override
			 FROM ai_providers WHERE organization_id = $1 AND enabled = true`,
			orgID,
		)
		if err != nil {
			zap.L().Error("list providers query failed", zap.Error(err))
		} else {
			defer rows.Close()
			for rows.Next() {
				var p providerRow
				if err := rows.Scan(&p.ID, &p.ProviderType, &p.DisplayName, &p.BaseURL, &p.Enabled, &p.ModelsOverride); err != nil {
					zap.L().Error("list providers row scan failed", zap.Error(err))
					continue
				}
				providers = append(providers, providerToJSON(p))
			}
		}
	}

	// If org has providers, return them
	if len(providers) > 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(providers)
		return
	}

	// Fallback: check if user has a Copilot connection
	if h.pool != nil {
		var hasCopilot bool
		err := h.pool.QueryRow(ctx,
			`SELECT has_copilot FROM user_github_connections WHERE user_id = $1`,
			userID,
		).Scan(&hasCopilot)
		if err == nil && hasCopilot {
			copilotProvider := providerJSON{
				ID:           uuid.Nil,
				ProviderType: "copilot",
				DisplayName:  "GitHub Copilot",
				Enabled:      true,
			}
			// Use "copilot" as a string ID in the JSON
			type copilotProviderJSON struct {
				ID             string           `json:"id"`
				ProviderType   string           `json:"provider_type"`
				DisplayName    string           `json:"display_name"`
				BaseURL        string           `json:"base_url,omitempty"`
				Enabled        bool             `json:"enabled"`
				ModelsOverride *json.RawMessage `json:"models_override,omitempty"`
			}
			cp := copilotProviderJSON{
				ID:           "copilot",
				ProviderType: copilotProvider.ProviderType,
				DisplayName:  copilotProvider.DisplayName,
				Enabled:      copilotProvider.Enabled,
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]copilotProviderJSON{cp})
			return
		}
	}

	// Neither org providers nor Copilot: return empty array
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte("[]"))
}

// ---------------------------------------------------------------------------
// 2. ListModels — GET /api/orgs/{id}/ai/models?provider_id=X
// ---------------------------------------------------------------------------

func (h *AIHandler) ListModels(w http.ResponseWriter, r *http.Request) {
	orgID, ok := auth.GetOrgID(r.Context())
	if !ok {
		jsonError(w, "missing organization context", http.StatusBadRequest)
		return
	}
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	providerID := r.URL.Query().Get("provider_id")
	if providerID == "" {
		jsonError(w, "provider_id query parameter is required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	provider, err := h.resolveProvider(ctx, providerID, userID, orgID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}

	models, err := provider.ListModels(ctx)
	if err != nil {
		// If ListModels fails and this is a DB provider with models_override, use override
		if providerID != "copilot" && h.pool != nil {
			pid, parseErr := uuid.Parse(providerID)
			if parseErr == nil {
				var override json.RawMessage
				scanErr := h.pool.QueryRow(ctx,
					`SELECT models_override FROM ai_providers WHERE id = $1 AND organization_id = $2 AND models_override IS NOT NULL`,
					pid, orgID,
				).Scan(&override)
				if scanErr == nil && len(override) > 0 {
					// Parse the override as an array of model IDs or objects
					var modelIDs []string
					if json.Unmarshal(override, &modelIDs) == nil && len(modelIDs) > 0 {
						fallbackModels := make([]AIModel, 0, len(modelIDs))
						for _, id := range modelIDs {
							fallbackModels = append(fallbackModels, AIModel{ID: id, Name: id})
						}
						w.Header().Set("Content-Type", "application/json")
						json.NewEncoder(w).Encode(map[string]interface{}{"models": fallbackModels})
						return
					}
				}
			}
		}
		jsonError(w, "failed to list models: "+err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"models": models})
}

// ---------------------------------------------------------------------------
// 3. Chat — POST /api/orgs/{id}/ai/chat
// ---------------------------------------------------------------------------

// isToolIncompatibilityError checks if an error message looks like a
// tool/function incompatibility error (400/422 with mention of tools/functions).
func isToolIncompatibilityError(errMsg string) bool {
	lower := strings.ToLower(errMsg)
	hasStatusCode := strings.Contains(lower, "400") || strings.Contains(lower, "422")
	hasToolMention := strings.Contains(lower, "tool") || strings.Contains(lower, "function")
	return hasStatusCode && hasToolMention
}

func (h *AIHandler) Chat(w http.ResponseWriter, r *http.Request) {
	// Fix #4: Limit request body to 2 MB
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)

	orgID, ok := auth.GetOrgID(r.Context())
	if !ok {
		jsonError(w, "missing organization context", http.StatusBadRequest)
		return
	}
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var reqBody chatRequestBody
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Fix #5: Validate required fields
	if reqBody.ProviderID == "" {
		jsonError(w, "provider_id is required", http.StatusBadRequest)
		return
	}
	if reqBody.Model == "" {
		jsonError(w, "model is required", http.StatusBadRequest)
		return
	}

	if len(reqBody.Messages) == 0 {
		jsonError(w, "messages array is required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	// Resolve provider
	provider, err := h.resolveProvider(ctx, reqBody.ProviderID, userID, orgID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}

	// System prompt injection
	systemPrompt := DefaultSystemPrompt
	if prompt, found := SystemPrompts[reqBody.DatasourceType]; found {
		systemPrompt = prompt
	}

	// Build messages with system prompt prepended
	systemMsg, _ := json.Marshal(map[string]string{
		"role":    "system",
		"content": systemPrompt,
	})
	messages := make([]json.RawMessage, 0, len(reqBody.Messages)+1)
	messages = append(messages, json.RawMessage(systemMsg))
	messages = append(messages, reqBody.Messages...)

	chatReq := ChatRequest{
		Model:    reqBody.Model,
		Messages: messages,
		Tools:    reqBody.Tools,
		Stream:   reqBody.Stream,
	}

	// Fix #3: Track whether bytes have been written to prevent retry after partial write
	bw := &bytesWrittenResponseWriter{ResponseWriter: w}

	// First attempt
	err = provider.Chat(ctx, chatReq, bw)
	if err != nil {
		// Graceful tool degradation: retry without tools if it looks like a tool error
		// Only retry if no bytes have been written to the client yet
		if !bw.wroteBytes && len(chatReq.Tools) > 0 && isToolIncompatibilityError(err.Error()) {
			zap.L().Warn("tool incompatibility detected, retrying without tools", zap.Error(err))
			chatReq.Tools = nil
			bw.Header().Set("X-Tools-Unsupported", "true")
			retryErr := provider.Chat(ctx, chatReq, bw)
			if retryErr != nil {
				if !bw.wroteBytes {
					jsonError(w, "chat failed: "+retryErr.Error(), http.StatusBadGateway)
				}
			}
			return
		}
		if !bw.wroteBytes {
			jsonError(w, "chat failed: "+err.Error(), http.StatusBadGateway)
		}
		return
	}
}

// ---------------------------------------------------------------------------
// 4. CreateProvider — POST /api/orgs/{id}/ai/providers
// ---------------------------------------------------------------------------

func (h *AIHandler) CreateProvider(w http.ResponseWriter, r *http.Request) {
	// Fix #4: Limit request body to 64 KB for CRUD handlers
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	orgID, ok := auth.GetOrgID(r.Context())
	if !ok {
		jsonError(w, "missing organization context", http.StatusBadRequest)
		return
	}
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if !h.requireAdmin(ctx, w, userID, orgID) {
		return
	}

	var reqBody createProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if reqBody.ProviderType == "" || reqBody.DisplayName == "" || reqBody.BaseURL == "" {
		jsonError(w, "provider_type, display_name, and base_url are required", http.StatusBadRequest)
		return
	}

	// Fix #1: SSRF validation on base_url
	if err := validateBaseURL(reqBody.BaseURL); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Encrypt API key if provided
	var encryptedKey *string
	if reqBody.APIKey != "" {
		enc, err := crypto.EncryptToken(reqBody.APIKey)
		if err != nil {
			jsonError(w, "failed to encrypt API key", http.StatusInternalServerError)
			return
		}
		encryptedKey = &enc
	}

	enabled := true
	if reqBody.Enabled != nil {
		enabled = *reqBody.Enabled
	}

	var p providerRow
	err := h.pool.QueryRow(ctx,
		`INSERT INTO ai_providers (organization_id, provider_type, display_name, base_url, api_key, enabled, models_override)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, provider_type, display_name, base_url, enabled, models_override, created_at, updated_at`,
		orgID, reqBody.ProviderType, reqBody.DisplayName, reqBody.BaseURL, encryptedKey, enabled, reqBody.ModelsOverride,
	).Scan(&p.ID, &p.ProviderType, &p.DisplayName, &p.BaseURL, &p.Enabled, &p.ModelsOverride, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		zap.L().Error("failed to create provider", zap.Error(err))
		jsonError(w, "failed to create provider", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(providerToJSON(p))
}

// ---------------------------------------------------------------------------
// 5. UpdateProvider — PUT /api/orgs/{id}/ai/providers/{pid}
// ---------------------------------------------------------------------------

func (h *AIHandler) UpdateProvider(w http.ResponseWriter, r *http.Request) {
	// Fix #4: Limit request body to 64 KB for CRUD handlers
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	orgID, ok := auth.GetOrgID(r.Context())
	if !ok {
		jsonError(w, "missing organization context", http.StatusBadRequest)
		return
	}
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	pid, err := uuid.Parse(r.PathValue("pid"))
	if err != nil {
		jsonError(w, "invalid provider id", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if !h.requireAdmin(ctx, w, userID, orgID) {
		return
	}

	var reqBody updateProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Load existing provider
	var existing providerRow
	err = h.pool.QueryRow(ctx,
		`SELECT id, provider_type, display_name, base_url, api_key, enabled, models_override
		 FROM ai_providers WHERE id = $1 AND organization_id = $2`,
		pid, orgID,
	).Scan(&existing.ID, &existing.ProviderType, &existing.DisplayName, &existing.BaseURL, &existing.APIKey, &existing.Enabled, &existing.ModelsOverride)
	if err != nil {
		if err == pgx.ErrNoRows {
			jsonError(w, "provider not found", http.StatusNotFound)
		} else {
			jsonError(w, "failed to load provider", http.StatusInternalServerError)
		}
		return
	}

	// Apply updates
	if reqBody.ProviderType != nil {
		existing.ProviderType = *reqBody.ProviderType
	}
	if reqBody.DisplayName != nil {
		existing.DisplayName = *reqBody.DisplayName
	}
	if reqBody.BaseURL != nil {
		existing.BaseURL = *reqBody.BaseURL
	}
	if reqBody.Enabled != nil {
		existing.Enabled = *reqBody.Enabled
	}
	if reqBody.ModelsOverride != nil {
		existing.ModelsOverride = *reqBody.ModelsOverride
	}

	// Fix #1: SSRF validation on base_url (validate the final URL after applying updates)
	if err := validateBaseURL(existing.BaseURL); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Encrypt new API key if provided
	var encryptedKey *string
	if reqBody.APIKey != nil && *reqBody.APIKey != "" {
		enc, encErr := crypto.EncryptToken(*reqBody.APIKey)
		if encErr != nil {
			jsonError(w, "failed to encrypt API key", http.StatusInternalServerError)
			return
		}
		encryptedKey = &enc
	} else {
		encryptedKey = existing.APIKey // keep existing
	}

	var updated providerRow
	err = h.pool.QueryRow(ctx,
		`UPDATE ai_providers
		 SET provider_type = $1, display_name = $2, base_url = $3, api_key = $4, enabled = $5, models_override = $6, updated_at = NOW()
		 WHERE id = $7 AND organization_id = $8
		 RETURNING id, provider_type, display_name, base_url, enabled, models_override, created_at, updated_at`,
		existing.ProviderType, existing.DisplayName, existing.BaseURL, encryptedKey, existing.Enabled, existing.ModelsOverride,
		pid, orgID,
	).Scan(&updated.ID, &updated.ProviderType, &updated.DisplayName, &updated.BaseURL, &updated.Enabled, &updated.ModelsOverride, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		zap.L().Error("failed to update provider", zap.Error(err))
		jsonError(w, "failed to update provider", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(providerToJSON(updated))
}

// ---------------------------------------------------------------------------
// 6. DeleteProvider — DELETE /api/orgs/{id}/ai/providers/{pid}
// ---------------------------------------------------------------------------

func (h *AIHandler) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	orgID, ok := auth.GetOrgID(r.Context())
	if !ok {
		jsonError(w, "missing organization context", http.StatusBadRequest)
		return
	}
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	pid, err := uuid.Parse(r.PathValue("pid"))
	if err != nil {
		jsonError(w, "invalid provider id", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if !h.requireAdmin(ctx, w, userID, orgID) {
		return
	}

	tag, err := h.pool.Exec(ctx,
		`DELETE FROM ai_providers WHERE id = $1 AND organization_id = $2`,
		pid, orgID,
	)
	if err != nil {
		jsonError(w, "failed to delete provider", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "provider not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// 7. TestProvider — POST /api/orgs/{id}/ai/providers/{pid}/test
// ---------------------------------------------------------------------------

func (h *AIHandler) TestProvider(w http.ResponseWriter, r *http.Request) {
	orgID, ok := auth.GetOrgID(r.Context())
	if !ok {
		jsonError(w, "missing organization context", http.StatusBadRequest)
		return
	}
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	pid, err := uuid.Parse(r.PathValue("pid"))
	if err != nil {
		jsonError(w, "invalid provider id", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	if !h.requireAdmin(ctx, w, userID, orgID) {
		return
	}

	// Load provider from DB
	provider, err := h.buildDBProvider(ctx, pid, orgID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	models, err := provider.ListModels(ctx)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"models_count": len(models),
	})
}
