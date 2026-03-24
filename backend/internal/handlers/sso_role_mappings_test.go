package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/models"
)

// ssoRoleMappingTestSetup creates an org, an SSO config for the given provider,
// admin + viewer users, and returns everything needed for role-mapping tests.
func ssoRoleMappingTestSetup(t *testing.T, provider string) (
	handler *SSORoleMappingHandler,
	orgID uuid.UUID,
	ssoConfigID uuid.UUID,
	adminToken string,
	viewerToken string,
) {
	t.Helper()

	if testPool == nil {
		t.Skip("Database not available")
	}

	handler = NewSSORoleMappingHandler(testPool, nil)

	ctx := context.Background()

	orgHandler := NewOrganizationHandler(testPool, nil)
	authHandler := NewAuthHandler(testPool, testJWTManager, nil)

	// Create admin user + org
	adminEmail := "sso-rm-admin-" + uuid.NewString() + "@example.com"
	adminResp := createTestUserWithEmail(t, authHandler, adminEmail)
	adminToken = adminResp.AccessToken

	slug := "sso-rm-" + uuid.NewString()
	body := `{"name":"SSO RM Test","slug":"` + slug + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, orgHandler.Create)(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create org: %d %s", w.Code, w.Body.String())
	}
	var org models.Organization
	json.NewDecoder(w.Body).Decode(&org)
	orgID = org.ID

	// Create viewer user and add to org
	viewerEmail := "sso-rm-viewer-" + uuid.NewString() + "@example.com"
	viewerResp := createTestUserWithEmail(t, authHandler, viewerEmail)
	viewerToken = viewerResp.AccessToken

	var viewerUserID uuid.UUID
	err := testPool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, viewerEmail).Scan(&viewerUserID)
	if err != nil {
		t.Fatalf("get viewer user id: %v", err)
	}
	_, err = testPool.Exec(ctx,
		`INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'viewer')`,
		orgID, viewerUserID,
	)
	if err != nil {
		t.Fatalf("insert viewer membership: %v", err)
	}

	// Create SSO config for the provider
	_, err = testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, enabled)
		 VALUES ($1, $2, 'test-client-id', 'test-client-secret', true)`,
		orgID, provider,
	)
	if err != nil {
		t.Fatalf("insert sso config: %v", err)
	}

	err = testPool.QueryRow(ctx,
		`SELECT id FROM sso_configs WHERE organization_id = $1 AND provider = $2`,
		orgID, provider,
	).Scan(&ssoConfigID)
	if err != nil {
		t.Fatalf("get sso config id: %v", err)
	}

	return handler, orgID, ssoConfigID, adminToken, viewerToken
}

// --- ListMappings tests ---

func TestSSORoleMappingListMappings_NonAdmin_403(t *testing.T) {
	handler, orgID, _, _, viewerToken := ssoRoleMappingTestSetup(t, "okta")

	req := httptest.NewRequest(http.MethodGet, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ListMappings)(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSSORoleMappingListMappings_Admin_ReturnsMappings(t *testing.T) {
	handler, orgID, ssoConfigID, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	ctx := context.Background()
	// Seed a mapping
	_, err := testPool.Exec(ctx,
		`INSERT INTO sso_role_mappings (organization_id, sso_config_id, sso_group_name, ace_role)
		 VALUES ($1, $2, 'engineering', 'editor')`,
		orgID, ssoConfigID,
	)
	if err != nil {
		t.Fatalf("seed mapping: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ListMappings)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var mappings []models.SSOConfigRoleMapping
	if err := json.NewDecoder(w.Body).Decode(&mappings); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(mappings) < 1 {
		t.Fatalf("expected at least 1 mapping, got %d", len(mappings))
	}

	found := false
	for _, m := range mappings {
		if m.SSOGroupName == "engineering" && m.AceRole == "editor" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected to find the 'engineering' -> 'editor' mapping")
	}
}

func TestSSORoleMappingListMappings_NoMappings_ReturnsEmptyArray(t *testing.T) {
	handler, orgID, _, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	req := httptest.NewRequest(http.MethodGet, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.ListMappings)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Must be [] not null
	body := w.Body.String()
	var mappings []models.SSOConfigRoleMapping
	if err := json.Unmarshal([]byte(body), &mappings); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if mappings == nil {
		t.Fatal("expected non-nil empty array, got nil")
	}
	if len(mappings) != 0 {
		t.Fatalf("expected 0 mappings, got %d", len(mappings))
	}
}

// --- CreateMapping tests ---

func TestSSORoleMappingCreateMapping_NonAdmin_403(t *testing.T) {
	handler, orgID, _, _, viewerToken := ssoRoleMappingTestSetup(t, "okta")

	body := `{"sso_group_name":"engineering","ace_role":"editor"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.CreateMapping)(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSSORoleMappingCreateMapping_Admin_CreatesMapping(t *testing.T) {
	handler, orgID, _, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	body := `{"sso_group_name":"platform","ace_role":"admin"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.CreateMapping)(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var mapping models.SSOConfigRoleMapping
	if err := json.NewDecoder(w.Body).Decode(&mapping); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if mapping.SSOGroupName != "platform" {
		t.Fatalf("expected sso_group_name 'platform', got %q", mapping.SSOGroupName)
	}
	if mapping.AceRole != "admin" {
		t.Fatalf("expected ace_role 'admin', got %q", mapping.AceRole)
	}
	if mapping.OrganizationID != orgID {
		t.Fatalf("expected organization_id %s, got %s", orgID, mapping.OrganizationID)
	}
	if mapping.ID == uuid.Nil {
		t.Fatal("expected non-nil mapping ID")
	}
}

func TestSSORoleMappingCreateMapping_DuplicateGroupName_409(t *testing.T) {
	handler, orgID, ssoConfigID, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	ctx := context.Background()
	// Seed a mapping
	_, err := testPool.Exec(ctx,
		`INSERT INTO sso_role_mappings (organization_id, sso_config_id, sso_group_name, ace_role)
		 VALUES ($1, $2, 'devops', 'editor')`,
		orgID, ssoConfigID,
	)
	if err != nil {
		t.Fatalf("seed mapping: %v", err)
	}

	body := `{"sso_group_name":"devops","ace_role":"admin"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.CreateMapping)(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSSORoleMappingCreateMapping_InvalidRole_400(t *testing.T) {
	handler, orgID, _, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	body := `{"sso_group_name":"security","ace_role":"superadmin"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.CreateMapping)(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSSORoleMappingCreateMapping_EmptyGroupName_400(t *testing.T) {
	handler, orgID, _, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	body := `{"sso_group_name":"  ","ace_role":"editor"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.CreateMapping)(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSSORoleMappingCreateMapping_MissingSSOConfig_404(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	handler := NewSSORoleMappingHandler(testPool, nil)
	authHandler := NewAuthHandler(testPool, testJWTManager, nil)
	orgHandler := NewOrganizationHandler(testPool, nil)

	// Create admin user + org (no SSO config)
	adminEmail := "sso-rm-noconfig-" + uuid.NewString() + "@example.com"
	adminResp := createTestUserWithEmail(t, authHandler, adminEmail)
	adminToken := adminResp.AccessToken

	slug := "sso-rm-noconfig-" + uuid.NewString()
	orgBody := `{"name":"SSO RM NoConfig Test","slug":"` + slug + `"}`
	orgReq := httptest.NewRequest(http.MethodPost, "/api/orgs", bytes.NewBufferString(orgBody))
	orgReq.Header.Set("Content-Type", "application/json")
	orgReq.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, orgHandler.Create)(w, orgReq)
	if w.Code != http.StatusCreated {
		t.Fatalf("create org: %d %s", w.Code, w.Body.String())
	}
	var org models.Organization
	json.NewDecoder(w.Body).Decode(&org)
	orgID := org.ID

	// POST to a valid provider but with no SSO config for this org
	body := `{"sso_group_name":"engineering","ace_role":"editor"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/sso/google/role-mappings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "google")
	w = httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.CreateMapping)(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}

	// Verify the error message
	var errResp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&errResp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResp["error"] != "SSO not configured for this provider" {
		t.Fatalf("expected error 'SSO not configured for this provider', got %q", errResp["error"])
	}
}

// --- DeleteMapping tests ---

func TestSSORoleMappingDeleteMapping_NonAdmin_403(t *testing.T) {
	handler, orgID, ssoConfigID, _, viewerToken := ssoRoleMappingTestSetup(t, "okta")

	ctx := context.Background()
	var mappingID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO sso_role_mappings (organization_id, sso_config_id, sso_group_name, ace_role)
		 VALUES ($1, $2, 'ops', 'viewer')
		 RETURNING id`,
		orgID, ssoConfigID,
	).Scan(&mappingID)
	if err != nil {
		t.Fatalf("seed mapping: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings/"+mappingID.String(), nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	req.SetPathValue("mappingId", mappingID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.DeleteMapping)(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSSORoleMappingDeleteMapping_Admin_204(t *testing.T) {
	handler, orgID, ssoConfigID, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	ctx := context.Background()
	var mappingID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO sso_role_mappings (organization_id, sso_config_id, sso_group_name, ace_role)
		 VALUES ($1, $2, 'backend', 'editor')
		 RETURNING id`,
		orgID, ssoConfigID,
	).Scan(&mappingID)
	if err != nil {
		t.Fatalf("seed mapping: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings/"+mappingID.String(), nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	req.SetPathValue("mappingId", mappingID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.DeleteMapping)(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSSORoleMappingDeleteMapping_NotFound_404(t *testing.T) {
	handler, orgID, _, adminToken, _ := ssoRoleMappingTestSetup(t, "okta")

	fakeID := uuid.New()
	req := httptest.NewRequest(http.MethodDelete, "/api/orgs/"+orgID.String()+"/sso/okta/role-mappings/"+fakeID.String(), nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.SetPathValue("id", orgID.String())
	req.SetPathValue("provider", "okta")
	req.SetPathValue("mappingId", fakeID.String())
	w := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, handler.DeleteMapping)(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

// --- ResolveRoleFromMappings tests ---

func TestResolveRoleFromMappings_MultipleGroups_HighestPriorityWins(t *testing.T) {
	mappings := []models.SSOConfigRoleMapping{
		{SSOGroupName: "viewers", AceRole: "viewer"},
		{SSOGroupName: "editors", AceRole: "editor"},
		{SSOGroupName: "admins", AceRole: "admin"},
	}

	result := ResolveRoleFromMappings([]string{"viewers", "editors", "admins"}, mappings, "viewer")
	if result != "admin" {
		t.Fatalf("expected 'admin', got %q", result)
	}

	result = ResolveRoleFromMappings([]string{"viewers", "editors"}, mappings, "viewer")
	if result != "editor" {
		t.Fatalf("expected 'editor', got %q", result)
	}
}

func TestResolveRoleFromMappings_NoMatch_ReturnsDefault(t *testing.T) {
	mappings := []models.SSOConfigRoleMapping{
		{SSOGroupName: "admins", AceRole: "admin"},
	}

	result := ResolveRoleFromMappings([]string{"unknown-group"}, mappings, "viewer")
	if result != "viewer" {
		t.Fatalf("expected default 'viewer', got %q", result)
	}

	result = ResolveRoleFromMappings([]string{}, mappings, "editor")
	if result != "editor" {
		t.Fatalf("expected default 'editor', got %q", result)
	}
}

func TestResolveRoleFromMappings_AuditorVsViewer_ViewerPreferred(t *testing.T) {
	mappings := []models.SSOConfigRoleMapping{
		{SSOGroupName: "compliance", AceRole: "auditor"},
		{SSOGroupName: "readonly", AceRole: "viewer"},
	}

	// When both auditor and viewer match, viewer should win (higher priority)
	result := ResolveRoleFromMappings([]string{"compliance", "readonly"}, mappings, "viewer")
	if result != "viewer" {
		t.Fatalf("expected 'viewer' over 'auditor', got %q", result)
	}

	// When only auditor matches, auditor is returned
	result = ResolveRoleFromMappings([]string{"compliance"}, mappings, "viewer")
	if result != "auditor" {
		t.Fatalf("expected 'auditor' when only auditor group matches, got %q", result)
	}
}
