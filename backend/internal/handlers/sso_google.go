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
	"golang.org/x/oauth2/google"
)

const (
	googleUserInfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"
)

type GoogleSSOHandler struct {
	pool                *pgxpool.Pool
	jwtManager          *auth.JWTManager
	refreshTokenManager *auth.RefreshTokenManager
	baseURL             string
}

func NewGoogleSSOHandler(pool *pgxpool.Pool, jwtManager *auth.JWTManager, rdb *redis.Client) *GoogleSSOHandler {
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	var rtm *auth.RefreshTokenManager
	if rdb != nil {
		rtm = auth.NewRefreshTokenManager(rdb)
	}
	return &GoogleSSOHandler{
		pool:                pool,
		jwtManager:          jwtManager,
		refreshTokenManager: rtm,
		baseURL:             baseURL,
	}
}

// GoogleUserInfo represents the user info returned by Google
type GoogleUserInfo struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// GoogleSSOConfigRequest represents the request body for configuring Google SSO
type GoogleSSOConfigRequest struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Enabled      *bool  `json:"enabled,omitempty"`
}

// GoogleSSOConfigResponse represents the response for Google SSO config
type GoogleSSOConfigResponse struct {
	ClientID  string    `json:"client_id"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// generateState creates a cryptographically secure state parameter
func generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// getOAuthConfig creates an OAuth2 config for the given org
func (h *GoogleSSOHandler) getOAuthConfig(ctx context.Context, orgSlug string) (*oauth2.Config, error) {
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
	var enabled bool
	err = h.pool.QueryRow(ctx,
		`SELECT client_id, client_secret, enabled FROM sso_configs
		 WHERE organization_id = $1 AND provider = 'google'`,
		orgID,
	).Scan(&clientID, &clientSecret, &enabled)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("google SSO not configured for this organization")
		}
		return nil, err
	}

	if !enabled {
		return nil, fmt.Errorf("google SSO is not enabled for this organization")
	}

	return &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  h.baseURL + "/api/auth/google/callback",
		Scopes:       []string{"email", "profile"},
		Endpoint:     google.Endpoint,
	}, nil
}

// Login initiates the Google OAuth flow
func (h *GoogleSSOHandler) Login(w http.ResponseWriter, r *http.Request) {
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

	state, err := generateState()
	if err != nil {
		http.Error(w, `{"error":"failed to generate state"}`, http.StatusInternalServerError)
		return
	}

	// Store state with org slug in cookie (short-lived)
	stateData := fmt.Sprintf("%s:%s", state, orgSlug)
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    base64.URLEncoding.EncodeToString([]byte(stateData)),
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect to Google
	url := config.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// Callback handles the Google OAuth callback
func (h *GoogleSSOHandler) Callback(w http.ResponseWriter, r *http.Request) {
	// Get state cookie
	stateCookie, err := r.Cookie("oauth_state")
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
		Name:     "oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	// Check for errors from Google
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "oauth error: " + errParam})
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

	// Get user info from Google
	client := config.Client(ctx, token)
	resp, err := client.Get(googleUserInfoURL)
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

	var userInfo GoogleUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		http.Error(w, `{"error":"failed to parse user info"}`, http.StatusInternalServerError)
		return
	}

	if !userInfo.VerifiedEmail {
		http.Error(w, `{"error":"email not verified"}`, http.StatusBadRequest)
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
		userInfo.Email,
	).Scan(&userID, &userEmail, &userName)

	if err == pgx.ErrNoRows {
		// Create new user
		name := userInfo.Name
		err = h.pool.QueryRow(ctx,
			`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name`,
			userInfo.Email, &name,
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
		 VALUES ($1, 'google', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET provider_user_id = $2, updated_at = NOW()`,
		userID, userInfo.ID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to link google account"}`, http.StatusInternalServerError)
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

// ConfigureSSO creates or updates Google SSO configuration for an organization
func (h *GoogleSSOHandler) ConfigureSSO(w http.ResponseWriter, r *http.Request) {
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

	var req GoogleSSOConfigRequest
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

	// Upsert SSO config
	var config GoogleSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, enabled)
		 VALUES ($1, 'google', $2, $3, $4)
		 ON CONFLICT (organization_id, provider) DO UPDATE
		 SET client_id = $2, client_secret = $3, enabled = $4, updated_at = NOW()
		 RETURNING client_id, enabled, created_at, updated_at`,
		orgID, req.ClientID, req.ClientSecret, enabled,
	).Scan(&config.ClientID, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to save SSO config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// GetSSOConfig returns the Google SSO configuration for an organization
func (h *GoogleSSOHandler) GetSSOConfig(w http.ResponseWriter, r *http.Request) {
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
	var config GoogleSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`SELECT client_id, enabled, created_at, updated_at FROM sso_configs
		 WHERE organization_id = $1 AND provider = 'google'`,
		orgID,
	).Scan(&config.ClientID, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"google SSO not configured"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get SSO config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}
