package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/db"
	"github.com/aceobservability/ace/backend/internal/handlers"
)

var (
	testPool         *pgxpool.Pool
	testJWTManager   *auth.JWTManager
	testAuthHandler  *handlers.AuthHandler
	testDSHandler    *handlers.DataSourceHandler
	testDashHandler  *handlers.DashboardHandler
	testPanelHandler *handlers.PanelHandler
)

func TestMain(m *testing.M) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://ace:ace@localhost:5432/ace_test?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		os.Exit(m.Run())
	}
	testPool = pool

	if err := db.RunMigrations(ctx, testPool); err != nil {
		pool.Close()
		os.Exit(1)
	}

	testJWTManager, err = auth.GenerateJWTManager()
	if err != nil {
		pool.Close()
		os.Exit(1)
	}

	testAuthHandler = handlers.NewAuthHandler(testPool, testJWTManager, nil)
	testDSHandler = handlers.NewDataSourceHandler(testPool)
	testDashHandler = handlers.NewDashboardHandler(testPool)
	testPanelHandler = handlers.NewPanelHandler(testPool)

	code := m.Run()
	testPool.Exec(ctx, "DELETE FROM users WHERE email LIKE 'testmcp%@example.com'")
	pool.Close()
	os.Exit(code)
}

func mcpMux(jwt *auth.JWTManager, authHandler *handlers.AuthHandler, dsHandler *handlers.DataSourceHandler, opts ...ServerOption) http.Handler {
	h := NewHandler(authHandler, dsHandler, opts...)
	mux := http.NewServeMux()
	mux.Handle("/mcp", auth.RequireAuth(jwt, h.ServeHTTP))
	mux.Handle("/mcp/", auth.RequireAuth(jwt, h.ServeHTTP))
	return mux
}

func TestUnauthenticatedMCPRejected(t *testing.T) {
	jwt, err := auth.GenerateJWTManager()
	if err != nil {
		t.Fatal(err)
	}
	handler := mcpMux(jwt, &handlers.AuthHandler{}, &handlers.DataSourceHandler{})

	for _, path := range []string{"/mcp", "/mcp/"} {
		for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
			req := httptest.NewRequest(method, path, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json, text/event-stream")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("%s %s without auth: status %d, want 401; body %s", method, path, rec.Code, rec.Body.String())
			}
			if looksLikeHTML(rec.Body.String()) {
				t.Errorf("%s %s without auth returned HTML", method, path)
			}
		}
	}
}

func TestMCPRouteDoesNotServeHTML(t *testing.T) {
	jwt, err := auth.GenerateJWTManager()
	if err != nil {
		t.Fatal(err)
	}
	handler := mcpMux(jwt, &handlers.AuthHandler{}, &handlers.DataSourceHandler{})

	req := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	req.Header.Set("Accept", "text/html")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("GET /mcp Accept: text/html without auth: status %d, want 401; body %s", rec.Code, rec.Body.String())
	}
	ct := rec.Header().Get("Content-Type")
	if strings.Contains(strings.ToLower(ct), "text/html") {
		t.Errorf("Content-Type %q is HTML; API handler must win", ct)
	}
	if looksLikeHTML(rec.Body.String()) {
		t.Errorf("body looks like SPA index.html: %s", rec.Body.String())
	}
}

func TestAuthenticatedWhoamiAndListDatasources(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()
	email := "testmcp-whoami@example.com"
	token, userID := insertTestUser(t, email, "MCP User")
	orgID := insertTestOrg(t, "MCP Whoami Org", "testmcp-whoami-org")
	insertMembership(t, orgID, userID, "admin")
	secretURL := "http://secret.internal:9090"
	dsID := insertTestDatasource(t, orgID, "Prom", "prometheus", secretURL, `{"password":"s3cret"}`)

	session := connectMCP(t, token)
	defer session.Close()

	who, err := session.CallTool(ctx, &mcpsdk.CallToolParams{Name: "whoami", Arguments: map[string]any{}})
	if err != nil {
		t.Fatalf("whoami: %v", err)
	}
	if who.IsError {
		t.Fatalf("whoami tool error: %s", toolText(who))
	}
	var me whoamiOutput
	mustDecodeStructured(t, who, &me)
	if me.Email != email {
		t.Errorf("whoami email = %q, want %q", me.Email, email)
	}
	if len(me.Organizations) != 1 {
		t.Fatalf("whoami orgs = %d, want 1", len(me.Organizations))
	}
	if me.Organizations[0].OrganizationID != orgID.String() {
		t.Errorf("whoami org id = %q, want %q", me.Organizations[0].OrganizationID, orgID)
	}

	listed, err := session.CallTool(ctx, &mcpsdk.CallToolParams{Name: "list_datasources", Arguments: map[string]any{}})
	if err != nil {
		t.Fatalf("list_datasources: %v", err)
	}
	if listed.IsError {
		t.Fatalf("list_datasources tool error: %s", toolText(listed))
	}
	var out listDatasourcesOutput
	mustDecodeStructured(t, listed, &out)
	if out.OrgID != orgID.String() {
		t.Errorf("list_datasources org_id = %q, want %q", out.OrgID, orgID)
	}
	if len(out.Datasources) != 1 {
		t.Fatalf("datasources = %+v, want 1", out.Datasources)
	}
	if out.Datasources[0].ID != dsID.String() || out.Datasources[0].Name != "Prom" || out.Datasources[0].Type != "prometheus" {
		t.Errorf("datasource = %+v", out.Datasources[0])
	}

	raw, err := json.Marshal(listed.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	blob := string(raw) + toolText(listed)
	for _, secret := range []string{secretURL, "s3cret", "auth_config", "auth_type", `"url"`} {
		if strings.Contains(blob, secret) {
			t.Errorf("list_datasources leaked %q in %s", secret, blob)
		}
	}
}

func TestListDatasourcesOrgScoped(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	token, userID := insertTestUser(t, "testmcp-scope@example.com", "Scoped User")
	orgA := insertTestOrg(t, "MCP Org A", "testmcp-org-a")
	orgB := insertTestOrg(t, "MCP Org B", "testmcp-org-b")
	insertMembership(t, orgA, userID, "admin")
	insertMembership(t, orgB, userID, "viewer")
	dsA := insertTestDatasource(t, orgA, "A Source", "prometheus", "http://org-a.internal:9090", `{"token":"aaa"}`)
	dsB := insertTestDatasource(t, orgB, "B Source", "loki", "http://org-b.internal:3100", `{"token":"bbb"}`)

	outsiderToken, outsiderID := insertTestUser(t, "testmcp-outsider@example.com", "Outsider")
	outsiderOrg := insertTestOrg(t, "MCP Outsider Org", "testmcp-outsider-org")
	insertMembership(t, outsiderOrg, outsiderID, "admin")
	_ = insertTestDatasource(t, outsiderOrg, "Secret Source", "prometheus", "http://outsider.internal:9090", `{"token":"nope"}`)

	session := connectMCP(t, token)
	defer session.Close()

	missing := callTool(t, session, "list_datasources", map[string]any{})
	if !missing.IsError {
		t.Fatalf("expected org_id required error, got %+v", missing.StructuredContent)
	}
	if !strings.Contains(strings.ToLower(toolText(missing)), "org_id") {
		t.Errorf("error should ask for org_id, got %s", toolText(missing))
	}

	listedA := callTool(t, session, "list_datasources", map[string]any{"org_id": orgA.String()})
	if listedA.IsError {
		t.Fatalf("list org A: %s", toolText(listedA))
	}
	var outA listDatasourcesOutput
	mustDecodeStructured(t, listedA, &outA)
	if len(outA.Datasources) != 1 || outA.Datasources[0].ID != dsA.String() {
		t.Fatalf("org A datasources = %+v, want %s", outA.Datasources, dsA)
	}
	blobA, _ := json.Marshal(listedA.StructuredContent)
	if bytes.Contains(blobA, []byte(dsB.String())) || bytes.Contains(blobA, []byte("B Source")) || bytes.Contains(blobA, []byte("org-b.internal")) {
		t.Errorf("org A list leaked org B: %s", blobA)
	}

	listedB := callTool(t, session, "list_datasources", map[string]any{"org_id": orgB.String()})
	if listedB.IsError {
		t.Fatalf("list org B: %s", toolText(listedB))
	}
	var outB listDatasourcesOutput
	mustDecodeStructured(t, listedB, &outB)
	if len(outB.Datasources) != 1 || outB.Datasources[0].ID != dsB.String() {
		t.Fatalf("org B datasources = %+v, want %s", outB.Datasources, dsB)
	}

	cross := callTool(t, session, "list_datasources", map[string]any{"org_id": outsiderOrg.String()})
	if !cross.IsError {
		t.Fatalf("expected cross-org error, got %+v", cross.StructuredContent)
	}
	crossBlob := toolText(cross)
	if strings.Contains(crossBlob, "Secret Source") || strings.Contains(crossBlob, "outsider.internal") {
		t.Errorf("cross-org error leaked datasource: %s", crossBlob)
	}

	outsider := connectMCP(t, outsiderToken)
	defer outsider.Close()
	outsiderA := callTool(t, outsider, "list_datasources", map[string]any{"org_id": orgA.String()})
	if !outsiderA.IsError {
		t.Fatalf("outsider listing org A should fail, got %+v", outsiderA.StructuredContent)
	}
	if strings.Contains(toolText(outsiderA), "A Source") {
		t.Errorf("outsider leaked org A datasource")
	}
}

func TestResolveOrgID(t *testing.T) {
	org1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	org2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	user := &handlers.UserResponse{
		Orgs: []handlers.OrganizationMembership{
			{OrganizationID: org1},
			{OrganizationID: org2},
		},
	}

	got, err := resolveOrgID(user, org2.String())
	if err != nil || got != org2 {
		t.Errorf("explicit org2: got %v %v", got, err)
	}

	_, err = resolveOrgID(user, "")
	if err == nil || !strings.Contains(err.Error(), "org_id") {
		t.Errorf("multi-org omit: err = %v", err)
	}

	_, err = resolveOrgID(user, uuid.New().String())
	if err == nil || !strings.Contains(err.Error(), "not a member") {
		t.Errorf("foreign org: err = %v", err)
	}

	single := &handlers.UserResponse{Orgs: []handlers.OrganizationMembership{{OrganizationID: org1}}}
	got, err = resolveOrgID(single, "")
	if err != nil || got != org1 {
		t.Errorf("single org omit: got %v %v", got, err)
	}

	empty := &handlers.UserResponse{Orgs: nil}
	_, err = resolveOrgID(empty, "")
	if err == nil || !strings.Contains(err.Error(), "no organization") {
		t.Errorf("zero orgs: err = %v", err)
	}

	_, err = resolveOrgID(single, "not-a-uuid")
	if err == nil || !strings.Contains(err.Error(), "invalid org_id") {
		t.Errorf("bad uuid: err = %v", err)
	}
}

func connectMCP(t *testing.T, accessToken string) *mcpsdk.ClientSession {
	t.Helper()
	handler := mcpMux(testJWTManager, testAuthHandler, testDSHandler, WithDashboards(testDashHandler, testPanelHandler))
	httpServer := httptest.NewServer(handler)
	t.Cleanup(httpServer.Close)

	client := mcpsdk.NewClient(&mcpsdk.Implementation{Name: "ace-mcp-test", Version: "1.0.0"}, nil)
	transport := &mcpsdk.StreamableClientTransport{
		Endpoint: httpServer.URL + "/mcp",
		HTTPClient: &http.Client{Transport: headerRoundTripper{
			base: http.DefaultTransport,
			headers: http.Header{
				"Authorization": []string{"Bearer " + accessToken},
			},
		}},
		DisableStandaloneSSE: true,
	}
	session, err := client.Connect(context.Background(), transport, nil)
	if err != nil {
		t.Fatalf("mcp connect: %v", err)
	}
	return session
}

type headerRoundTripper struct {
	base    http.RoundTripper
	headers http.Header
}

func (h headerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	r := req.Clone(req.Context())
	for k, vs := range h.headers {
		for _, v := range vs {
			r.Header.Set(k, v)
		}
	}
	base := h.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(r)
}

func callTool(t *testing.T, session *mcpsdk.ClientSession, name string, args map[string]any) *mcpsdk.CallToolResult {
	t.Helper()
	res, err := session.CallTool(context.Background(), &mcpsdk.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("CallTool %s: %v", name, err)
	}
	return res
}

func mustDecodeStructured(t *testing.T, res *mcpsdk.CallToolResult, dest any) {
	t.Helper()
	raw, err := json.Marshal(res.StructuredContent)
	if err != nil {
		t.Fatalf("marshal structured: %v", err)
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		t.Fatalf("decode structured %s: %v", raw, err)
	}
}

func toolText(res *mcpsdk.CallToolResult) string {
	var b strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*mcpsdk.TextContent); ok {
			b.WriteString(tc.Text)
		}
	}
	return b.String()
}

func looksLikeHTML(body string) bool {
	lower := strings.ToLower(body)
	return strings.Contains(lower, "<html") || strings.Contains(lower, "<!doctype") || strings.Contains(lower, "<div id=\"root\"")
}

func insertTestUser(t *testing.T, email, name string) (accessToken string, userID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organization_memberships WHERE user_id IN (SELECT id FROM users WHERE email = $1)", email)
	testPool.Exec(ctx, "DELETE FROM users WHERE email = $1", email)

	hash, err := auth.HashPassword("TestPassword123!")
	if err != nil {
		t.Fatal(err)
	}
	if err := testPool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
		email, hash, name,
	).Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	token, err := testJWTManager.GenerateAccessToken(userID, email, name)
	if err != nil {
		t.Fatal(err)
	}
	return token, userID
}

func insertTestOrg(t *testing.T, name, slug string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM dashboards WHERE organization_id IN (SELECT id FROM organizations WHERE slug = $1)", slug)
	testPool.Exec(ctx, "DELETE FROM datasources WHERE organization_id IN (SELECT id FROM organizations WHERE slug = $1)", slug)
	testPool.Exec(ctx, "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE slug = $1)", slug)
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = $1", slug)
	var id uuid.UUID
	if err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		name, slug,
	).Scan(&id); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	return id
}

func insertMembership(t *testing.T, orgID, userID uuid.UUID, role string) {
	t.Helper()
	if _, err := testPool.Exec(context.Background(),
		`INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, $3)`,
		orgID, userID, role,
	); err != nil {
		t.Fatalf("insert membership: %v", err)
	}
}

func insertTestDatasource(t *testing.T, orgID uuid.UUID, name, dsType, url, authConfig string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := testPool.QueryRow(context.Background(),
		`INSERT INTO datasources (organization_id, name, type, url, auth_type, auth_config)
		 VALUES ($1, $2, $3, $4, 'basic', $5::jsonb)
		 RETURNING id`,
		orgID, name, dsType, url, authConfig,
	).Scan(&id); err != nil {
		t.Fatalf("insert datasource: %v", err)
	}
	return id
}
