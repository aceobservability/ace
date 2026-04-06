package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/redis/go-redis/v9"
)

func TestMicrosoftSSOConfigureRequiresAdmin(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()

	// Create test org
	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ('Test Org MS SSO', 'test-org-ms-sso') RETURNING id`,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	// Create test user
	var userID uuid.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ('testmsssouser@example.com', 'Test MS SSO User') RETURNING id`,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)

	// Add user as viewer (not admin)
	_, err = testPool.Exec(ctx,
		`INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ($1, $2, 'viewer')`,
		userID, orgID,
	)
	if err != nil {
		t.Fatalf("Failed to add membership: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE user_id = $1`, userID)

	// Generate token for user
	token, err := testJWTManager.GenerateAccessToken(userID, "testmsssouser@example.com", "Test MS SSO User")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Create handler
	handler := NewMicrosoftSSOHandler(testPool, testJWTManager, nil)

	// Try to configure SSO as non-admin
	body := `{"tenant_id":"test-tenant","client_id":"test-client-id","client_secret":"test-secret"}`
	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/sso/microsoft", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.SetPathValue("id", orgID.String())
	w := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, handler.ConfigureSSO)
	wrappedHandler(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status 403 for non-admin, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMicrosoftSSOConfigureAsAdmin(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()

	// Create test org
	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ('Test Org MS SSO Admin', 'test-org-ms-sso-admin') RETURNING id`,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	// Create test user
	var userID uuid.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ('testmsssoadmin@example.com', 'Test MS SSO Admin') RETURNING id`,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)

	// Add user as admin
	_, err = testPool.Exec(ctx,
		`INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ($1, $2, 'admin')`,
		userID, orgID,
	)
	if err != nil {
		t.Fatalf("Failed to add membership: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE user_id = $1`, userID)

	// Generate token for user
	token, err := testJWTManager.GenerateAccessToken(userID, "testmsssoadmin@example.com", "Test MS SSO Admin")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Create handler
	handler := NewMicrosoftSSOHandler(testPool, testJWTManager, nil)

	// Configure SSO as admin
	body := `{"tenant_id":"test-tenant","client_id":"test-client-id","client_secret":"test-secret"}`
	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/sso/microsoft", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.SetPathValue("id", orgID.String())
	w := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, handler.ConfigureSSO)
	wrappedHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response MicrosoftSSOConfigResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.TenantID != "test-tenant" {
		t.Errorf("Expected tenant_id 'test-tenant', got '%s'", response.TenantID)
	}
	if response.ClientID != "test-client-id" {
		t.Errorf("Expected client_id 'test-client-id', got '%s'", response.ClientID)
	}
	if !response.Enabled {
		t.Error("Expected SSO to be enabled by default")
	}
}

func TestMicrosoftSSOGetConfig(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()

	// Create test org
	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ('Test Org MS SSO Get', 'test-org-ms-sso-get') RETURNING id`,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	// Create SSO config
	_, err = testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled)
		 VALUES ($1, 'microsoft', 'ms-client-id', 'ms-secret', 'ms-tenant', true)`,
		orgID,
	)
	if err != nil {
		t.Fatalf("Failed to create SSO config: %v", err)
	}

	// Create test user
	var userID uuid.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ('testmsssoadminget@example.com', 'Test MS SSO Admin Get') RETURNING id`,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)

	// Add user as admin
	_, err = testPool.Exec(ctx,
		`INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ($1, $2, 'admin')`,
		userID, orgID,
	)
	if err != nil {
		t.Fatalf("Failed to add membership: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE user_id = $1`, userID)

	// Generate token for user
	token, err := testJWTManager.GenerateAccessToken(userID, "testmsssoadminget@example.com", "Test MS SSO Admin Get")
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Create handler
	handler := NewMicrosoftSSOHandler(testPool, testJWTManager, nil)

	// Get SSO config
	req := httptest.NewRequest("GET", "/api/orgs/"+orgID.String()+"/sso/microsoft", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.SetPathValue("id", orgID.String())
	w := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, handler.GetSSOConfig)
	wrappedHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response MicrosoftSSOConfigResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.TenantID != "ms-tenant" {
		t.Errorf("Expected tenant_id 'ms-tenant', got '%s'", response.TenantID)
	}
	if response.ClientID != "ms-client-id" {
		t.Errorf("Expected client_id 'ms-client-id', got '%s'", response.ClientID)
	}
}

func TestMicrosoftSSOLoginRequiresOrg(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	handler := NewMicrosoftSSOHandler(testPool, testJWTManager, nil)

	// Try login without org parameter
	req := httptest.NewRequest("GET", "/api/auth/microsoft/login", nil)
	w := httptest.NewRecorder()

	handler.Login(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for missing org, got %d", w.Code)
	}
}

func TestMicrosoftSSOLoginOrgNotConfigured(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()

	// Create test org without SSO config
	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ('Test Org No MS SSO', 'test-org-no-ms-sso') RETURNING id`,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	handler := NewMicrosoftSSOHandler(testPool, testJWTManager, nil)

	// Try login with org that doesn't have SSO configured
	req := httptest.NewRequest("GET", "/api/auth/microsoft/login?org=test-org-no-ms-sso", nil)
	w := httptest.NewRecorder()

	handler.Login(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for unconfigured SSO, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMicrosoftSSOLoginRedirectsToMicrosoft(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()

	// Create test org with SSO config
	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ('Test Org MS SSO Redirect', 'test-org-ms-sso-redirect') RETURNING id`,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	// Create SSO config
	_, err = testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled)
		 VALUES ($1, 'microsoft', 'redirect-client-id', 'redirect-secret', 'test-tenant-id', true)`,
		orgID,
	)
	if err != nil {
		t.Fatalf("Failed to create SSO config: %v", err)
	}

	handler := NewMicrosoftSSOHandler(testPool, testJWTManager, nil)

	// Try login - should redirect to Microsoft
	req := httptest.NewRequest("GET", "/api/auth/microsoft/login?org=test-org-ms-sso-redirect", nil)
	w := httptest.NewRecorder()

	handler.Login(w, req)

	if w.Code != http.StatusTemporaryRedirect {
		t.Errorf("Expected status 307, got %d: %s", w.Code, w.Body.String())
	}

	location := w.Header().Get("Location")
	if location == "" {
		t.Error("Expected Location header for redirect")
	}

	// Check it's a Microsoft URL
	if len(location) < 40 || location[:40] != "https://login.microsoftonline.com/test-t" {
		t.Errorf("Expected redirect to Microsoft, got: %s", location)
	}

	// Check state cookie was set
	cookies := w.Result().Cookies()
	var stateCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "ms_oauth_state" {
			stateCookie = c
			break
		}
	}
	if stateCookie == nil {
		t.Error("Expected ms_oauth_state cookie to be set")
		return
	}

	if !stateCookie.HttpOnly {
		t.Error("Expected ms_oauth_state cookie to be HttpOnly")
	}
	if !stateCookie.Secure {
		t.Error("Expected ms_oauth_state cookie to be Secure")
	}
	if stateCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("Expected ms_oauth_state cookie SameSite=Lax, got %v", stateCookie.SameSite)
	}
	if stateCookie.Path != "/" {
		t.Errorf("Expected ms_oauth_state cookie Path='/', got %q", stateCookie.Path)
	}
	if stateCookie.MaxAge != 300 {
		t.Errorf("Expected ms_oauth_state cookie MaxAge=300, got %d", stateCookie.MaxAge)
	}
}

func TestMicrosoftSSOCallbackClearsStateCookieWithSecureAttributes(t *testing.T) {
	handler := NewMicrosoftSSOHandler(nil, nil, nil)

	state := "expected-state"
	stateData := state + ":test-org"
	encodedStateData := base64.URLEncoding.EncodeToString([]byte(stateData))

	req := httptest.NewRequest("GET", "/api/auth/microsoft/callback?state="+state, nil)
	req.AddCookie(&http.Cookie{Name: "ms_oauth_state", Value: encodedStateData})
	w := httptest.NewRecorder()

	handler.Callback(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for missing authorization code, got %d: %s", w.Code, w.Body.String())
	}

	cookies := w.Result().Cookies()
	var clearedStateCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "ms_oauth_state" {
			clearedStateCookie = c
			break
		}
	}

	if clearedStateCookie == nil {
		t.Fatal("Expected ms_oauth_state cookie to be cleared")
		return
	}

	if !clearedStateCookie.HttpOnly {
		t.Error("Expected cleared ms_oauth_state cookie to be HttpOnly")
	}
	if !clearedStateCookie.Secure {
		t.Error("Expected cleared ms_oauth_state cookie to be Secure")
	}
	if clearedStateCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("Expected cleared ms_oauth_state cookie SameSite=Lax, got %v", clearedStateCookie.SameSite)
	}
	if clearedStateCookie.Path != "/" {
		t.Errorf("Expected cleared ms_oauth_state cookie Path='/', got %q", clearedStateCookie.Path)
	}
	if clearedStateCookie.MaxAge != -1 {
		t.Errorf("Expected cleared ms_oauth_state cookie MaxAge=-1, got %d", clearedStateCookie.MaxAge)
	}
}

func TestMicrosoftSSOCallbackRedirectIncludesRefreshToken(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()

	// Start miniredis
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("Failed to start miniredis: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rdb.Close()

	// Create handler with Redis (refresh token manager)
	handler := NewMicrosoftSSOHandler(testPool, testJWTManager, rdb)

	// Verify the handler has a refresh token manager
	if handler.refreshTokenManager == nil {
		t.Fatal("Expected handler to have a refreshTokenManager when Redis is provided")
	}

	// Create test org
	var orgID uuid.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ('Test Org MS CB', 'test-org-ms-cb') RETURNING id`,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}
	defer func() {
		testPool.Exec(ctx, `DELETE FROM user_auth_methods WHERE user_id IN (SELECT id FROM users WHERE email = 'testmscallback@example.com')`)
		testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM users WHERE email = 'testmscallback@example.com'`)
		testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)
	}()

	// Insert SSO config
	_, err = testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled)
		 VALUES ($1, 'microsoft', 'mock-ms-client-id', 'mock-ms-client-secret', 'mock-tenant', true)`,
		orgID,
	)
	if err != nil {
		t.Fatalf("Failed to create SSO config: %v", err)
	}

	// Pre-create user
	var userID uuid.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ('testmscallback@example.com', 'Test MS User') RETURNING id`,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Test refresh token generation and storage works with the handler's manager
	refreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("Failed to generate refresh token: %v", err)
	}

	err = handler.refreshTokenManager.StoreRefreshToken(ctx, refreshToken, userID, "testmscallback@example.com", "Test MS User")
	if err != nil {
		t.Fatalf("Failed to store refresh token: %v", err)
	}

	// Verify stored token can be retrieved
	data, err := handler.refreshTokenManager.GetRefreshToken(ctx, refreshToken)
	if err != nil {
		t.Fatalf("Failed to get refresh token: %v", err)
	}
	if data.UserID != userID {
		t.Errorf("Expected user ID %s, got %s", userID, data.UserID)
	}
	if data.Email != "testmscallback@example.com" {
		t.Errorf("Expected email 'testmscallback@example.com', got '%s'", data.Email)
	}

	// Verify the redirect URL format includes refresh_token when present
	accessToken, err := testJWTManager.GenerateAccessToken(userID, "testmscallback@example.com", "Test MS User")
	if err != nil {
		t.Fatalf("Failed to generate access token: %v", err)
	}

	expectedURL := fmt.Sprintf("http://localhost:5173/auth/callback#access_token=%s&token_type=Bearer&refresh_token=%s", accessToken, refreshToken)
	if !strings.Contains(expectedURL, "access_token=") {
		t.Error("Expected redirect URL to contain access_token")
	}
	if !strings.Contains(expectedURL, "refresh_token=") {
		t.Error("Expected redirect URL to contain refresh_token")
	}
}

func TestMicrosoftSSOCallbackNoRefreshTokenWithoutRedis(t *testing.T) {
	// Verify that when constructed without Redis, no refresh token manager is set
	handler := NewMicrosoftSSOHandler(nil, nil, nil)
	if handler.refreshTokenManager != nil {
		t.Error("Expected no refreshTokenManager when Redis is nil")
	}
}
