package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

const (
	microsoftGraphUserURL = "https://graph.microsoft.com/v1.0/me"
)

type MicrosoftSSOHandler struct {
	pool                *pgxpool.Pool
	jwtManager          *auth.JWTManager
	refreshTokenManager *auth.RefreshTokenManager
	baseURL             string
}

func NewMicrosoftSSOHandler(pool *pgxpool.Pool, jwtManager *auth.JWTManager, rdb *redis.Client) *MicrosoftSSOHandler {
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	var rtm *auth.RefreshTokenManager
	if rdb != nil {
		rtm = auth.NewRefreshTokenManager(rdb)
	}
	return &MicrosoftSSOHandler{
		pool:                pool,
		jwtManager:          jwtManager,
		refreshTokenManager: rtm,
		baseURL:             baseURL,
	}
}

// MicrosoftUserInfo represents the user info returned by Microsoft Graph
type MicrosoftUserInfo struct {
	ID                string `json:"id"`
	DisplayName       string `json:"displayName"`
	Mail              string `json:"mail"`
	UserPrincipalName string `json:"userPrincipalName"`
}

// MicrosoftSSOConfigRequest represents the request body for configuring Microsoft SSO
type MicrosoftSSOConfigRequest struct {
	TenantID     string `json:"tenant_id"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Enabled      *bool  `json:"enabled,omitempty"`
}

// MicrosoftSSOConfigResponse represents the response for Microsoft SSO config
type MicrosoftSSOConfigResponse struct {
	TenantID  string    `json:"tenant_id"`
	ClientID  string    `json:"client_id"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// getMicrosoftEndpoint returns the Microsoft OAuth2 endpoint for the given tenant
func getMicrosoftEndpoint(tenantID string) oauth2.Endpoint {
	return oauth2.Endpoint{
		AuthURL:  fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize", tenantID),
		TokenURL: fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", tenantID),
	}
}

// getOAuthConfig creates an OAuth2 config for the given org
func (h *MicrosoftSSOHandler) getOAuthConfig(ctx context.Context, orgSlug string) (*oauth2.Config, error) {
	// Get organization by slug
	var orgID uuid.UUID
	err := h.pool.QueryRow(ctx, `SELECT id FROM organizations WHERE slug = $1`, orgSlug).Scan(&orgID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("organization not found")
		}
		return nil, err
	}

	// Get SSO config for organization
	var clientID, clientSecret string
	var tenantID *string
	var enabled bool
	err = h.pool.QueryRow(ctx,
		`SELECT client_id, client_secret, tenant_id, enabled FROM sso_configs
		 WHERE organization_id = $1 AND provider = 'microsoft'`,
		orgID,
	).Scan(&clientID, &clientSecret, &tenantID, &enabled)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("microsoft SSO not configured for this organization")
		}
		return nil, err
	}

	if !enabled {
		return nil, fmt.Errorf("microsoft SSO is not enabled for this organization")
	}

	if tenantID == nil || *tenantID == "" {
		return nil, fmt.Errorf("microsoft SSO tenant_id not configured")
	}

	return &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  h.baseURL + "/api/auth/microsoft/callback",
		Scopes:       []string{"openid", "email", "profile", "User.Read"},
		Endpoint:     getMicrosoftEndpoint(*tenantID),
	}, nil
}

// Login initiates the Microsoft OAuth flow
func (h *MicrosoftSSOHandler) Login(w http.ResponseWriter, r *http.Request) {
	orgSlug := r.URL.Query().Get("org")
	if orgSlug == "" {
		http.Error(w, `{"error":"org parameter is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	config, err := h.getOAuthConfig(ctx, orgSlug)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	state, err := generateMicrosoftState()
	if err != nil {
		http.Error(w, `{"error":"failed to generate state"}`, http.StatusInternalServerError)
		return
	}

	// Store state with org slug in cookie (short-lived)
	stateData := fmt.Sprintf("%s:%s", state, orgSlug)
	http.SetCookie(w, &http.Cookie{
		Name:     "ms_oauth_state",
		Value:    base64.URLEncoding.EncodeToString([]byte(stateData)),
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect to Microsoft
	url := config.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// generateMicrosoftState creates a cryptographically secure state parameter
func generateMicrosoftState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// Callback handles the Microsoft OAuth callback
func (h *MicrosoftSSOHandler) Callback(w http.ResponseWriter, r *http.Request) {
	// Get state cookie
	stateCookie, err := r.Cookie("ms_oauth_state")
	if err != nil {
		http.Error(w, `{"error":"missing state cookie"}`, http.StatusBadRequest)
		return
	}

	// Decode state data
	stateDataBytes, err := base64.URLEncoding.DecodeString(stateCookie.Value)
	if err != nil {
		http.Error(w, `{"error":"invalid state cookie"}`, http.StatusBadRequest)
		return
	}

	// Parse state:orgSlug
	stateData := string(stateDataBytes)
	var expectedState, orgSlug string
	_, err = fmt.Sscanf(stateData, "%[^:]:%s", &expectedState, &orgSlug)
	if err != nil || expectedState == "" || orgSlug == "" {
		http.Error(w, `{"error":"invalid state format"}`, http.StatusBadRequest)
		return
	}

	// Verify state
	state := r.URL.Query().Get("state")
	if state != expectedState {
		http.Error(w, `{"error":"state mismatch"}`, http.StatusBadRequest)
		return
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "ms_oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	// Check for errors from Microsoft
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		errDesc := r.URL.Query().Get("error_description")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "oauth error: " + errParam + " - " + errDesc})
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"error":"missing authorization code"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Get OAuth config
	config, err := h.getOAuthConfig(ctx, orgSlug)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Exchange code for token
	token, err := config.Exchange(ctx, code)
	if err != nil {
		http.Error(w, `{"error":"failed to exchange code for token"}`, http.StatusInternalServerError)
		return
	}

	// Get user info from Microsoft Graph
	client := config.Client(ctx, token)
	resp, err := client.Get(microsoftGraphUserURL)
	if err != nil {
		http.Error(w, `{"error":"failed to get user info"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read user info"}`, http.StatusInternalServerError)
		return
	}

	var userInfo MicrosoftUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		http.Error(w, `{"error":"failed to parse user info"}`, http.StatusInternalServerError)
		return
	}

	// Get email - prefer mail, fallback to userPrincipalName
	email := userInfo.Mail
	if email == "" {
		email = userInfo.UserPrincipalName
	}
	if email == "" {
		http.Error(w, `{"error":"no email found in user info"}`, http.StatusBadRequest)
		return
	}

	// Get organization ID
	var orgID uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT id FROM organizations WHERE slug = $1`, orgSlug).Scan(&orgID)
	if err != nil {
		http.Error(w, `{"error":"organization not found"}`, http.StatusNotFound)
		return
	}

	// Find or create user
	var userID uuid.UUID
	var userEmail string
	var userName *string

	// Check if user exists by email
	err = h.pool.QueryRow(ctx,
		`SELECT id, email, name FROM users WHERE email = $1`,
		email,
	).Scan(&userID, &userEmail, &userName)

	if err == pgx.ErrNoRows {
		// Create new user
		name := userInfo.DisplayName
		err = h.pool.QueryRow(ctx,
			`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name`,
			email, &name,
		).Scan(&userID, &userEmail, &userName)
		if err != nil {
			http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		http.Error(w, `{"error":"failed to check user"}`, http.StatusInternalServerError)
		return
	}

	// Check if user is member of organization, if not add them
	var membershipExists bool
	err = h.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM organization_memberships WHERE user_id = $1 AND organization_id = $2)`,
		userID, orgID,
	).Scan(&membershipExists)
	if err != nil {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return
	}

	if !membershipExists {
		// Add user as viewer to organization
		_, err = h.pool.Exec(ctx,
			`INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ($1, $2, 'viewer')`,
			userID, orgID,
		)
		if err != nil {
			http.Error(w, `{"error":"failed to add user to organization"}`, http.StatusInternalServerError)
			return
		}
	}

	// Add or update user auth method
	_, err = h.pool.Exec(ctx,
		`INSERT INTO user_auth_methods (user_id, provider, provider_user_id)
		 VALUES ($1, 'microsoft', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET provider_user_id = $2, updated_at = NOW()`,
		userID, userInfo.ID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to link microsoft account"}`, http.StatusInternalServerError)
		return
	}

	// Generate JWT access token
	name := ""
	if userName != nil {
		name = *userName
	}
	accessToken, err := h.jwtManager.GenerateAccessToken(userID, userEmail, name)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	// Generate refresh token if manager is available
	var refreshToken string
	if h.refreshTokenManager != nil {
		refreshToken, err = auth.GenerateRefreshToken()
		if err != nil {
			http.Error(w, `{"error":"failed to generate refresh token"}`, http.StatusInternalServerError)
			return
		}
		if err := h.refreshTokenManager.StoreRefreshToken(ctx, refreshToken, userID, userEmail, name); err != nil {
			http.Error(w, `{"error":"failed to store refresh token"}`, http.StatusInternalServerError)
			return
		}
	}

	// Redirect to frontend with tokens in hash fragment
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}

	redirectURL := fmt.Sprintf("%s/auth/callback#access_token=%s&token_type=Bearer", frontendURL, url.QueryEscape(accessToken))
	if refreshToken != "" {
		redirectURL += "&refresh_token=" + url.QueryEscape(refreshToken)
	}
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// ConfigureSSO creates or updates Microsoft SSO configuration for an organization
func (h *MicrosoftSSOHandler) ConfigureSSO(w http.ResponseWriter, r *http.Request) {
	// Get org ID from path
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	// Get current user from context
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

	var req MicrosoftSSOConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.TenantID == "" || req.ClientID == "" || req.ClientSecret == "" {
		http.Error(w, `{"error":"tenant_id, client_id and client_secret are required"}`, http.StatusBadRequest)
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	// Upsert SSO config
	var config MicrosoftSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled)
		 VALUES ($1, 'microsoft', $2, $3, $4, $5)
		 ON CONFLICT (organization_id, provider) DO UPDATE
		 SET client_id = $2, client_secret = $3, tenant_id = $4, enabled = $5, updated_at = NOW()
		 RETURNING tenant_id, client_id, enabled, created_at, updated_at`,
		orgID, req.ClientID, req.ClientSecret, req.TenantID, enabled,
	).Scan(&config.TenantID, &config.ClientID, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to save SSO config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// GetSSOConfig returns the Microsoft SSO configuration for an organization
func (h *MicrosoftSSOHandler) GetSSOConfig(w http.ResponseWriter, r *http.Request) {
	// Get org ID from path
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	// Get current user from context
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

	// Get SSO config
	var config MicrosoftSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`SELECT tenant_id, client_id, enabled, created_at, updated_at FROM sso_configs
		 WHERE organization_id = $1 AND provider = 'microsoft'`,
		orgID,
	).Scan(&config.TenantID, &config.ClientID, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"microsoft SSO not configured"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get SSO config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}
