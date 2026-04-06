package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/aceobservability/ace/backend/internal/audit"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/models"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

// OktaSSOHandler handles Okta OIDC-based SSO authentication.
type OktaSSOHandler struct {
	pool                *pgxpool.Pool
	jwtManager          *auth.JWTManager
	refreshTokenManager *auth.RefreshTokenManager
	auditLogger         *audit.Logger
	baseURL             string
}

// NewOktaSSOHandler creates an OktaSSOHandler.
func NewOktaSSOHandler(pool *pgxpool.Pool, jwtManager *auth.JWTManager, rdb *redis.Client, auditLogger *audit.Logger) *OktaSSOHandler {
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	var rtm *auth.RefreshTokenManager
	if rdb != nil {
		rtm = auth.NewRefreshTokenManager(rdb)
	}
	return &OktaSSOHandler{
		pool:                pool,
		jwtManager:          jwtManager,
		refreshTokenManager: rtm,
		auditLogger:         auditLogger,
		baseURL:             baseURL,
	}
}

// OktaSSOConfigRequest represents the request body for configuring Okta SSO.
type OktaSSOConfigRequest struct {
	ClientID        string `json:"client_id"`
	ClientSecret    string `json:"client_secret"`
	TenantID        string `json:"tenant_id"` // Okta domain (e.g. "dev-12345.okta.com")
	GroupsClaimName string `json:"groups_claim_name"`
	DefaultRole     string `json:"default_role"`
	Enabled         *bool  `json:"enabled,omitempty"`
}

// OktaSSOConfigResponse represents the response for Okta SSO config.
type OktaSSOConfigResponse struct {
	TenantID        string    `json:"tenant_id"`
	ClientID        string    `json:"client_id"`
	GroupsClaimName string    `json:"groups_claim_name"`
	DefaultRole     string    `json:"default_role"`
	Enabled         bool      `json:"enabled"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// oktaSSOConfig holds the DB fields needed to build an OAuth2 config.
type oktaSSOConfig struct {
	id              uuid.UUID
	orgID           uuid.UUID
	clientID        string
	clientSecret    string
	tenantID        string
	enabled         bool
	groupsClaimName string
	defaultRole     string
}

// getOktaConfig loads the Okta SSO configuration for the given org slug.
func (h *OktaSSOHandler) getOktaConfig(ctx context.Context, orgSlug string) (*oktaSSOConfig, error) {
	var orgID uuid.UUID
	err := h.pool.QueryRow(ctx, `SELECT id FROM organizations WHERE slug = $1`, orgSlug).Scan(&orgID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("organization not found")
		}
		return nil, err
	}

	var cfg oktaSSOConfig
	var tenantID *string
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role
		 FROM sso_configs WHERE organization_id = $1 AND provider = 'okta'`,
		orgID,
	).Scan(&cfg.id, &cfg.orgID, &cfg.clientID, &cfg.clientSecret, &tenantID, &cfg.enabled, &cfg.groupsClaimName, &cfg.defaultRole)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("okta SSO not configured for this organization")
		}
		return nil, err
	}

	if !cfg.enabled {
		return nil, fmt.Errorf("okta SSO is not enabled for this organization")
	}

	if tenantID == nil || *tenantID == "" {
		return nil, fmt.Errorf("okta SSO domain not configured")
	}
	cfg.tenantID = *tenantID
	cfg.orgID = orgID

	return &cfg, nil
}

// buildOAuth2Config creates an OAuth2 config from the Okta SSO configuration.
func (h *OktaSSOHandler) buildOAuth2Config(cfg *oktaSSOConfig) *oauth2.Config {
	domain := cfg.tenantID
	return &oauth2.Config{
		ClientID:     cfg.clientID,
		ClientSecret: cfg.clientSecret,
		RedirectURL:  h.baseURL + "/api/auth/okta/callback",
		Scopes:       []string{"openid", "email", "profile", "groups"},
		Endpoint: oauth2.Endpoint{
			AuthURL:  fmt.Sprintf("https://%s/oauth2/v1/authorize", domain),
			TokenURL: fmt.Sprintf("https://%s/oauth2/v1/token", domain),
		},
	}
}

// Login initiates the Okta OAuth/OIDC flow.
func (h *OktaSSOHandler) Login(w http.ResponseWriter, r *http.Request) {
	orgSlug := r.URL.Query().Get("org")
	if orgSlug == "" {
		http.Error(w, `{"error":"org parameter is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cfg, err := h.getOktaConfig(ctx, orgSlug)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	state, err := generateOktaState()
	if err != nil {
		http.Error(w, `{"error":"failed to generate state"}`, http.StatusInternalServerError)
		return
	}

	// Store state with org slug in cookie (short-lived)
	stateData := fmt.Sprintf("%s:%s", state, orgSlug)
	http.SetCookie(w, &http.Cookie{
		Name:     "okta_oauth_state",
		Value:    base64.URLEncoding.EncodeToString([]byte(stateData)),
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	oauthConfig := h.buildOAuth2Config(cfg)
	url := oauthConfig.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// generateOktaState creates a cryptographically secure state parameter.
func generateOktaState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// Callback handles the Okta OAuth/OIDC callback.
func (h *OktaSSOHandler) Callback(w http.ResponseWriter, r *http.Request) {
	// Get state cookie
	stateCookie, err := r.Cookie("okta_oauth_state")
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
	parts := strings.SplitN(stateData, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		http.Error(w, `{"error":"invalid state format"}`, http.StatusBadRequest)
		return
	}
	expectedState := parts[0]
	orgSlug := parts[1]

	// Verify state
	state := r.URL.Query().Get("state")
	if state != expectedState {
		http.Error(w, `{"error":"state mismatch"}`, http.StatusBadRequest)
		return
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "okta_oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	// Check for errors from Okta
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

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	// Get SSO config
	cfg, err := h.getOktaConfig(ctx, orgSlug)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Exchange code for tokens
	oauthConfig := h.buildOAuth2Config(cfg)
	token, err := oauthConfig.Exchange(ctx, code)
	if err != nil {
		http.Error(w, `{"error":"failed to exchange code for token"}`, http.StatusInternalServerError)
		return
	}

	// Extract the raw ID token from the OAuth2 token
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		http.Error(w, `{"error":"no id_token in token response"}`, http.StatusInternalServerError)
		return
	}

	// Verify ID token using go-oidc
	issuerURL := fmt.Sprintf("https://%s", cfg.tenantID)
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		http.Error(w, `{"error":"failed to create OIDC provider"}`, http.StatusInternalServerError)
		return
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.clientID})
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		http.Error(w, `{"error":"failed to verify ID token"}`, http.StatusUnauthorized)
		return
	}

	// Extract claims from the ID token
	var rawClaims map[string]json.RawMessage
	if err := idToken.Claims(&rawClaims); err != nil {
		http.Error(w, `{"error":"failed to parse ID token claims"}`, http.StatusInternalServerError)
		return
	}

	// Extract standard claims
	var email, name string
	if emailRaw, ok := rawClaims["email"]; ok {
		json.Unmarshal(emailRaw, &email)
	}
	if nameRaw, ok := rawClaims["name"]; ok {
		json.Unmarshal(nameRaw, &name)
	}

	if email == "" {
		http.Error(w, `{"error":"no email found in ID token"}`, http.StatusBadRequest)
		return
	}

	// Extract groups from the configurable claim name
	var userGroups []string
	groupsClaim := cfg.groupsClaimName
	if groupsClaim == "" {
		groupsClaim = "groups"
	}
	if groupsRaw, ok := rawClaims[groupsClaim]; ok {
		json.Unmarshal(groupsRaw, &userGroups)
	}

	// Resolve role from mappings
	var mappings []models.SSOConfigRoleMapping
	rows, err := h.pool.Query(ctx,
		`SELECT id, organization_id, sso_config_id, sso_group_name, ace_role, created_at
		 FROM sso_role_mappings
		 WHERE sso_config_id = $1`,
		cfg.id,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to query role mappings"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var m models.SSOConfigRoleMapping
		if err := rows.Scan(&m.ID, &m.OrganizationID, &m.SSOConfigID, &m.SSOGroupName, &m.AceRole, &m.CreatedAt); err != nil {
			http.Error(w, `{"error":"failed to scan role mapping"}`, http.StatusInternalServerError)
			return
		}
		mappings = append(mappings, m)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"failed to iterate role mappings"}`, http.StatusInternalServerError)
		return
	}

	defaultRole := cfg.defaultRole
	if defaultRole == "" {
		defaultRole = "viewer"
	}
	resolvedRole := ResolveRoleFromMappings(userGroups, mappings, defaultRole)

	// Find or create user
	var userID uuid.UUID
	var userEmail string
	var userName *string

	err = h.pool.QueryRow(ctx,
		`SELECT id, email, name FROM users WHERE email = $1`,
		email,
	).Scan(&userID, &userEmail, &userName)

	if err == pgx.ErrNoRows {
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

	// Upsert organization membership with role_source awareness
	var existingRole, existingRoleSource string
	err = h.pool.QueryRow(ctx,
		`SELECT role, role_source FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, cfg.orgID,
	).Scan(&existingRole, &existingRoleSource)

	if err == pgx.ErrNoRows {
		// New membership: insert with role_source = 'sso'
		_, err = h.pool.Exec(ctx,
			`INSERT INTO organization_memberships (user_id, organization_id, role, role_source) VALUES ($1, $2, $3, 'sso')`,
			userID, cfg.orgID, resolvedRole,
		)
		if err != nil {
			http.Error(w, `{"error":"failed to add user to organization"}`, http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return
	} else if existingRoleSource == "sso" {
		// SSO-managed membership: update the role
		_, err = h.pool.Exec(ctx,
			`UPDATE organization_memberships SET role = $1, updated_at = NOW() WHERE user_id = $2 AND organization_id = $3`,
			resolvedRole, userID, cfg.orgID,
		)
		if err != nil {
			http.Error(w, `{"error":"failed to update membership role"}`, http.StatusInternalServerError)
			return
		}
	}
	// If role_source = 'manual', do NOT update — preserve manual override

	// Add or update user auth method
	_, err = h.pool.Exec(ctx,
		`INSERT INTO user_auth_methods (user_id, provider, provider_user_id)
		 VALUES ($1, 'okta', $2)
		 ON CONFLICT (user_id, provider) DO UPDATE SET provider_user_id = $2, updated_at = NOW()`,
		userID, idToken.Subject,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to link okta account"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	if h.auditLogger != nil {
		h.auditLogger.Log(ctx, cfg.orgID, "sso.okta.login", "user", &userID, email, "success")
	}

	// Generate JWT access token
	displayName := ""
	if userName != nil {
		displayName = *userName
	}
	accessToken, err := h.jwtManager.GenerateAccessToken(userID, userEmail, displayName)
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
		if err := h.refreshTokenManager.StoreRefreshToken(ctx, refreshToken, userID, userEmail, displayName); err != nil {
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

// ConfigureSSO creates or updates Okta SSO configuration for an organization.
func (h *OktaSSOHandler) ConfigureSSO(w http.ResponseWriter, r *http.Request) {
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

	var req OktaSSOConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.ClientID == "" || req.ClientSecret == "" || req.TenantID == "" {
		http.Error(w, `{"error":"client_id, client_secret and tenant_id (okta domain) are required"}`, http.StatusBadRequest)
		return
	}

	// Validate tenant_id looks like a hostname
	if !isValidHostname(req.TenantID) {
		http.Error(w, `{"error":"tenant_id must be a valid hostname (e.g. dev-12345.okta.com)"}`, http.StatusBadRequest)
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	groupsClaimName := req.GroupsClaimName
	if groupsClaimName == "" {
		groupsClaimName = "groups"
	}

	defaultRole := req.DefaultRole
	if defaultRole == "" {
		defaultRole = "viewer"
	}

	validRoles := map[string]bool{"admin": true, "editor": true, "viewer": true, "auditor": true}
	if req.DefaultRole != "" && !validRoles[req.DefaultRole] {
		http.Error(w, `{"error":"invalid default_role, must be one of: admin, editor, viewer, auditor"}`, http.StatusBadRequest)
		return
	}

	// Upsert SSO config
	var config OktaSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role)
		 VALUES ($1, 'okta', $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (organization_id, provider) DO UPDATE
		 SET client_id = $2, client_secret = $3, tenant_id = $4, enabled = $5, groups_claim_name = $6, default_role = $7, updated_at = NOW()
		 RETURNING tenant_id, client_id, groups_claim_name, default_role, enabled, created_at, updated_at`,
		orgID, req.ClientID, req.ClientSecret, req.TenantID, enabled, groupsClaimName, defaultRole,
	).Scan(&config.TenantID, &config.ClientID, &config.GroupsClaimName, &config.DefaultRole, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to save SSO config"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	if h.auditLogger != nil {
		h.auditLogger.Log(ctx, orgID, "sso.okta.configure", "sso_config", nil, "", "success")
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// GetSSOConfig returns the Okta SSO configuration for an organization.
func (h *OktaSSOHandler) GetSSOConfig(w http.ResponseWriter, r *http.Request) {
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

	// Get SSO config
	var config OktaSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`SELECT tenant_id, client_id, groups_claim_name, default_role, enabled, created_at, updated_at
		 FROM sso_configs WHERE organization_id = $1 AND provider = 'okta'`,
		orgID,
	).Scan(&config.TenantID, &config.ClientID, &config.GroupsClaimName, &config.DefaultRole, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err == pgx.ErrNoRows {
		// Return empty/null response (not 404)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("null"))
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get SSO config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// TestConnection tests the Okta OIDC discovery for the configured domain.
func (h *OktaSSOHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
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

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
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
	var domain string
	err = h.pool.QueryRow(ctx,
		`SELECT tenant_id FROM sso_configs WHERE organization_id = $1 AND provider = 'okta'`,
		orgID,
	).Scan(&domain)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"okta SSO not configured"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get SSO config"}`, http.StatusInternalServerError)
		return
	}

	// Attempt OIDC discovery
	issuerURL := fmt.Sprintf("https://%s", domain)
	_, err = oidc.NewProvider(ctx, issuerURL)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": fmt.Sprintf("Could not reach %s: %s", domain, err.Error()),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "connected",
		"message": "OIDC discovery verified",
	})
}

// isValidHostname performs a basic validation that the string looks like a hostname.
func isValidHostname(s string) bool {
	if s == "" || len(s) > 253 {
		return false
	}
	// Must contain at least one dot (e.g. dev-12345.okta.com)
	if !strings.Contains(s, ".") {
		return false
	}
	// Must not contain spaces or protocol prefixes
	if strings.Contains(s, " ") || strings.Contains(s, "://") {
		return false
	}
	return true
}
