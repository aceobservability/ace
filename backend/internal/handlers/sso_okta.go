package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/aceobservability/ace/backend/internal/audit"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/sso"
)

const oktaStateCookie = "okta_oauth_state"

// OktaSSOHandler handles Okta OIDC-based SSO authentication.
type OktaSSOHandler struct {
	pool                *pgxpool.Pool
	jwtManager          *auth.JWTManager
	refreshTokenManager *auth.RefreshTokenManager
	auditLogger         *audit.Logger
	login               *sso.Module
	baseURL             string
}

// NewOktaSSOHandler creates an OktaSSOHandler.
func NewOktaSSOHandler(pool *pgxpool.Pool, jwtManager *auth.JWTManager, rdb *redis.Client, auditLogger *audit.Logger, login *sso.Module) *OktaSSOHandler {
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
		login:               login,
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

// Login initiates the Okta OAuth/OIDC flow.
func (h *OktaSSOHandler) Login(w http.ResponseWriter, r *http.Request) {
	orgSlug := r.URL.Query().Get("org")
	if orgSlug == "" {
		http.Error(w, `{"error":"org parameter is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	started, err := h.login.Start(ctx, h.pool, sso.StartRequest{
		Provider:    sso.ProviderOkta,
		OrgSlug:     orgSlug,
		RedirectURL: h.baseURL + "/api/auth/okta/callback",
	})
	if err != nil {
		writeSSOStartError(w, err)
		return
	}

	stateData := fmt.Sprintf("%s:%s", started.State, orgSlug)
	http.SetCookie(w, ssoStateCookie(oktaStateCookie, base64.URLEncoding.EncodeToString([]byte(stateData)), 300))
	http.Redirect(w, r, started.AuthURL, http.StatusTemporaryRedirect)
}

// Callback handles the Okta OAuth/OIDC callback.
func (h *OktaSSOHandler) Callback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie(oktaStateCookie)
	if err != nil {
		http.Error(w, `{"error":"missing state cookie"}`, http.StatusBadRequest)
		return
	}

	stateDataBytes, err := base64.URLEncoding.DecodeString(stateCookie.Value)
	if err != nil {
		http.Error(w, `{"error":"invalid state cookie"}`, http.StatusBadRequest)
		return
	}

	stateData := string(stateDataBytes)
	parts := strings.SplitN(stateData, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		http.Error(w, `{"error":"invalid state format"}`, http.StatusBadRequest)
		return
	}
	expectedState := parts[0]
	orgSlug := parts[1]

	state := r.URL.Query().Get("state")
	if state != expectedState {
		http.Error(w, `{"error":"state mismatch"}`, http.StatusBadRequest)
		return
	}

	http.SetCookie(w, ssoStateCookie(oktaStateCookie, "", -1))

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

	result, err := h.login.Finish(ctx, h.pool, sso.FinishRequest{
		Provider:    sso.ProviderOkta,
		OrgSlug:     orgSlug,
		RedirectURL: h.baseURL + "/api/auth/okta/callback",
		Code:        code,
	})
	if err != nil {
		writeSSOFinishError(w, err)
		return
	}

	if h.auditLogger != nil {
		h.auditLogger.Log(ctx, result.OrgID, "sso.okta.login", "user", &result.UserID, result.Email, "success")
	}

	accessToken, err := h.jwtManager.GenerateAccessToken(result.UserID, result.Email, result.Name)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	var refreshToken string
	if h.refreshTokenManager != nil {
		refreshToken, err = auth.GenerateRefreshToken()
		if err != nil {
			http.Error(w, `{"error":"failed to generate refresh token"}`, http.StatusInternalServerError)
			return
		}
		if err := h.refreshTokenManager.StoreRefreshToken(ctx, refreshToken, result.UserID, result.Email, result.Name); err != nil {
			http.Error(w, `{"error":"failed to store refresh token"}`, http.StatusInternalServerError)
			return
		}
	}

	ssoHashRedirect(w, r, accessToken, refreshToken)
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

	tenantID := strings.TrimSpace(req.TenantID)
	if err := sso.ValidateIssuer(tenantID); err != nil {
		http.Error(w, `{"error":"tenant_id must be a valid hostname (e.g. dev-12345.okta.com)"}`, http.StatusBadRequest)
		return
	}

	var config OktaSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role)
		 VALUES ($1, 'okta', $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (organization_id, provider) DO UPDATE
		 SET client_id = $2, client_secret = $3, tenant_id = $4, enabled = $5, groups_claim_name = $6, default_role = $7, updated_at = NOW()
		 RETURNING tenant_id, client_id, groups_claim_name, default_role, enabled, created_at, updated_at`,
		orgID, req.ClientID, req.ClientSecret, tenantID, enabled, groupsClaimName, defaultRole,
	).Scan(&config.TenantID, &config.ClientID, &config.GroupsClaimName, &config.DefaultRole, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to save SSO config"}`, http.StatusInternalServerError)
		return
	}

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

	var config OktaSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`SELECT tenant_id, client_id, groups_claim_name, default_role, enabled, created_at, updated_at
		 FROM sso_configs WHERE organization_id = $1 AND provider = 'okta'`,
		orgID,
	).Scan(&config.TenantID, &config.ClientID, &config.GroupsClaimName, &config.DefaultRole, &config.Enabled, &config.CreatedAt, &config.UpdatedAt)
	if err == pgx.ErrNoRows {
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

	err = h.login.TestIssuer(ctx, domain)

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
