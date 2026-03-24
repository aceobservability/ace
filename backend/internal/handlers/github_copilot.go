package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/crypto"
)

type GitHubCopilotHandler struct {
	pool       *pgxpool.Pool
	jwtManager *auth.JWTManager
	baseURL    string
}

func NewGitHubCopilotHandler(pool *pgxpool.Pool, jwtManager *auth.JWTManager) *GitHubCopilotHandler {
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	return &GitHubCopilotHandler{
		pool:       pool,
		jwtManager: jwtManager,
		baseURL:    baseURL,
	}
}

// GitHubAppConfigRequest represents the request body for configuring a GitHub OAuth App per org.
type GitHubAppConfigRequest struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Enabled      *bool  `json:"enabled,omitempty"`
}

// GitHubAppConfigResponse represents the response for GitHub App config.
type GitHubAppConfigResponse struct {
	ClientID  string    `json:"client_id"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// getOAuthConfig looks up org-specific GitHub OAuth credentials from the sso_configs table.
func (h *GitHubCopilotHandler) getOAuthConfig(ctx context.Context, orgID uuid.UUID) (clientID string, clientSecret string, err error) {
	var enabled bool
	err = h.pool.QueryRow(ctx,
		`SELECT client_id, client_secret, enabled FROM sso_configs
		 WHERE organization_id = $1 AND provider = 'github_copilot'`,
		orgID,
	).Scan(&clientID, &clientSecret, &enabled)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", "", fmt.Errorf("github copilot not configured for this organization")
		}
		return "", "", err
	}
	if !enabled {
		return "", "", fmt.Errorf("github copilot is not enabled for this organization")
	}
	return clientID, clientSecret, nil
}

type gitHubUser struct {
	ID    int    `json:"id"`
	Login string `json:"login"`
	Email string `json:"email"`
}

type gitHubTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
	Error       string `json:"error"`
	ErrorDesc   string `json:"error_description"`
}

type copilotTokenResponse struct {
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expires_at"`
	Endpoints struct {
		API string `json:"api"`
	} `json:"endpoints"`
}

type copilotChatRequest struct {
	DatasourceType string        `json:"datasource_type"`
	DatasourceName string        `json:"datasource_name"`
	Model          string        `json:"model,omitempty"`
	Messages       []interface{} `json:"messages"`
	Tools          []interface{} `json:"tools,omitempty"`
	Stream         *bool         `json:"stream,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type connectionResponse struct {
	Connected  bool   `json:"connected"`
	Username   string `json:"username"`
	HasCopilot bool   `json:"has_copilot"`
}



// copilotClientID is GitHub's official public Copilot OAuth client ID.
// All Copilot integrations (VS Code, Neovim, CLI) use this same client ID
// via the device flow to obtain tokens that work with the Copilot API.
const copilotClientID = "Iv1.b507a08c87ecfe98"

type deviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

type deviceTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
	Error       string `json:"error"`
	ErrorDesc   string `json:"error_description"`
}

// StartDeviceFlow initiates the GitHub device flow for Copilot authentication.
func (h *GitHubCopilotHandler) StartDeviceFlow(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	body := fmt.Sprintf("client_id=%s&scope=read:user+copilot", copilotClientID)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://github.com/login/device/code", strings.NewReader(body))
	if err != nil {
		http.Error(w, `{"error":"failed to create device flow request"}`, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"failed to contact GitHub"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		http.Error(w, fmt.Sprintf(`{"error":"GitHub device flow failed (%d): %s"}`, resp.StatusCode, string(respBody)), http.StatusBadGateway)
		return
	}

	var deviceResp deviceCodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&deviceResp); err != nil {
		http.Error(w, `{"error":"failed to decode device flow response"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(deviceResp)
}

// PollDeviceFlow polls GitHub for device flow completion and saves the connection.
func (h *GitHubCopilotHandler) PollDeviceFlow(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var reqBody struct {
		DeviceCode string `json:"device_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil || reqBody.DeviceCode == "" {
		http.Error(w, `{"error":"device_code is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Poll GitHub for the token
	body := fmt.Sprintf("client_id=%s&device_code=%s&grant_type=urn:ietf:params:oauth:grant-type:device_code",
		copilotClientID, reqBody.DeviceCode)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://github.com/login/oauth/access_token", strings.NewReader(body))
	if err != nil {
		http.Error(w, `{"error":"failed to create token request"}`, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"failed to contact GitHub"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var tokenResp deviceTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		http.Error(w, `{"error":"failed to decode token response"}`, http.StatusInternalServerError)
		return
	}

	// Still waiting for user to authorize
	if tokenResp.Error == "authorization_pending" || tokenResp.Error == "slow_down" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "pending"})
		return
	}

	if tokenResp.Error != "" {
		http.Error(w, fmt.Sprintf(`{"error":"%s: %s"}`, tokenResp.Error, tokenResp.ErrorDesc), http.StatusBadRequest)
		return
	}

	ghToken := tokenResp.AccessToken

	// Fetch GitHub user info
	ghUser, err := h.fetchGitHubUser(ctx, ghToken)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch GitHub user info"}`, http.StatusInternalServerError)
		return
	}

	// Check Copilot access
	hasCopilot := false
	if _, _, copilotErr := h.fetchCopilotToken(ctx, ghToken); copilotErr == nil {
		hasCopilot = true
	} else {
		log.Printf("copilot token check: %v", copilotErr)
	}

	// Encrypt the access token before storing
	encryptedToken, err := crypto.EncryptToken(ghToken)
	if err != nil {
		http.Error(w, `{"error":"failed to encrypt token"}`, http.StatusInternalServerError)
		return
	}

	// Upsert the connection
	_, err = h.pool.Exec(ctx,
		`INSERT INTO user_github_connections (user_id, github_user_id, github_username, github_email, access_token, scopes, has_copilot, copilot_checked_at, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
		 ON CONFLICT (user_id) DO UPDATE
		 SET github_user_id = $2, github_username = $3, github_email = $4, access_token = $5, scopes = $6, has_copilot = $7, copilot_checked_at = NOW(), updated_at = NOW()`,
		userID, fmt.Sprintf("%d", ghUser.ID), ghUser.Login, ghUser.Email, encryptedToken, tokenResp.Scope, hasCopilot,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save GitHub connection"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "connected",
		"username":    ghUser.Login,
		"has_copilot": hasCopilot,
	})
}

// Disconnect removes the GitHub connection for the current user.
func (h *GitHubCopilotHandler) Disconnect(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err := h.pool.Exec(ctx, `DELETE FROM user_github_connections WHERE user_id = $1`, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to disconnect GitHub"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetConnection returns the GitHub connection status for the current user.
func (h *GitHubCopilotHandler) GetConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var username string
	var hasCopilot bool
	err := h.pool.QueryRow(ctx,
		`SELECT github_username, has_copilot FROM user_github_connections WHERE user_id = $1`,
		userID,
	).Scan(&username, &hasCopilot)

	if err == pgx.ErrNoRows {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(connectionResponse{Connected: false})
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get connection"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(connectionResponse{
		Connected:  true,
		Username:   username,
		HasCopilot: hasCopilot,
	})
}

// premiumMultipliers maps model IDs to their premium request multiplier.
// Source: https://docs.github.com/en/copilot/about-github-copilot/plans-for-github-copilot
var premiumMultipliers = map[string]float64{
	// Included (0x)
	"gpt-4.1":     0,
	"gpt-4o":      0,
	"gpt-5-mini":  0,
	"raptor-mini": 0,
	// 0.25x
	"grok-code-fast-1": 0.25,
	// 0.33x
	"claude-haiku-4.5":   0.33,
	"gemini-3-flash":     0.33,
	"gpt-5.1-codex-mini": 0.33,
	// 1x Premium
	"claude-sonnet-4":   1,
	"claude-sonnet-4.5": 1,
	"claude-sonnet-4.6": 1,
	"gemini-2.5-pro":    1,
	"gemini-3-pro":      1,
	"gemini-3.1-pro":    1,
	"gpt-5.1":           1,
	"gpt-5.1-codex":     1,
	"gpt-5.1-codex-max": 1,
	"gpt-5.2":           1,
	"gpt-5.2-codex":     1,
	"gpt-5.3-codex":     1,
	// 3x
	"claude-opus-4.5": 3,
	"claude-opus-4.6": 3,
	// 30x
	"claude-opus-4.6-fast": 30,
}

type copilotModel struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Vendor            string  `json:"vendor"`
	Category          string  `json:"category"`
	Preview           bool    `json:"preview"`
	PremiumMultiplier float64 `json:"premium_multiplier"`
}

// ListModels returns available Copilot models for the current user.
func (h *GitHubCopilotHandler) ListModels(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var encryptedToken string
	err := h.pool.QueryRow(ctx,
		`SELECT access_token FROM user_github_connections WHERE user_id = $1`,
		userID,
	).Scan(&encryptedToken)
	if err != nil {
		http.Error(w, `{"error":"GitHub not connected"}`, http.StatusBadRequest)
		return
	}

	ghToken, err := crypto.DecryptToken(encryptedToken)
	if err != nil {
		http.Error(w, `{"error":"failed to decrypt token"}`, http.StatusInternalServerError)
		return
	}

	copilotToken, apiEndpoint, err := h.fetchCopilotToken(ctx, ghToken)
	if err != nil {
		http.Error(w, `{"error":"failed to get Copilot token"}`, http.StatusBadGateway)
		return
	}

	req, err := http.NewRequestWithContext(ctx, "GET", apiEndpoint+"/models", nil)
	if err != nil {
		http.Error(w, `{"error":"failed to create request"}`, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+copilotToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Editor-Version", "vscode/1.100.0")
	req.Header.Set("Editor-Plugin-Version", "copilot/1.300.0")
	req.Header.Set("User-Agent", "GithubCopilot/1.300.0")
	req.Header.Set("Copilot-Integration-Id", "vscode-chat")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"failed to reach Copilot API"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf(`{"error":"Copilot models API error (%d)"}`, resp.StatusCode), http.StatusBadGateway)
		return
	}

	// Parse the raw models response
	var raw struct {
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
	if err := json.Unmarshal(respBody, &raw); err != nil {
		http.Error(w, `{"error":"failed to parse models response"}`, http.StatusInternalServerError)
		return
	}

	// Filter to enabled models that support chat and enrich with multiplier
	var models []copilotModel
	for _, m := range raw.Data {
		if !m.ModelPickerEnabled || m.Policy.State != "enabled" {
			continue
		}
		// Only include models that support chat completions
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

		multiplier, known := premiumMultipliers[m.ID]
		if !known {
			multiplier = 1 // default to 1x for unknown models
		}

		models = append(models, copilotModel{
			ID:                m.ID,
			Name:              m.Name,
			Vendor:            m.Vendor,
			Category:          m.ModelPickerCategory,
			Preview:           m.Preview,
			PremiumMultiplier: multiplier,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"models": models,
	})
}

// Chat proxies chat requests to GitHub Copilot.
func (h *GitHubCopilotHandler) Chat(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req copilotChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if len(req.Messages) == 0 {
		http.Error(w, `{"error":"messages array is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	// Load encrypted token
	var encryptedToken string
	err := h.pool.QueryRow(ctx,
		`SELECT access_token FROM user_github_connections WHERE user_id = $1`,
		userID,
	).Scan(&encryptedToken)

	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"GitHub not connected"}`, http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to load GitHub connection"}`, http.StatusInternalServerError)
		return
	}

	// Decrypt the access token
	ghToken, err := crypto.DecryptToken(encryptedToken)
	if err != nil {
		http.Error(w, `{"error":"failed to decrypt token"}`, http.StatusInternalServerError)
		return
	}

	// Fetch Copilot session token
	copilotToken, apiEndpoint, err := h.fetchCopilotToken(ctx, ghToken)
	if err != nil {
		// Update has_copilot = false if we get a 401/403
		if strings.Contains(err.Error(), "401") || strings.Contains(err.Error(), "403") {
			h.pool.Exec(ctx, `UPDATE user_github_connections SET has_copilot = false, copilot_checked_at = NOW() WHERE user_id = $1`, userID)
		}
		http.Error(w, fmt.Sprintf(`{"error":"failed to get Copilot token: %s"}`, err.Error()), http.StatusBadGateway)
		return
	}

	// Mark has_copilot = true since we got a valid token
	h.pool.Exec(ctx, `UPDATE user_github_connections SET has_copilot = true, copilot_checked_at = NOW() WHERE user_id = $1`, userID)

	// Build messages with system prompt
	systemPrompt := DefaultSystemPrompt
	if prompt, ok := SystemPrompts[req.DatasourceType]; ok {
		systemPrompt = prompt
	}

	messages := make([]interface{}, 0, len(req.Messages)+1)
	messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})
	messages = append(messages, req.Messages...)

	// Forward to Copilot API
	model := req.Model
	if model == "" {
		model = "gpt-4o"
	}
	shouldStream := true
	if req.Stream != nil {
		shouldStream = *req.Stream
	}

	body := map[string]interface{}{
		"model":    model,
		"stream":   shouldStream,
		"messages": messages,
	}
	if len(req.Tools) > 0 {
		body["tools"] = req.Tools
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		http.Error(w, `{"error":"failed to build request"}`, http.StatusInternalServerError)
		return
	}

	copilotReq, err := http.NewRequestWithContext(ctx, "POST", apiEndpoint+"/chat/completions", strings.NewReader(string(bodyJSON)))
	if err != nil {
		http.Error(w, `{"error":"failed to create request"}`, http.StatusInternalServerError)
		return
	}

	copilotReq.Header.Set("Authorization", "Bearer "+copilotToken)
	copilotReq.Header.Set("Content-Type", "application/json")
	copilotReq.Header.Set("Editor-Version", "vscode/1.100.0")
	copilotReq.Header.Set("Editor-Plugin-Version", "copilot/1.300.0")
	copilotReq.Header.Set("User-Agent", "GithubCopilot/1.300.0")
	copilotReq.Header.Set("Copilot-Integration-Id", "vscode-chat")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(copilotReq)
	if err != nil {
		http.Error(w, `{"error":"failed to reach Copilot API"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("copilot chat API error (%d): %s", resp.StatusCode, string(respBody))
		statusCode := http.StatusBadGateway
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			statusCode = resp.StatusCode
		}
		http.Error(w, fmt.Sprintf(`{"error":"Copilot API error (%d): %s"}`, resp.StatusCode, string(respBody)), statusCode)
		return
	}

	if !shouldStream {
		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, resp.Body)
		return
	}

	// Stream the response back
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
}

// ConfigureGitHubApp creates or updates GitHub OAuth App configuration for an organization.
func (h *GitHubCopilotHandler) ConfigureGitHubApp(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check if user is admin of org
	var role string
	err = h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return
	}
	if role != "admin" {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var req GitHubAppConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.ClientID == "" || req.ClientSecret == "" {
		http.Error(w, `{"error":"client_id and client_secret are required"}`, http.StatusBadRequest)
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	var config GitHubAppConfigResponse
	err = h.pool.QueryRow(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, enabled)
		 VALUES ($1, 'github_copilot', $2, $3, $4)
		 ON CONFLICT (organization_id, provider) DO UPDATE
		 SET client_id = $2, client_secret = $3, enabled = $4, updated_at = NOW()
		 RETURNING client_id, enabled, created_at, updated_at`,
		orgID, req.ClientID, req.ClientSecret, enabled,
	).Scan(&config.ClientID, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to save GitHub App config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// GetGitHubApp returns the GitHub OAuth App configuration for an organization.
func (h *GitHubCopilotHandler) GetGitHubApp(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check if user is admin of org
	var role string
	err = h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return
	}
	if role != "admin" {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var config GitHubAppConfigResponse
	err = h.pool.QueryRow(ctx,
		`SELECT client_id, enabled, created_at, updated_at FROM sso_configs
		 WHERE organization_id = $1 AND provider = 'github_copilot'`,
		orgID,
	).Scan(&config.ClientID, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"github copilot not configured"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get GitHub App config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// fetchGitHubUser fetches the authenticated GitHub user.
func (h *GitHubCopilotHandler) fetchGitHubUser(ctx context.Context, token string) (*gitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var user gitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}

	return &user, nil
}

// fetchCopilotToken gets a short-lived Copilot session token and the API endpoint.
func (h *GitHubCopilotHandler) fetchCopilotToken(ctx context.Context, ghToken string) (token string, apiEndpoint string, err error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/copilot_internal/v2/token", nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "token "+ghToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Editor-Version", "vscode/1.100.0")
	req.Header.Set("Editor-Plugin-Version", "copilot/1.300.0")
	req.Header.Set("User-Agent", "GithubCopilot/1.300.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("copilot token request failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var tokenResp copilotTokenResponse
	if err := json.Unmarshal(respBody, &tokenResp); err != nil {
		return "", "", fmt.Errorf("failed to decode Copilot token response")
	}

	if tokenResp.Token == "" {
		return "", "", fmt.Errorf("empty Copilot token returned")
	}

	apiURL := tokenResp.Endpoints.API
	if apiURL == "" {
		apiURL = "https://api.individual.githubcopilot.com"
	}

	return tokenResp.Token, apiURL, nil
}
