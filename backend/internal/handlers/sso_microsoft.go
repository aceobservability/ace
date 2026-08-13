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

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/sso"
)

const microsoftStateCookie = "ms_oauth_state"

type MicrosoftSSOHandler struct {
	pool                *pgxpool.Pool
	jwtManager          *auth.JWTManager
	refreshTokenManager *auth.RefreshTokenManager
	login               *sso.Module
	baseURL             string
}

func NewMicrosoftSSOHandler(pool *pgxpool.Pool, jwtManager *auth.JWTManager, rdb *redis.Client, login *sso.Module) *MicrosoftSSOHandler {
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
		login:               login,
		baseURL:             baseURL,
	}
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

// Login initiates the Microsoft OAuth flow
func (h *MicrosoftSSOHandler) Login(w http.ResponseWriter, r *http.Request) {
	orgSlug := r.URL.Query().Get("org")
	if orgSlug == "" {
		http.Error(w, `{"error":"org parameter is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	started, err := h.login.Start(ctx, h.pool, sso.StartRequest{
		Provider:    sso.ProviderMicrosoft,
		OrgSlug:     orgSlug,
		RedirectURL: h.baseURL + "/api/auth/microsoft/callback",
	})
	if err != nil {
		writeSSOStartError(w, err)
		return
	}

	stateData := fmt.Sprintf("%s:%s", started.State, orgSlug)
	http.SetCookie(w, ssoStateCookie(microsoftStateCookie, base64.URLEncoding.EncodeToString([]byte(stateData)), 300))
	http.Redirect(w, r, started.AuthURL, http.StatusTemporaryRedirect)
}

// Callback handles the Microsoft OAuth callback
func (h *MicrosoftSSOHandler) Callback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie(microsoftStateCookie)
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

	http.SetCookie(w, ssoStateCookie(microsoftStateCookie, "", -1))

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

	result, err := h.login.Finish(ctx, h.pool, sso.FinishRequest{
		Provider:    sso.ProviderMicrosoft,
		OrgSlug:     orgSlug,
		RedirectURL: h.baseURL + "/api/auth/microsoft/callback",
		Code:        code,
	})
	if err != nil {
		writeSSOFinishError(w, err)
		return
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

// ConfigureSSO creates or updates Microsoft SSO configuration for an organization
func (h *MicrosoftSSOHandler) ConfigureSSO(w http.ResponseWriter, r *http.Request) {
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

	var req MicrosoftSSOConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.TenantID == "" || req.ClientID == "" || req.ClientSecret == "" {
		http.Error(w, `{"error":"tenant_id, client_id and client_secret are required"}`, http.StatusBadRequest)
		return
	}

	tenantID, err := sso.ValidateMicrosoftTenant(req.TenantID)
	if err != nil {
		http.Error(w, `{"error":"invalid tenant_id"}`, http.StatusBadRequest)
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	var config MicrosoftSSOConfigResponse
	err = h.pool.QueryRow(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled)
		 VALUES ($1, 'microsoft', $2, $3, $4, $5)
		 ON CONFLICT (organization_id, provider) DO UPDATE
		 SET client_id = $2, client_secret = $3, tenant_id = $4, enabled = $5, updated_at = NOW()
		 RETURNING tenant_id, client_id, enabled, created_at, updated_at`,
		orgID, req.ClientID, req.ClientSecret, tenantID, enabled,
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
