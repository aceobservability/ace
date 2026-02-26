package handlers

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/janhoon/dash/backend/internal/auth"
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
	ExpiresAt string `json:"expires_at"`
}

type copilotChatRequest struct {
	DatasourceType string          `json:"datasource_type"`
	DatasourceName string          `json:"datasource_name"`
	Messages       []chatMessage   `json:"messages"`
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

var copilotSystemPrompts = map[string]string{
	"loki": `You are an expert in Loki and LogQL query language. Help the user write and optimize LogQL queries.
LogQL supports log stream selectors like {app="nginx"}, filter expressions like |= "error",
metric queries like rate({app="nginx"}[5m]), and parsing with | json or | logfmt.
Always respond with ready-to-use LogQL. Keep explanations brief.`,

	"victorialogs": `You are an expert in VictoriaLogs query language. Help write efficient log queries.
VictoriaLogs uses a filter syntax similar to LogQL but with its own extensions.
Respond with ready-to-use queries and brief explanations.`,

	"elasticsearch": `You are an expert in Elasticsearch query DSL and log analysis. Help write Elasticsearch queries.
Lucene query syntax: field:value, wildcards, ranges. KQL: field: value.
Respond with ready-to-use Elasticsearch query strings or JSON DSL.`,

	"prometheus": `You are an expert in PromQL (Prometheus Query Language). Help write metrics queries.
PromQL supports instant vectors, range vectors, aggregations (sum, avg, rate), and functions.
Example: rate(http_requests_total{status="500"}[5m])
Always respond with ready-to-use PromQL expressions.`,

	"victoriametrics": `You are an expert in MetricsQL (VictoriaMetrics Query Language), which extends PromQL.
MetricsQL adds functions like median_over_time(), zscore(), share(). Standard PromQL also works.
Always respond with ready-to-use MetricsQL/PromQL.`,

	"tempo": `You are an expert in distributed tracing and Grafana Tempo. Help with trace queries and analysis.
Tempo uses TraceQL: {.http.status_code=500 && duration>200ms}
Respond with ready-to-use TraceQL queries and explain spans/traces concepts briefly.`,

	"victoriatraces": `You are an expert in distributed tracing and VictoriaTraces (OpenTelemetry-compatible).
Help write trace search queries. Use OpenTelemetry semantic conventions for span attributes.
Respond with ready-to-use trace filter expressions.`,

	"clickhouse": `You are an expert in ClickHouse SQL and log analytics. Help write efficient ClickHouse queries.
ClickHouse supports standard SQL with extensions: ARRAY JOIN, WITH TOTALS, SETTINGS.
For time-series: toStartOfMinute(timestamp), for logs: has(Tags, 'key=value').
Respond with ready-to-use ClickHouse SQL.`,

	"cloudwatch": `You are an expert in AWS CloudWatch metrics and logs. Help with CloudWatch Insights queries and metric expressions.
CloudWatch Logs Insights: fields @message | filter @message like "ERROR" | stats count(*) by bin(5m)
CloudWatch math: m1+m2, RATE(m1), FILL(m1, 0).
Respond with ready-to-use CloudWatch expressions.`,

	"vmalert": `You are an expert in VMAlert alerting rules (Prometheus alerting rule format).
Help write alert rules, recording rules, and explain alert conditions.
Respond with ready-to-use YAML alert rule definitions.`,

	"alertmanager": `You are an expert in Alertmanager routing, silences, and configuration.
Help configure routing trees, inhibit rules, receiver configs (email, slack, pagerduty).
Respond with ready-to-use Alertmanager YAML configuration snippets.`,
}

const defaultSystemPrompt = `You are an expert in observability, monitoring, and query languages.
Help the user write and optimize queries for their observability platform.
Be concise and provide ready-to-use query examples.`

// deriveEncryptionKey derives a 32-byte AES key from JWT_SECRET (or the JWT private key PEM).
func deriveEncryptionKey() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// Fall back to the private key PEM bytes
		secret = os.Getenv("JWT_PRIVATE_KEY")
	}
	if secret == "" {
		// Read from disk as last resort
		data, err := os.ReadFile(".data/jwt.key")
		if err != nil {
			return nil, fmt.Errorf("no encryption key material available")
		}
		secret = string(data)
	}
	hash := sha256.Sum256([]byte(secret))
	return hash[:], nil
}

func encryptToken(plaintext string) (string, error) {
	key, err := deriveEncryptionKey()
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

func decryptToken(encoded string) (string, error) {
	key, err := deriveEncryptionKey()
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

// Login initiates the GitHub OAuth flow for connecting Copilot.
func (h *GitHubCopilotHandler) Login(w http.ResponseWriter, r *http.Request) {
	orgIDStr := r.URL.Query().Get("org")
	if orgIDStr == "" {
		http.Error(w, `{"error":"org parameter is required"}`, http.StatusBadRequest)
		return
	}

	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid org parameter"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	clientID, _, err := h.getOAuthConfig(ctx, orgID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	state, err := generateState()
	if err != nil {
		http.Error(w, `{"error":"failed to generate state"}`, http.StatusInternalServerError)
		return
	}

	// Encode state + orgID into cookie
	stateData := fmt.Sprintf("%s:%s", state, orgID.String())
	http.SetCookie(w, &http.Cookie{
		Name:     "github_oauth_state",
		Value:    base64.URLEncoding.EncodeToString([]byte(stateData)),
		Path:     "/",
		MaxAge:   600, // 10 minutes
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	redirectURL := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&scope=read:user+copilot&state=%s&redirect_uri=%s",
		clientID, state,
		url.QueryEscape(h.baseURL+"/api/auth/github/callback"),
	)

	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// Callback handles the GitHub OAuth callback.
func (h *GitHubCopilotHandler) Callback(w http.ResponseWriter, r *http.Request) {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}

	// Verify state cookie
	stateCookie, err := r.Cookie("github_oauth_state")
	if err != nil {
		http.Error(w, `{"error":"missing state cookie"}`, http.StatusBadRequest)
		return
	}

	// Decode state data: <randomState>:<orgID>
	stateDataBytes, err := base64.URLEncoding.DecodeString(stateCookie.Value)
	if err != nil {
		http.Error(w, `{"error":"invalid state cookie"}`, http.StatusBadRequest)
		return
	}

	stateData := string(stateDataBytes)
	var expectedState, orgIDStr string
	if idx := strings.Index(stateData, ":"); idx > 0 && idx < len(stateData)-1 {
		expectedState = stateData[:idx]
		orgIDStr = stateData[idx+1:]
	}
	if expectedState == "" || orgIDStr == "" {
		http.Error(w, `{"error":"invalid state format"}`, http.StatusBadRequest)
		return
	}

	state := r.URL.Query().Get("state")
	if state != expectedState {
		http.Error(w, `{"error":"state mismatch"}`, http.StatusBadRequest)
		return
	}

	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid org in state"}`, http.StatusBadRequest)
		return
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "github_oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	if errParam := r.URL.Query().Get("error"); errParam != "" {
		http.Error(w, fmt.Sprintf(`{"error":"oauth error: %s"}`, errParam), http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"error":"missing authorization code"}`, http.StatusBadRequest)
		return
	}

	// Check if the user is logged in via ace_token cookie or Authorization header
	var userID interface{}
	var userOK bool

	// Try ace_token cookie first
	if tokenCookie, cookieErr := r.Cookie("ace_token"); cookieErr == nil {
		claims, verifyErr := h.jwtManager.VerifyAccessToken(tokenCookie.Value)
		if verifyErr == nil {
			userID = claims.UserID
			userOK = true
		}
	}

	// Try Authorization header
	if !userOK {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, verifyErr := h.jwtManager.VerifyAccessToken(tokenStr)
			if verifyErr == nil {
				userID = claims.UserID
				userOK = true
			}
		}
	}

	// Try state-embedded token from query param (frontend may pass it)
	if !userOK {
		if tokenParam := r.URL.Query().Get("token"); tokenParam != "" {
			claims, verifyErr := h.jwtManager.VerifyAccessToken(tokenParam)
			if verifyErr == nil {
				userID = claims.UserID
				userOK = true
			}
		}
	}

	if !userOK {
		http.Error(w, `{"error":"not logged in — GitHub connection requires an active session"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Look up org-specific credentials
	clientID, clientSecret, err := h.getOAuthConfig(ctx, orgID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	// Exchange code for access token
	ghToken, scopes, err := h.exchangeCode(ctx, code, clientID, clientSecret)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to exchange code: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Fetch GitHub user info
	ghUser, err := h.fetchGitHubUser(ctx, ghToken)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch GitHub user info"}`, http.StatusInternalServerError)
		return
	}

	// Encrypt the access token before storing
	encryptedToken, err := encryptToken(ghToken)
	if err != nil {
		http.Error(w, `{"error":"failed to encrypt token"}`, http.StatusInternalServerError)
		return
	}

	// Upsert the connection
	_, err = h.pool.Exec(ctx,
		`INSERT INTO user_github_connections (user_id, github_user_id, github_username, github_email, access_token, scopes, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		 ON CONFLICT (user_id) DO UPDATE
		 SET github_user_id = $2, github_username = $3, github_email = $4, access_token = $5, scopes = $6, updated_at = NOW()`,
		userID, fmt.Sprintf("%d", ghUser.ID), ghUser.Login, ghUser.Email, encryptedToken, scopes,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save GitHub connection"}`, http.StatusInternalServerError)
		return
	}

	// Redirect to frontend settings page
	redirectURL := frontendURL + "/app/settings/user?github=connected"
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
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
	ghToken, err := decryptToken(encryptedToken)
	if err != nil {
		http.Error(w, `{"error":"failed to decrypt token"}`, http.StatusInternalServerError)
		return
	}

	// Fetch Copilot session token
	copilotToken, err := h.fetchCopilotToken(ctx, ghToken)
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
	systemPrompt := defaultSystemPrompt
	if prompt, ok := copilotSystemPrompts[req.DatasourceType]; ok {
		systemPrompt = prompt
	}

	messages := make([]chatMessage, 0, len(req.Messages)+1)
	messages = append(messages, chatMessage{Role: "system", Content: systemPrompt})
	messages = append(messages, req.Messages...)

	// Forward to Copilot API
	body := map[string]interface{}{
		"model":    "gpt-4o",
		"stream":   true,
		"messages": messages,
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		http.Error(w, `{"error":"failed to build request"}`, http.StatusInternalServerError)
		return
	}

	copilotReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.githubcopilot.com/chat/completions", strings.NewReader(string(bodyJSON)))
	if err != nil {
		http.Error(w, `{"error":"failed to create request"}`, http.StatusInternalServerError)
		return
	}

	copilotReq.Header.Set("Authorization", "Bearer "+copilotToken)
	copilotReq.Header.Set("Content-Type", "application/json")
	copilotReq.Header.Set("Editor-Version", "Ace/1.0.0")
	copilotReq.Header.Set("Editor-Plugin-Version", "ace-copilot/1.0.0")
	copilotReq.Header.Set("Copilot-Integration-Id", "ace-observability")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(copilotReq)
	if err != nil {
		http.Error(w, `{"error":"failed to reach Copilot API"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		statusCode := http.StatusBadGateway
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			statusCode = resp.StatusCode
		}
		http.Error(w, fmt.Sprintf(`{"error":"Copilot API error (%d): %s"}`, resp.StatusCode, string(respBody)), statusCode)
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

// exchangeCode exchanges an authorization code for a GitHub access token.
func (h *GitHubCopilotHandler) exchangeCode(ctx context.Context, code, clientID, clientSecret string) (string, string, error) {
	body := fmt.Sprintf("client_id=%s&client_secret=%s&code=%s", clientID, clientSecret, code)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://github.com/login/oauth/access_token", strings.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var tokenResp gitHubTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", "", fmt.Errorf("failed to decode token response")
	}

	if tokenResp.Error != "" {
		return "", "", fmt.Errorf("%s: %s", tokenResp.Error, tokenResp.ErrorDesc)
	}

	return tokenResp.AccessToken, tokenResp.Scope, nil
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

// fetchCopilotToken gets a short-lived Copilot session token.
func (h *GitHubCopilotHandler) fetchCopilotToken(ctx context.Context, ghToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/copilot_internal/v2/token", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "token "+ghToken)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Copilot token request failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp copilotTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode Copilot token response")
	}

	if tokenResp.Token == "" {
		return "", fmt.Errorf("empty Copilot token returned")
	}

	return tokenResp.Token, nil
}
