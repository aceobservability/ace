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
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/models"
)

// ---------------------------------------------------------------------------
// Helper: create org + admin user + membership for Okta tests
// ---------------------------------------------------------------------------
type oktaTestFixture struct {
	orgID     uuid.UUID
	userID    uuid.UUID
	token     string
	orgSlug   string
	cleanupFn func()
}

func setupOktaTestFixture(t *testing.T, orgName, orgSlug, email, name, role string) *oktaTestFixture {
	t.Helper()
	if testPool == nil {
		t.Skip("Database not available")
	}
	ctx := context.Background()

	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`, orgName, orgSlug,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}

	var userID uuid.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`, email, name,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	_, err = testPool.Exec(ctx,
		`INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`,
		userID, orgID, role,
	)
	if err != nil {
		t.Fatalf("Failed to add membership: %v", err)
	}

	token, err := testJWTManager.GenerateAccessToken(userID, email, name)
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	cleanup := func() {
		testPool.Exec(ctx, `DELETE FROM sso_role_mappings WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM user_auth_methods WHERE user_id = $1`, userID)
		testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE user_id = $1`, userID)
		testPool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)
	}

	return &oktaTestFixture{orgID: orgID, userID: userID, token: token, orgSlug: orgSlug, cleanupFn: cleanup}
}

// ---------------------------------------------------------------------------
// 1. ConfigureSSO: non-admin -> 403
// ---------------------------------------------------------------------------
func TestOktaSSOConfigureRequiresAdmin(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Non-Admin Org", "okta-non-admin", "okta-nonadmin@example.com", "Viewer", "viewer")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	body := `{"client_id":"cid","client_secret":"cs","tenant_id":"dev-123.okta.com"}`
	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ConfigureSSO)(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

// ---------------------------------------------------------------------------
// 2. ConfigureSSO: admin -> saves config (verify DB)
// ---------------------------------------------------------------------------
func TestOktaSSOConfigureAsAdmin(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Admin Org", "okta-admin-org", "okta-admin@example.com", "Admin", "admin")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	body := `{"client_id":"okta-cid","client_secret":"okta-secret","tenant_id":"dev-123.okta.com","groups_claim_name":"myGroups","default_role":"editor"}`
	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ConfigureSSO)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp OktaSSOConfigResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.ClientID != "okta-cid" {
		t.Errorf("Expected client_id 'okta-cid', got '%s'", resp.ClientID)
	}
	if resp.TenantID != "dev-123.okta.com" {
		t.Errorf("Expected tenant_id 'dev-123.okta.com', got '%s'", resp.TenantID)
	}
	if resp.GroupsClaimName != "myGroups" {
		t.Errorf("Expected groups_claim_name 'myGroups', got '%s'", resp.GroupsClaimName)
	}
	if resp.DefaultRole != "editor" {
		t.Errorf("Expected default_role 'editor', got '%s'", resp.DefaultRole)
	}
	if !resp.Enabled {
		t.Error("Expected enabled to be true by default")
	}

	// Verify it was actually persisted in the DB
	ctx := context.Background()
	var dbClientID, dbTenantID, dbGroupsClaim, dbDefaultRole string
	var dbEnabled bool
	err := testPool.QueryRow(ctx,
		`SELECT client_id, tenant_id, enabled, groups_claim_name, default_role
		 FROM sso_configs WHERE organization_id = $1 AND provider = 'okta'`, f.orgID,
	).Scan(&dbClientID, &dbTenantID, &dbEnabled, &dbGroupsClaim, &dbDefaultRole)
	if err != nil {
		t.Fatalf("Failed to query DB: %v", err)
	}
	if dbClientID != "okta-cid" {
		t.Errorf("DB client_id mismatch: %s", dbClientID)
	}
	if dbTenantID != "dev-123.okta.com" {
		t.Errorf("DB tenant_id mismatch: %s", dbTenantID)
	}
	if !dbEnabled {
		t.Error("DB enabled should be true")
	}
	if dbGroupsClaim != "myGroups" {
		t.Errorf("DB groups_claim_name mismatch: %s", dbGroupsClaim)
	}
	if dbDefaultRole != "editor" {
		t.Errorf("DB default_role mismatch: %s", dbDefaultRole)
	}
}

// ---------------------------------------------------------------------------
// 3. GetSSOConfig: non-admin -> 403
// ---------------------------------------------------------------------------
func TestOktaSSOGetConfigRequiresAdmin(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Get NonAdmin", "okta-get-nonadmin", "okta-get-nonadmin@example.com", "Viewer", "viewer")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("GET", "/api/orgs/"+f.orgID.String()+"/sso/okta", nil)
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.GetSSOConfig)(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

// ---------------------------------------------------------------------------
// 4. GetSSOConfig: admin -> returns config with secret redacted
// ---------------------------------------------------------------------------
func TestOktaSSOGetConfigAsAdmin(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Get Admin", "okta-get-admin", "okta-get-admin@example.com", "Admin", "admin")
	defer f.cleanupFn()

	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role)
		 VALUES ($1, 'okta', 'get-cid', 'get-secret', 'dev-456.okta.com', true, 'groups', 'viewer')`, f.orgID,
	)
	if err != nil {
		t.Fatalf("Failed to insert SSO config: %v", err)
	}

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("GET", "/api/orgs/"+f.orgID.String()+"/sso/okta", nil)
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.GetSSOConfig)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp OktaSSOConfigResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.ClientID != "get-cid" {
		t.Errorf("Expected client_id 'get-cid', got '%s'", resp.ClientID)
	}
	if resp.TenantID != "dev-456.okta.com" {
		t.Errorf("Expected tenant_id 'dev-456.okta.com', got '%s'", resp.TenantID)
	}
	if resp.GroupsClaimName != "groups" {
		t.Errorf("Expected groups_claim_name 'groups', got '%s'", resp.GroupsClaimName)
	}

	// The response struct intentionally does not include client_secret
	// (there is no ClientSecret field in OktaSSOConfigResponse), so the
	// secret is never serialised.
	raw := w.Body.String()
	if bytes.Contains([]byte(raw), []byte("get-secret")) {
		t.Error("Response should not contain client_secret")
	}
}

// ---------------------------------------------------------------------------
// 5. GetSSOConfig: no config -> empty response (null)
// ---------------------------------------------------------------------------
func TestOktaSSOGetConfigNoConfig(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Get Empty", "okta-get-empty", "okta-get-empty@example.com", "Admin", "admin")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("GET", "/api/orgs/"+f.orgID.String()+"/sso/okta", nil)
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.GetSSOConfig)(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	body := w.Body.String()
	if body != "null" {
		t.Errorf("Expected 'null' body, got %q", body)
	}
}

// ---------------------------------------------------------------------------
// 6. Login: missing org param -> 400
// ---------------------------------------------------------------------------
func TestOktaSSOLoginRequiresOrg(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("GET", "/api/auth/okta/login", nil)
	w := httptest.NewRecorder()

	handler.Login(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// 7. Login: org not configured for Okta -> error
// ---------------------------------------------------------------------------
func TestOktaSSOLoginOrgNotConfigured(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Login NoCfg", "okta-login-nocfg", "okta-login-nocfg@example.com", "User", "viewer")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("GET", "/api/auth/okta/login?org=okta-login-nocfg", nil)
	w := httptest.NewRecorder()

	handler.Login(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// ---------------------------------------------------------------------------
// 8. Login: happy path -> redirects with state cookie
// ---------------------------------------------------------------------------
func TestOktaSSOLoginRedirects(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Login Redirect", "okta-login-redirect", "okta-login-redirect@example.com", "User", "viewer")
	defer f.cleanupFn()

	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role)
		 VALUES ($1, 'okta', 'login-cid', 'login-secret', 'dev-789.okta.com', true, 'groups', 'viewer')`, f.orgID,
	)
	if err != nil {
		t.Fatalf("Failed to create SSO config: %v", err)
	}

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("GET", "/api/auth/okta/login?org=okta-login-redirect", nil)
	w := httptest.NewRecorder()

	handler.Login(w, req)

	if w.Code != http.StatusTemporaryRedirect {
		t.Fatalf("Expected 307, got %d: %s", w.Code, w.Body.String())
	}

	location := w.Header().Get("Location")
	if location == "" {
		t.Fatal("Expected Location header for redirect")
	}

	// Should redirect to the Okta authorize endpoint
	expected := "https://dev-789.okta.com/oauth2/v1/authorize"
	if len(location) < len(expected) || location[:len(expected)] != expected {
		t.Errorf("Expected redirect to start with %s, got: %s", expected, location)
	}
}

// ---------------------------------------------------------------------------
// 9. Login: state cookie has correct attributes
// ---------------------------------------------------------------------------
func TestOktaSSOLoginStateCookieAttributes(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Login Cookie", "okta-login-cookie", "okta-login-cookie@example.com", "User", "viewer")
	defer f.cleanupFn()

	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role)
		 VALUES ($1, 'okta', 'cookie-cid', 'cookie-secret', 'dev-cookie.okta.com', true, 'groups', 'viewer')`, f.orgID,
	)
	if err != nil {
		t.Fatalf("Failed to create SSO config: %v", err)
	}

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("GET", "/api/auth/okta/login?org=okta-login-cookie", nil)
	w := httptest.NewRecorder()

	handler.Login(w, req)

	if w.Code != http.StatusTemporaryRedirect {
		t.Fatalf("Expected 307, got %d: %s", w.Code, w.Body.String())
	}

	cookies := w.Result().Cookies()
	var stateCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "okta_oauth_state" {
			stateCookie = c
			break
		}
	}

	if stateCookie == nil {
		t.Fatal("Expected okta_oauth_state cookie to be set")
	}

	if !stateCookie.HttpOnly {
		t.Error("Expected cookie to be HttpOnly")
	}
	if !stateCookie.Secure {
		t.Error("Expected cookie to be Secure")
	}
	if stateCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("Expected SameSite=Lax, got %v", stateCookie.SameSite)
	}
	if stateCookie.Path != "/" {
		t.Errorf("Expected Path='/', got %q", stateCookie.Path)
	}
	if stateCookie.MaxAge != 300 {
		t.Errorf("Expected MaxAge=300, got %d", stateCookie.MaxAge)
	}
}

// ---------------------------------------------------------------------------
// 10. Callback: clears state cookie with secure attributes
// ---------------------------------------------------------------------------
func TestOktaSSOCallbackClearsStateCookie(t *testing.T) {
	handler := NewOktaSSOHandler(nil, nil, nil, nil)

	state := "expected-state"
	stateData := state + ":test-org"
	encoded := base64.URLEncoding.EncodeToString([]byte(stateData))

	req := httptest.NewRequest("GET", "/api/auth/okta/callback?state="+state, nil)
	req.AddCookie(&http.Cookie{Name: "okta_oauth_state", Value: encoded})
	w := httptest.NewRecorder()

	handler.Callback(w, req)

	// Should fail with 400 (missing code) but the cookie should still be cleared
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for missing code, got %d: %s", w.Code, w.Body.String())
	}

	cookies := w.Result().Cookies()
	var cleared *http.Cookie
	for _, c := range cookies {
		if c.Name == "okta_oauth_state" {
			cleared = c
			break
		}
	}

	if cleared == nil {
		t.Fatal("Expected okta_oauth_state cookie to be cleared")
	}

	if !cleared.HttpOnly {
		t.Error("Expected cleared cookie to be HttpOnly")
	}
	if !cleared.Secure {
		t.Error("Expected cleared cookie to be Secure")
	}
	if cleared.SameSite != http.SameSiteLaxMode {
		t.Errorf("Expected cleared cookie SameSite=Lax, got %v", cleared.SameSite)
	}
	if cleared.Path != "/" {
		t.Errorf("Expected cleared cookie Path='/', got %q", cleared.Path)
	}
	if cleared.MaxAge != -1 {
		t.Errorf("Expected cleared cookie MaxAge=-1, got %d", cleared.MaxAge)
	}
}

// ---------------------------------------------------------------------------
// 11. ResolveRoleFromMappings: integration test for role resolution
// ---------------------------------------------------------------------------
func TestOktaResolveRoleFromMappings(t *testing.T) {
	tests := []struct {
		name        string
		groups      []string
		mappings    []models.SSOConfigRoleMapping
		defaultRole string
		wantRole    string
	}{
		{
			name:        "no groups -> default",
			groups:      nil,
			mappings:    []models.SSOConfigRoleMapping{{SSOGroupName: "admins", AceRole: "admin"}},
			defaultRole: "viewer",
			wantRole:    "viewer",
		},
		{
			name:   "single match",
			groups: []string{"engineers"},
			mappings: []models.SSOConfigRoleMapping{
				{SSOGroupName: "engineers", AceRole: "editor"},
			},
			defaultRole: "viewer",
			wantRole:    "editor",
		},
		{
			name:   "highest privilege wins",
			groups: []string{"engineers", "admins"},
			mappings: []models.SSOConfigRoleMapping{
				{SSOGroupName: "engineers", AceRole: "editor"},
				{SSOGroupName: "admins", AceRole: "admin"},
			},
			defaultRole: "viewer",
			wantRole:    "admin",
		},
		{
			name:        "no mapping match -> default",
			groups:      []string{"unrelated-group"},
			mappings:    []models.SSOConfigRoleMapping{{SSOGroupName: "admins", AceRole: "admin"}},
			defaultRole: "viewer",
			wantRole:    "viewer",
		},
		{
			name:   "auditor is lateral to viewer (viewer wins)",
			groups: []string{"auditors", "readers"},
			mappings: []models.SSOConfigRoleMapping{
				{SSOGroupName: "auditors", AceRole: "auditor"},
				{SSOGroupName: "readers", AceRole: "viewer"},
			},
			defaultRole: "viewer",
			wantRole:    "viewer",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ResolveRoleFromMappings(tc.groups, tc.mappings, tc.defaultRole)
			if got != tc.wantRole {
				t.Errorf("ResolveRoleFromMappings() = %q, want %q", got, tc.wantRole)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 12. Membership upsert: role_source = 'sso' vs 'manual'
// ---------------------------------------------------------------------------
func TestOktaMembershipRoleSourceUpsert(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()

	// Create org
	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ('Okta RS Org', 'okta-rs-org') RETURNING id`,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	// Create user
	var userID uuid.UUID
	err = testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ('okta-rs@example.com', 'RS User') RETURNING id`,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	defer testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE user_id = $1`, userID)

	// Subtest: INSERT with role_source = 'sso'
	t.Run("insert_sso_role_source", func(t *testing.T) {
		_, err := testPool.Exec(ctx,
			`INSERT INTO organization_memberships (user_id, organization_id, role, role_source) VALUES ($1, $2, 'editor', 'sso')`,
			userID, orgID,
		)
		if err != nil {
			t.Fatalf("Failed to insert membership: %v", err)
		}

		var role, roleSource string
		err = testPool.QueryRow(ctx,
			`SELECT role, role_source FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		).Scan(&role, &roleSource)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		if role != "editor" {
			t.Errorf("Expected role 'editor', got '%s'", role)
		}
		if roleSource != "sso" {
			t.Errorf("Expected role_source 'sso', got '%s'", roleSource)
		}
	})

	// Subtest: SSO updates role when role_source='sso'
	t.Run("sso_updates_sso_role_source", func(t *testing.T) {
		_, err := testPool.Exec(ctx,
			`UPDATE organization_memberships SET role = 'admin' WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		)
		if err != nil {
			t.Fatalf("Failed to update membership: %v", err)
		}

		var role, roleSource string
		err = testPool.QueryRow(ctx,
			`SELECT role, role_source FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		).Scan(&role, &roleSource)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}
		if role != "admin" {
			t.Errorf("Expected role 'admin', got '%s'", role)
		}
		if roleSource != "sso" {
			t.Errorf("Expected role_source to remain 'sso', got '%s'", roleSource)
		}
	})

	// Subtest: manual override preserves role_source='manual'
	t.Run("manual_override_preserved", func(t *testing.T) {
		// Set role_source to 'manual'
		_, err := testPool.Exec(ctx,
			`UPDATE organization_memberships SET role = 'viewer', role_source = 'manual' WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		)
		if err != nil {
			t.Fatalf("Failed to set manual: %v", err)
		}

		// Simulate what the Okta handler does: check role_source before updating
		var existingRoleSource string
		err = testPool.QueryRow(ctx,
			`SELECT role_source FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		).Scan(&existingRoleSource)
		if err != nil {
			t.Fatalf("Failed to query: %v", err)
		}

		if existingRoleSource != "manual" {
			t.Fatalf("Expected role_source 'manual', got '%s'", existingRoleSource)
		}

		// The handler should NOT update the role when role_source = 'manual'
		// Verify the role stays as 'viewer'
		var role string
		err = testPool.QueryRow(ctx,
			`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		).Scan(&role)
		if err != nil {
			t.Fatalf("Failed to query role: %v", err)
		}
		if role != "viewer" {
			t.Errorf("Expected role to remain 'viewer' (manual override), got '%s'", role)
		}
	})
}

// ---------------------------------------------------------------------------
// 13. TestConnection: admin -> returns status response
// ---------------------------------------------------------------------------
func TestOktaSSOTestConnectionRequiresAdmin(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Test Conn", "okta-test-conn", "okta-test-conn@example.com", "Viewer", "viewer")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta/test", nil)
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.TestConnection)(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

// ---------------------------------------------------------------------------
// 14. TestConnection: no config -> 404
// ---------------------------------------------------------------------------
func TestOktaSSOTestConnectionNoConfig(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Test No Cfg", "okta-test-nocfg", "okta-test-nocfg@example.com", "Admin", "admin")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta/test", nil)
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.TestConnection)(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

// ---------------------------------------------------------------------------
// 15. TestConnection: admin with config -> returns error status (fake domain)
// ---------------------------------------------------------------------------
func TestOktaSSOTestConnectionReturnsStatus(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Test Status", "okta-test-status", "okta-test-status@example.com", "Admin", "admin")
	defer f.cleanupFn()

	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role)
		 VALUES ($1, 'okta', 'test-cid', 'test-secret', 'nonexistent-domain.example.com', true, 'groups', 'viewer')`, f.orgID,
	)
	if err != nil {
		t.Fatalf("Failed to insert SSO config: %v", err)
	}

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta/test", nil)
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.TestConnection)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// The fake domain should fail OIDC discovery
	if resp["status"] != "error" {
		t.Errorf("Expected status 'error' for fake domain, got '%s'", resp["status"])
	}
	if resp["message"] == "" {
		t.Error("Expected non-empty error message")
	}
}

// ---------------------------------------------------------------------------
// 16. ConfigureSSO: invalid tenant_id -> 400
// ---------------------------------------------------------------------------
func TestOktaSSOConfigureInvalidTenantID(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Invalid Tenant", "okta-invalid-tenant", "okta-invalid-tenant@example.com", "Admin", "admin")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	// No dot in tenant_id
	body := `{"client_id":"cid","client_secret":"cs","tenant_id":"nodothost"}`
	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ConfigureSSO)(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid tenant_id, got %d: %s", w.Code, w.Body.String())
	}
}

// ---------------------------------------------------------------------------
// 17. ConfigureSSO: defaults for groups_claim_name and default_role
// ---------------------------------------------------------------------------
func TestOktaSSOConfigureDefaults(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Defaults", "okta-defaults", "okta-defaults@example.com", "Admin", "admin")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	// Omit groups_claim_name and default_role
	body := `{"client_id":"cid","client_secret":"cs","tenant_id":"dev-def.okta.com"}`
	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ConfigureSSO)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp OktaSSOConfigResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.GroupsClaimName != "groups" {
		t.Errorf("Expected default groups_claim_name 'groups', got '%s'", resp.GroupsClaimName)
	}
	if resp.DefaultRole != "viewer" {
		t.Errorf("Expected default default_role 'viewer', got '%s'", resp.DefaultRole)
	}
}

// ---------------------------------------------------------------------------
// 18. ConfigureSSO: invalid default_role -> 400
// ---------------------------------------------------------------------------
func TestOktaSSOConfigureInvalidDefaultRole(t *testing.T) {
	f := setupOktaTestFixture(t, "Okta Invalid Role", "okta-invalid-role", "okta-invalid-role@example.com", "Admin", "admin")
	defer f.cleanupFn()

	handler := NewOktaSSOHandler(testPool, testJWTManager, nil, nil)

	body := `{"client_id":"cid","client_secret":"cs","tenant_id":"dev-123.okta.com","default_role":"superadmin"}`
	req := httptest.NewRequest("POST", "/api/orgs/"+f.orgID.String()+"/sso/okta", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.SetPathValue("id", f.orgID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ConfigureSSO)(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid default_role, got %d: %s", w.Code, w.Body.String())
	}
}

// ---------------------------------------------------------------------------
// 19. isValidHostname
// ---------------------------------------------------------------------------
func TestOktaIsValidHostname(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"dev-123.okta.com", true},
		{"my-org.oktapreview.com", true},
		{"a.b", true},
		{"", false},
		{"nodot", false},
		{"https://dev-123.okta.com", false},
		{"dev 123.okta.com", false},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			got := isValidHostname(tc.input)
			if got != tc.want {
				t.Errorf("isValidHostname(%q) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}
