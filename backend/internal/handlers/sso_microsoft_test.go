package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/janhoon/dash/backend/internal/auth"
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
	handler := NewMicrosoftSSOHandler(testPool, testJWTManager)

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
	handler := NewMicrosoftSSOHandler(testPool, testJWTManager)

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
	handler := NewMicrosoftSSOHandler(testPool, testJWTManager)

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

	handler := NewMicrosoftSSOHandler(testPool, testJWTManager)

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

	handler := NewMicrosoftSSOHandler(testPool, testJWTManager)

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

	handler := NewMicrosoftSSOHandler(testPool, testJWTManager)

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
	handler := NewMicrosoftSSOHandler(nil, nil)

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
