package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/crypto"
	"go.uber.org/zap"
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
		zap.L().Warn("copilot token check failed", zap.Error(copilotErr))
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
