package mcp

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/handlers"
	"github.com/aceobservability/ace/backend/internal/models"
)

func TestCreateDashboardAndPanelViaMCP(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	token, userID := insertTestUser(t, "testmcp-dash@example.com", "Dash User")
	orgID := insertTestOrg(t, "MCP Dash Org", "testmcp-dash-org")
	insertMembership(t, orgID, userID, "admin")
	secretURL := "http://secret-dash.internal:9090"
	dsID := insertTestDatasource(t, orgID, "Dash Prom", "prometheus", secretURL, `{"password":"dash-s3cret"}`)

	outsiderToken, outsiderID := insertTestUser(t, "testmcp-dash-out@example.com", "Outsider")
	outsiderOrg := insertTestOrg(t, "MCP Dash Outsider", "testmcp-dash-out-org")
	insertMembership(t, outsiderOrg, outsiderID, "admin")

	session := connectMCP(t, token)
	defer session.Close()

	created := callTool(t, session, "create_dashboard", map[string]any{
		"title":       "MCP CPU",
		"description": "from cursor",
	})
	if created.IsError {
		t.Fatalf("create_dashboard: %s", toolText(created))
	}
	var dash models.Dashboard
	mustDecodeStructured(t, created, &dash)
	if dash.Title != "MCP CPU" {
		t.Fatalf("created title = %q", dash.Title)
	}
	if dash.OrganizationID == nil || *dash.OrganizationID != orgID {
		t.Fatalf("created org = %v, want %s", dash.OrganizationID, orgID)
	}

	upserted := callTool(t, session, "upsert_panels", map[string]any{
		"dashboard_id": dash.ID.String(),
		"panels": []map[string]any{
			{
				"title":         "CPU",
				"type":          "line_chart",
				"grid_pos":      map[string]any{"x": 0, "y": 0, "w": 12, "h": 8},
				"datasource_id": dsID.String(),
				"query":         map[string]any{"expr": "rate(cpu[5m])", "signal": "metrics"},
			},
		},
	})
	if upserted.IsError {
		t.Fatalf("upsert_panels create: %s", toolText(upserted))
	}
	var upsertOut upsertPanelsOutput
	mustDecodeStructured(t, upserted, &upsertOut)
	if len(upsertOut.Panels) != 1 {
		t.Fatalf("upsert panels = %+v, want 1", upsertOut.Panels)
	}
	panelID := upsertOut.Panels[0].ID

	got := callTool(t, session, "get_dashboard", map[string]any{"dashboard_id": dash.ID.String()})
	if got.IsError {
		t.Fatalf("get_dashboard: %s", toolText(got))
	}
	var gotOut getDashboardOutput
	mustDecodeStructured(t, got, &gotOut)
	if gotOut.ID != dash.ID || gotOut.Title != "MCP CPU" {
		t.Fatalf("get_dashboard = %+v", gotOut.Dashboard)
	}
	if len(gotOut.Panels) != 1 || gotOut.Panels[0].ID != panelID {
		t.Fatalf("get_dashboard panels = %+v", gotOut.Panels)
	}

	listed := callTool(t, session, "list_dashboards", map[string]any{})
	if listed.IsError {
		t.Fatalf("list_dashboards: %s", toolText(listed))
	}
	var listOut listDashboardsOutput
	mustDecodeStructured(t, listed, &listOut)
	if listOut.OrgID != orgID.String() {
		t.Errorf("list org_id = %q, want %q", listOut.OrgID, orgID)
	}
	found := false
	for _, d := range listOut.Dashboards {
		if d.ID == dash.ID {
			found = true
			if d.Title != dash.Title {
				t.Errorf("list title = %q, want %q", d.Title, dash.Title)
			}
		}
	}
	if !found {
		t.Fatalf("list_dashboards missing created dashboard: %+v", listOut.Dashboards)
	}

	apiDash := apiGetDashboard(t, token, dash.ID)
	if apiDash.ID != dash.ID || apiDash.Title != "MCP CPU" {
		t.Errorf("HTTP GET dashboard = %+v, want MCP record", apiDash)
	}
	apiPanels := apiListPanels(t, token, dash.ID)
	if len(apiPanels) != 1 || apiPanels[0].ID != panelID {
		t.Fatalf("HTTP list panels = %+v, want %s", apiPanels, panelID)
	}
	assertQueryHas(t, apiPanels[0].Query, "rate(cpu[5m])", dsID.String())

	blob := structuredBlob(t, created) + structuredBlob(t, upserted) + structuredBlob(t, got) + structuredBlob(t, listed) + toolText(got)
	for _, secret := range []string{secretURL, "dash-s3cret", "auth_config", "auth_type"} {
		if strings.Contains(blob, secret) {
			t.Errorf("dashboard tools leaked %q in %s", secret, blob)
		}
	}

	outsider := connectMCP(t, outsiderToken)
	defer outsider.Close()

	outGet := callTool(t, outsider, "get_dashboard", map[string]any{"dashboard_id": dash.ID.String()})
	if !outGet.IsError {
		t.Fatalf("outsider get_dashboard should fail, got %+v", outGet.StructuredContent)
	}
	if strings.Contains(toolText(outGet), "MCP CPU") {
		t.Errorf("outsider get leaked dashboard: %s", toolText(outGet))
	}

	outList := callTool(t, outsider, "list_dashboards", map[string]any{"org_id": orgID.String()})
	if !outList.IsError {
		t.Fatalf("outsider list org A should fail, got %+v", outList.StructuredContent)
	}
	if strings.Contains(toolText(outList)+structuredBlob(t, outList), "MCP CPU") {
		t.Errorf("outsider list leaked dashboard")
	}

	outWrite := callTool(t, outsider, "upsert_panels", map[string]any{
		"dashboard_id": dash.ID.String(),
		"panels": []map[string]any{
			{"title": "Pwned", "type": "stat", "query": map[string]any{"expr": "up"}},
		},
	})
	if !outWrite.IsError {
		t.Fatalf("outsider upsert should fail, got %+v", outWrite.StructuredContent)
	}

	still := apiListPanels(t, token, dash.ID)
	if len(still) != 1 || still[0].Title != "CPU" {
		t.Fatalf("outsider write mutated panels: %+v", still)
	}
}

func TestUpsertPanelsUpdatesAPIRows(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	token, userID := insertTestUser(t, "testmcp-panel-up@example.com", "Panel User")
	orgID := insertTestOrg(t, "MCP Panel Org", "testmcp-panel-org")
	insertMembership(t, orgID, userID, "editor")
	dsID := insertTestDatasource(t, orgID, "Panel Prom", "prometheus", "http://panel.internal:9090", `{"token":"nope"}`)

	session := connectMCP(t, token)
	defer session.Close()

	created := callTool(t, session, "create_dashboard", map[string]any{"title": "Editable"})
	if created.IsError {
		t.Fatalf("create_dashboard: %s", toolText(created))
	}
	var dash models.Dashboard
	mustDecodeStructured(t, created, &dash)

	first := callTool(t, session, "upsert_panels", map[string]any{
		"dashboard_id": dash.ID.String(),
		"panels": []map[string]any{
			{
				"title":         "Before",
				"type":          "stat",
				"grid_pos":      map[string]any{"x": 0, "y": 0, "w": 6, "h": 4},
				"datasource_id": dsID.String(),
				"query":         map[string]any{"expr": "up", "signal": "metrics"},
			},
		},
	})
	if first.IsError {
		t.Fatalf("create panel: %s", toolText(first))
	}
	var createdPanels upsertPanelsOutput
	mustDecodeStructured(t, first, &createdPanels)
	panelID := createdPanels.Panels[0].ID

	updated := callTool(t, session, "upsert_panels", map[string]any{
		"dashboard_id": dash.ID.String(),
		"panels": []map[string]any{
			{
				"id":            panelID.String(),
				"title":         "After",
				"type":          "gauge",
				"grid_pos":      map[string]any{"x": 2, "y": 1, "w": 4, "h": 3},
				"datasource_id": dsID.String(),
				"query":         map[string]any{"expr": "up{job=\"api\"}", "signal": "metrics"},
			},
		},
	})
	if updated.IsError {
		t.Fatalf("update panel: %s", toolText(updated))
	}
	var updatedOut upsertPanelsOutput
	mustDecodeStructured(t, updated, &updatedOut)
	if len(updatedOut.Panels) != 1 || updatedOut.Panels[0].ID != panelID {
		t.Fatalf("update returned %+v, want id %s", updatedOut.Panels, panelID)
	}
	if updatedOut.Panels[0].Title != "After" || updatedOut.Panels[0].Type != "gauge" {
		t.Errorf("updated panel = %+v", updatedOut.Panels[0])
	}
	if updatedOut.Panels[0].GridPos != (models.GridPos{X: 2, Y: 1, W: 4, H: 3}) {
		t.Errorf("updated grid_pos = %+v", updatedOut.Panels[0].GridPos)
	}

	apiPanels := apiListPanels(t, token, dash.ID)
	if len(apiPanels) != 1 {
		t.Fatalf("API panels after upsert = %+v, want 1 row", apiPanels)
	}
	if apiPanels[0].ID != panelID {
		t.Errorf("API panel id = %s, want %s (must update the same row)", apiPanels[0].ID, panelID)
	}
	if apiPanels[0].Title != "After" || apiPanels[0].Type != "gauge" {
		t.Errorf("API panel = %+v", apiPanels[0])
	}
	assertQueryHas(t, apiPanels[0].Query, `up{job="api"}`, dsID.String())

	foreign := callTool(t, session, "upsert_panels", map[string]any{
		"dashboard_id": dash.ID.String(),
		"panels": []map[string]any{
			{"id": uuid.New().String(), "title": "Nope"},
		},
	})
	if !foreign.IsError {
		t.Fatalf("upsert unknown panel id should fail, got %+v", foreign.StructuredContent)
	}
}

func TestSaveGeneratedDashboardSpec(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	token, userID := insertTestUser(t, "testmcp-gendash@example.com", "Gen User")
	orgID := insertTestOrg(t, "MCP Gen Org", "testmcp-gen-org")
	insertMembership(t, orgID, userID, "admin")
	dsID := insertTestDatasource(t, orgID, "Gen Prom", "prometheus", "http://gen.internal:9090", `{"token":"hidden"}`)

	session := connectMCP(t, token)
	defer session.Close()

	saved := callTool(t, session, "save_generated_dashboard", map[string]any{
		"title":         "Generated",
		"description":   "copilot spec",
		"datasource_id": dsID.String(),
		"panels": []map[string]any{
			{
				"title":    "Requests",
				"type":     "line_chart",
				"grid_pos": map[string]any{"x": 0, "y": 0, "w": 12, "h": 6},
				"query":    map[string]any{"expr": "rate(http_requests[5m])", "legend_format": "{{path}}", "signal": "metrics"},
			},
		},
	})
	if saved.IsError {
		t.Fatalf("save_generated_dashboard: %s", toolText(saved))
	}
	var out getDashboardOutput
	mustDecodeStructured(t, saved, &out)
	if out.Title != "Generated" || len(out.Panels) != 1 {
		t.Fatalf("saved = %+v", out)
	}

	apiDash := apiGetDashboard(t, token, out.ID)
	if apiDash.Title != "Generated" {
		t.Errorf("HTTP GET title = %q", apiDash.Title)
	}
	apiPanels := apiListPanels(t, token, out.ID)
	if len(apiPanels) != 1 || apiPanels[0].Title != "Requests" {
		t.Fatalf("HTTP panels = %+v", apiPanels)
	}
	assertQueryHas(t, apiPanels[0].Query, "rate(http_requests[5m])", dsID.String())

	blob := structuredBlob(t, saved)
	if strings.Contains(blob, "hidden") || strings.Contains(blob, "gen.internal") {
		t.Errorf("save_generated_dashboard leaked secret: %s", blob)
	}
}

func TestDashboardToolsOrgScoped(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	token, userID := insertTestUser(t, "testmcp-dash-scope@example.com", "Scoped")
	orgA := insertTestOrg(t, "MCP Dash A", "testmcp-dash-a")
	orgB := insertTestOrg(t, "MCP Dash B", "testmcp-dash-b")
	insertMembership(t, orgA, userID, "admin")
	insertMembership(t, orgB, userID, "viewer")

	session := connectMCP(t, token)
	defer session.Close()

	missing := callTool(t, session, "list_dashboards", map[string]any{})
	if !missing.IsError || !strings.Contains(strings.ToLower(toolText(missing)), "org_id") {
		t.Fatalf("multi-org list should require org_id, got %s", toolText(missing))
	}

	createA := callTool(t, session, "create_dashboard", map[string]any{
		"title":  "Only A",
		"org_id": orgA.String(),
	})
	if createA.IsError {
		t.Fatalf("create in org A: %s", toolText(createA))
	}

	createB := callTool(t, session, "create_dashboard", map[string]any{
		"title":  "Viewer cannot",
		"org_id": orgB.String(),
	})
	if !createB.IsError {
		t.Fatalf("viewer create in org B should fail")
	}

	listA := callTool(t, session, "list_dashboards", map[string]any{"org_id": orgA.String()})
	if listA.IsError {
		t.Fatalf("list A: %s", toolText(listA))
	}
	var outA listDashboardsOutput
	mustDecodeStructured(t, listA, &outA)
	if len(outA.Dashboards) != 1 || outA.Dashboards[0].Title != "Only A" {
		t.Fatalf("org A dashboards = %+v", outA.Dashboards)
	}

	listB := callTool(t, session, "list_dashboards", map[string]any{"org_id": orgB.String()})
	if listB.IsError {
		t.Fatalf("list B: %s", toolText(listB))
	}
	if bytes.Contains([]byte(structuredBlob(t, listB)), []byte("Only A")) {
		t.Errorf("org B list leaked org A dashboard")
	}
}

func apiGetDashboard(t *testing.T, token string, id uuid.UUID) models.Dashboard {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/dashboards/"+id.String(), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.SetPathValue("id", id.String())
	rec := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, testDashHandler.Get)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/dashboards/%s: %d %s", id, rec.Code, rec.Body.String())
	}
	var d models.Dashboard
	if err := json.NewDecoder(rec.Body).Decode(&d); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	return d
}

func apiListPanels(t *testing.T, token string, dashboardID uuid.UUID) []models.Panel {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/dashboards/"+dashboardID.String()+"/panels", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.SetPathValue("id", dashboardID.String())
	rec := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, testPanelHandler.ListByDashboard)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET panels: %d %s", rec.Code, rec.Body.String())
	}
	var panels []models.Panel
	if err := json.NewDecoder(rec.Body).Decode(&panels); err != nil {
		t.Fatalf("decode panels: %v", err)
	}
	return panels
}

func structuredBlob(t *testing.T, res *mcpsdk.CallToolResult) string {
	t.Helper()
	raw, err := json.Marshal(res.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw) + toolText(res)
}

func assertQueryHas(t *testing.T, query json.RawMessage, expr, datasourceID string) {
	t.Helper()
	var q map[string]any
	if err := json.Unmarshal(query, &q); err != nil {
		t.Fatalf("query json: %v (%s)", err, query)
	}
	if q["expr"] != expr {
		t.Errorf("query.expr = %v, want %q", q["expr"], expr)
	}
	if q["datasource_id"] != datasourceID {
		t.Errorf("query.datasource_id = %v, want %q", q["datasource_id"], datasourceID)
	}
}

func TestBuildPanelQueryAndMapDashErr(t *testing.T) {
	raw := buildPanelQuery(upsertPanelInput{
		DatasourceID: "ds-1",
		Query: panelQueryInput{
			Expr:         "up",
			LegendFormat: "{{job}}",
			Signal:       "metrics",
		},
	}, "")
	var q map[string]any
	if err := json.Unmarshal(raw, &q); err != nil {
		t.Fatal(err)
	}
	if q["expr"] != "up" || q["legend_format"] != "{{job}}" || q["signal"] != "metrics" || q["datasource_id"] != "ds-1" {
		t.Errorf("query = %+v", q)
	}

	raw = buildPanelQuery(upsertPanelInput{Query: panelQueryInput{Expr: "rate(x[5m])"}}, "ds-default")
	if err := json.Unmarshal(raw, &q); err != nil {
		t.Fatal(err)
	}
	if q["datasource_id"] != "ds-default" || q["expr"] != "rate(x[5m])" {
		t.Errorf("default ds query = %+v", q)
	}

	if buildPanelQuery(upsertPanelInput{}, "") != nil {
		t.Errorf("empty query should be nil")
	}

	gp := gridPosOrDefault(nil)
	if gp != (models.GridPos{X: 0, Y: 0, W: 6, H: 3}) {
		t.Errorf("default grid_pos = %+v", gp)
	}

	if _, err := parseID("", "dashboard_id"); err == nil || !strings.Contains(err.Error(), "required") {
		t.Errorf("empty id: %v", err)
	}
	if _, err := parseID("nope", "dashboard_id"); err == nil || !strings.Contains(err.Error(), "invalid") {
		t.Errorf("bad id: %v", err)
	}

	if err := mapDashErr(handlers.ErrNotOrgMember, "x"); err == nil || err.Error() != "not a member of this organization" {
		t.Errorf("member err = %v", err)
	}
	if err := mapDashErr(handlers.ErrForbidden, "x"); err == nil || err.Error() != "forbidden" {
		t.Errorf("forbidden err = %v", err)
	}
	if err := mapDashErr(handlers.ErrDashboardNotFound, "x"); err == nil || err.Error() != "dashboard not found" {
		t.Errorf("not found err = %v", err)
	}
	if err := mapDashErr(errors.New("sql boom"), "failed to list dashboards"); err == nil || err.Error() != "failed to list dashboards" {
		t.Errorf("fallback should hide sql: %v", err)
	}
}
