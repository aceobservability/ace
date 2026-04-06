package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aceobservability/ace/backend/internal/crypto"
)

// hashToken returns a hex-encoded SHA-256 hash of the given token,
// used as a safe cache key instead of storing plaintext tokens in memory.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// AIProvider defines the interface for AI model providers (OpenAI-compatible, Copilot, etc.)
type AIProvider interface {
	ListModels(ctx context.Context) ([]AIModel, error)
	Chat(ctx context.Context, req ChatRequest, w http.ResponseWriter) error
}

// AIModel represents a model available from a provider.
type AIModel struct {
	ID       string                 `json:"id"`
	Name     string                 `json:"name"`
	Vendor   string                 `json:"vendor"`
	Category string                 `json:"category"`
	Meta     map[string]interface{} `json:"meta,omitempty"`
}

// ChatRequest represents an incoming chat completion request.
type ChatRequest struct {
	Model    string            `json:"model"`
	Messages []json.RawMessage `json:"messages"`
	Tools    []json.RawMessage `json:"tools,omitempty"`
	Stream   bool              `json:"stream"`
}

// OpenAICompatibleProvider implements AIProvider for any OpenAI-compatible API
// (OpenAI, Ollama, OpenRouter, vLLM, LiteLLM, etc.)
type OpenAICompatibleProvider struct {
	BaseURL     string
	APIKey      string // empty for local providers like Ollama
	DisplayName string
}

// NewOpenAICompatibleProvider creates a new OpenAI-compatible provider.
func NewOpenAICompatibleProvider(baseURL, apiKey, displayName string) *OpenAICompatibleProvider {
	return &OpenAICompatibleProvider{
		BaseURL:     strings.TrimRight(baseURL, "/"),
		APIKey:      apiKey,
		DisplayName: displayName,
	}
}

// openAIModelsResponse is the upstream response from GET /models.
type openAIModelsResponse struct {
	Data []struct {
		ID      string `json:"id"`
		OwnedBy string `json:"owned_by"`
	} `json:"data"`
}

// ListModels fetches the model list from the upstream /models endpoint.
func (p *OpenAICompatibleProvider) ListModels(ctx context.Context) ([]AIModel, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", p.BaseURL+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach provider: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(body))
	}

	var raw openAIModelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode models response: %w", err)
	}

	models := make([]AIModel, 0, len(raw.Data))
	for _, m := range raw.Data {
		models = append(models, AIModel{
			ID:     m.ID,
			Name:   m.ID,
			Vendor: m.OwnedBy,
		})
	}

	return models, nil
}

// Chat proxies a chat completion request to the upstream /chat/completions endpoint.
// For streaming requests, SSE chunks are flushed to w as they arrive.
// For non-streaming requests, the JSON body is copied directly.
func (p *OpenAICompatibleProvider) Chat(ctx context.Context, chatReq ChatRequest, w http.ResponseWriter) error {
	// Build upstream request body
	body := map[string]interface{}{
		"model":    chatReq.Model,
		"messages": chatReq.Messages,
		"stream":   chatReq.Stream,
	}
	if len(chatReq.Tools) > 0 {
		body["tools"] = chatReq.Tools
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.BaseURL+"/chat/completions", strings.NewReader(string(bodyJSON)))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reach provider: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(respBody))
	}

	if !chatReq.Stream {
		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, resp.Body)
		return nil
	}

	// Stream SSE chunks back to client
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			break
		}
	}

	return nil
}

// ---------------------------------------------------------------------------
// CopilotProvider — uses GitHub Copilot's two-step auth dance
// ---------------------------------------------------------------------------

const defaultCopilotTokenEndpoint = "https://api.github.com/copilot_internal/v2/token"

// CopilotProvider implements AIProvider for GitHub Copilot.
// It uses a two-step auth: first obtain a short-lived Copilot session token
// from the GitHub API using the user's encrypted GitHub access token, then
// use that session token to call the Copilot API.
type CopilotProvider struct {
	EncryptedGHToken string // AES-GCM encrypted GitHub access token

	// tokenEndpoint overrides the default GitHub token URL for testing.
	// If empty, defaults to defaultCopilotTokenEndpoint.
	tokenEndpoint string
}

// copilotTokenCache is a module-level cache mapping GitHub access tokens
// to their corresponding Copilot session tokens.
var copilotTokenCache sync.Map // map[string]cachedCopilotToken

// cachedCopilotToken stores a Copilot session token with its expiry.
type cachedCopilotToken struct {
	token       string
	apiEndpoint string
	expiresAt   int64
}

// setCopilotHeaders sets the required headers for Copilot API requests.
func setCopilotHeaders(req *http.Request, sessionToken string) {
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	req.Header.Set("Editor-Version", "vscode/1.100.0")
	req.Header.Set("Editor-Plugin-Version", "copilot/1.300.0")
	req.Header.Set("User-Agent", "GithubCopilot/1.300.0")
	req.Header.Set("Copilot-Integration-Id", "vscode-chat")
}

// getTokenEndpoint returns the token endpoint URL, using the override if set.
func (p *CopilotProvider) getTokenEndpoint() string {
	if p.tokenEndpoint != "" {
		return p.tokenEndpoint
	}
	return defaultCopilotTokenEndpoint
}

// getCopilotSessionToken obtains a Copilot session token, using the cache
// when available. The cache key is a SHA-256 hash of the GitHub token.
func (p *CopilotProvider) getCopilotSessionToken(ctx context.Context, ghToken string) (sessionToken string, apiEndpoint string, err error) {
	cacheKey := hashToken(ghToken)

	// Check cache: valid if expiresAt - 60 > now (60s buffer)
	if cached, ok := copilotTokenCache.Load(cacheKey); ok {
		entry := cached.(cachedCopilotToken)
		if entry.expiresAt-60 > time.Now().Unix() {
			return entry.token, entry.apiEndpoint, nil
		}
		// Evict expired entry to prevent stale accumulation
		copilotTokenCache.Delete(cacheKey)
	}

	// Fetch a fresh token
	req, err := http.NewRequestWithContext(ctx, "GET", p.getTokenEndpoint(), nil)
	if err != nil {
		return "", "", fmt.Errorf("failed to create token request: %w", err)
	}
	req.Header.Set("Authorization", "token "+ghToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Editor-Version", "vscode/1.100.0")
	req.Header.Set("Editor-Plugin-Version", "copilot/1.300.0")
	req.Header.Set("User-Agent", "GithubCopilot/1.300.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("failed to reach GitHub token endpoint: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("copilot token request failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var tokenResp struct {
		Token     string `json:"token"`
		ExpiresAt int64  `json:"expires_at"`
		Endpoints struct {
			API string `json:"api"`
		} `json:"endpoints"`
	}
	if err := json.Unmarshal(respBody, &tokenResp); err != nil {
		return "", "", fmt.Errorf("failed to decode Copilot token response: %w", err)
	}

	if tokenResp.Token == "" {
		return "", "", fmt.Errorf("empty Copilot token returned")
	}

	apiURL := tokenResp.Endpoints.API
	if apiURL == "" {
		apiURL = "https://api.individual.githubcopilot.com"
	}

	// Cache the token using hashed key
	copilotTokenCache.Store(cacheKey, cachedCopilotToken{
		token:       tokenResp.Token,
		apiEndpoint: apiURL,
		expiresAt:   tokenResp.ExpiresAt,
	})

	return tokenResp.Token, apiURL, nil
}

// copilotModelsResponse is the upstream Copilot models API response.
type copilotModelsResponse struct {
	Data []struct {
		ID                  string `json:"id"`
		Name                string `json:"name"`
		Vendor              string `json:"vendor"`
		ModelPickerEnabled  bool   `json:"model_picker_enabled"`
		ModelPickerCategory string `json:"model_picker_category"`
		Preview             bool   `json:"preview"`
		Policy              struct {
			State string `json:"state"`
		} `json:"policy"`
		SupportedEndpoints []string `json:"supported_endpoints"`
	} `json:"data"`
}

// ListModels fetches available Copilot models, filtering to enabled models
// that support /chat/completions.
func (p *CopilotProvider) ListModels(ctx context.Context) ([]AIModel, error) {
	ghToken, err := crypto.DecryptToken(p.EncryptedGHToken)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt GitHub token: %w", err)
	}

	sessionToken, apiEndpoint, err := p.getCopilotSessionToken(ctx, ghToken)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "GET", apiEndpoint+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create models request: %w", err)
	}
	setCopilotHeaders(req, sessionToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach Copilot API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("copilot models API returned %d: %s", resp.StatusCode, string(body))
	}

	var raw copilotModelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode Copilot models response: %w", err)
	}

	models := make([]AIModel, 0)
	for _, m := range raw.Data {
		if !m.ModelPickerEnabled || m.Policy.State != "enabled" {
			continue
		}
		supportsChat := false
		for _, ep := range m.SupportedEndpoints {
			if ep == "/chat/completions" {
				supportsChat = true
				break
			}
		}
		if !supportsChat {
			continue
		}

		models = append(models, AIModel{
			ID:       m.ID,
			Name:     m.Name,
			Vendor:   m.Vendor,
			Category: m.ModelPickerCategory,
		})
	}

	return models, nil
}

// Chat proxies a chat completion request to the Copilot API.
// Follows the same streaming/non-streaming pattern as OpenAICompatibleProvider.
func (p *CopilotProvider) Chat(ctx context.Context, chatReq ChatRequest, w http.ResponseWriter) error {
	ghToken, err := crypto.DecryptToken(p.EncryptedGHToken)
	if err != nil {
		return fmt.Errorf("failed to decrypt GitHub token: %w", err)
	}

	sessionToken, apiEndpoint, err := p.getCopilotSessionToken(ctx, ghToken)
	if err != nil {
		return err
	}

	// Build upstream request body
	body := map[string]interface{}{
		"model":    chatReq.Model,
		"messages": chatReq.Messages,
		"stream":   chatReq.Stream,
	}
	if len(chatReq.Tools) > 0 {
		body["tools"] = chatReq.Tools
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", apiEndpoint+"/chat/completions", strings.NewReader(string(bodyJSON)))
	if err != nil {
		return fmt.Errorf("failed to create chat request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	setCopilotHeaders(req, sessionToken)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reach Copilot API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("copilot API returned %d: %s", resp.StatusCode, string(respBody))
	}

	if !chatReq.Stream {
		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, resp.Body)
		return nil
	}

	// Stream SSE chunks back to client
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			break
		}
	}

	return nil
}
