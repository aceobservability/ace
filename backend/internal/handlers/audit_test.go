package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/models"
)

// auditTestSetup creates an org and up to 4 members with different roles,
// seeds some audit log rows, and returns a cleanup function.
func auditTestSetup(t *testing.T) (
	handler *AuditHandler,
	orgID uuid.UUID,
	tokens map[string]string, // role -> access token
	cleanup func(),
) {
	t.Helper()

	if testPool == nil {
		t.Skip("Database not available")
	}

	handler = NewAuditHandler(testPool)

	ctx := context.Background()

	// Create org handler (re-use with no redis for simplicity)
	orgHandler := NewOrganizationHandler(testPool, nil)
	authHandler := NewAuthHandler(testPool, testJWTManager, nil)

	// Register users for each role
	roles := []string{"admin", "auditor", "editor", "viewer"}
	tokens = make(map[string]string)
	userIDs := make(map[string]uuid.UUID)

	for _, role := range roles {
		email := "audit-" + role + "-" + uuid.NewString() + "@example.com"
		// Clean up leftovers just in case
		testPool.Exec(ctx, "DELETE FROM users WHERE email = $1", email)

		resp := createTestUserWithEmail(t, authHandler, email)
		tokens[role] = resp.AccessToken

		// Fetch user ID from DB
		var uid uuid.UUID
		err := testPool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&uid)
		if err != nil {
			t.Fatalf("get user id for %s: %v", role, err)
		}
		userIDs[role] = uid
	}

	// Admin creates the org
	adminToken := tokens["admin"]
	slug := "audit-test-" + uuid.NewString()
	body := `{"name":"Audit Test Org","slug":"` + slug + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs", strings.NewReader(body))
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

	// Add the other users to the org with their respective roles
	for _, role := range []string{"auditor", "editor", "viewer"} {
		_, err := testPool.Exec(ctx,
			`INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, $3)`,
			orgID, userIDs[role], role,
		)
		if err != nil {
			t.Fatalf("insert membership for %s: %v", role, err)
		}
	}

	// Seed a few audit log rows for the org
	for i := 0; i < 3; i++ {
		_, err := testPool.Exec(ctx,
			`INSERT INTO audit_log (organization_id, actor_email, action, outcome)
			 VALUES ($1, $2, $3, $4)`,
			orgID, "actor@example.com", "POST /api/test", "success",
		)
		if err != nil {
			t.Fatalf("seed audit log: %v", err)
		}
	}

	// Seed a row with a distinct action for filter tests
	_, err := testPool.Exec(ctx,
		`INSERT INTO audit_log (organization_id, actor_email, action, outcome)
		 VALUES ($1, $2, $3, $4)`,
		orgID, "actor@example.com", "DELETE /api/orgs/something", "denied",
	)
	if err != nil {
		t.Fatalf("seed audit log distinct: %v", err)
	}

	cleanup = func() {
		conn, err := testPool.Acquire(ctx)
		if err != nil {
			t.Logf("cleanup acquire: %v", err)
			return
		}
		defer conn.Release()

		conn.Exec(ctx, `SET session_replication_role = replica`)
		conn.Exec(ctx, `DELETE FROM audit_log WHERE organization_id = $1`, orgID)
		conn.Exec(ctx, `SET session_replication_role = DEFAULT`)
		conn.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

		for _, uid := range userIDs {
			conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, uid)
		}
	}

	return handler, orgID, tokens, cleanup
}

// createTestUserWithEmail registers a fresh user and returns the auth response.
func createTestUserWithEmail(t *testing.T, authHandler *AuthHandler, email string) AuthResponse {
	t.Helper()
	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM users WHERE email = $1", email)

	body := `{"email":"` + email + `","password":"TestPassword123!","name":"Test User"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	authHandler.Register(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("register %s: %d %s", email, w.Code, w.Body.String())
	}

	var resp AuthResponse
	json.NewDecoder(w.Body).Decode(&resp)
	return resp
}

// doListAuditLog fires GET /api/orgs/{id}/audit-log with the given token and params.
func doListAuditLog(t *testing.T, handler *AuditHandler, orgID uuid.UUID, token string, queryParams string) *httptest.ResponseRecorder {
	t.Helper()
	url := "/api/orgs/" + orgID.String() + "/audit-log"
	if queryParams != "" {
		url += "?" + queryParams
	}
	req := httptest.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.SetPathValue("id", orgID.String())
	w := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, handler.ListAuditLog)(w, req)
	return w
}

// doExportAuditLog fires GET /api/orgs/{id}/audit-log/export with the given token.
func doExportAuditLog(t *testing.T, handler *AuditHandler, orgID uuid.UUID, token string, queryParams string) *httptest.ResponseRecorder {
	t.Helper()
	url := "/api/orgs/" + orgID.String() + "/audit-log/export"
	if queryParams != "" {
		url += "?" + queryParams
	}
	req := httptest.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.SetPathValue("id", orgID.String())
	w := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, handler.ExportAuditLog)(w, req)
	return w
}

// --- ListAuditLog tests ---

func TestListAuditLogAdminAccess(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	w := doListAuditLog(t, handler, orgID, tokens["admin"], "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Entries []models.AuditLogEntry `json:"entries"`
		Total   int                    `json:"total"`
		Page    int                    `json:"page"`
		Limit   int                    `json:"limit"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Entries) == 0 {
		t.Error("expected entries, got none")
	}
	if resp.Total == 0 {
		t.Error("expected total > 0")
	}
	if resp.Page != 1 {
		t.Errorf("expected page 1, got %d", resp.Page)
	}
}

func TestListAuditLogAuditorAccess(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	w := doListAuditLog(t, handler, orgID, tokens["auditor"], "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for auditor, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListAuditLogEditorDenied(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	w := doListAuditLog(t, handler, orgID, tokens["editor"], "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for editor, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListAuditLogViewerDenied(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	w := doListAuditLog(t, handler, orgID, tokens["viewer"], "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for viewer, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListAuditLogPagination(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	// Request page 1 with limit 2
	w := doListAuditLog(t, handler, orgID, tokens["admin"], "page=1&limit=2")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Entries []models.AuditLogEntry `json:"entries"`
		Total   int                    `json:"total"`
		Page    int                    `json:"page"`
		Limit   int                    `json:"limit"`
	}
	json.NewDecoder(w.Body).Decode(&resp)

	if resp.Limit != 2 {
		t.Errorf("expected limit 2, got %d", resp.Limit)
	}
	if resp.Page != 1 {
		t.Errorf("expected page 1, got %d", resp.Page)
	}
	if len(resp.Entries) > 2 {
		t.Errorf("expected at most 2 entries with limit=2, got %d", len(resp.Entries))
	}
	// Total should reflect all rows, not just this page
	if resp.Total < 2 {
		t.Errorf("expected total >= 2, got %d", resp.Total)
	}
}

func TestListAuditLogFilterByAction(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	// Filter for the distinct action seeded in setup
	w := doListAuditLog(t, handler, orgID, tokens["admin"], "action=DELETE+%2Fapi%2Forgs%2Fsomething")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Entries []models.AuditLogEntry `json:"entries"`
		Total   int                    `json:"total"`
	}
	json.NewDecoder(w.Body).Decode(&resp)

	for _, e := range resp.Entries {
		if e.Action != "DELETE /api/orgs/something" {
			t.Errorf("filter by action returned unexpected entry: %s", e.Action)
		}
	}
	if resp.Total != 1 {
		t.Errorf("expected total 1 for filtered action, got %d", resp.Total)
	}
}

// --- ExportAuditLog tests ---

func TestExportAuditLogCSV(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	w := doExportAuditLog(t, handler, orgID, tokens["admin"], "format=csv")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	ct := w.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("expected Content-Type text/csv, got %s", ct)
	}

	// Body should contain CSV header row
	body := w.Body.String()
	if !strings.Contains(body, "id") || !strings.Contains(body, "action") {
		t.Errorf("CSV body missing expected header columns: %s", body[:min(200, len(body))])
	}
}

func TestExportAuditLogJSON(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	w := doExportAuditLog(t, handler, orgID, tokens["admin"], "format=json")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	ct := w.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "application/json") {
		t.Errorf("expected Content-Type application/json, got %s", ct)
	}

	// Body should be a JSON array
	body := strings.TrimSpace(w.Body.String())
	if !strings.HasPrefix(body, "[") || !strings.HasSuffix(body, "]") {
		t.Errorf("expected JSON array, got: %s", body[:min(200, len(body))])
	}
}

func TestExportAuditLogCSVDefaultFormat(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	// No format param — should default to CSV
	w := doExportAuditLog(t, handler, orgID, tokens["admin"], "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	ct := w.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("expected default Content-Type text/csv, got %s", ct)
	}
}

func TestExportAuditLogEditorDenied(t *testing.T) {
	handler, orgID, tokens, cleanup := auditTestSetup(t)
	defer cleanup()

	w := doExportAuditLog(t, handler, orgID, tokens["editor"], "format=csv")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for editor export, got %d: %s", w.Code, w.Body.String())
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
