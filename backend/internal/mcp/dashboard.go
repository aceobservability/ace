package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/handlers"
	"github.com/aceobservability/ace/backend/internal/models"
)

func registerDashboardTools(mcpServer *mcp.Server, s *server) {
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "list_dashboards",
		Title:       "List dashboards",
		Description: "List dashboards the caller can view in an organization. Same records as GET /api/orgs/{orgId}/dashboards. Optional org_id; if omitted and the user belongs to exactly one organization, that organization is used. If the user belongs to multiple organizations, org_id is required.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "List dashboards"},
	}, s.listDashboards)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "get_dashboard",
		Title:       "Get dashboard",
		Description: "Get a dashboard by ID plus its panels. Dashboard fields match GET /api/dashboards/{id}; panels match GET /api/dashboards/{id}/panels. Org ACL is the same as those API routes.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "Get dashboard"},
	}, s.getDashboard)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "create_dashboard",
		Title:       "Create dashboard",
		Description: "Create a dashboard in an organization. Same record as POST /api/orgs/{orgId}/dashboards. Requires admin or editor. Optional folder_id is assigned when the folder belongs to the organization (same as PUT /api/dashboards/{id}). Optional org_id uses the same single-org default as list_datasources.",
		Annotations: &mcp.ToolAnnotations{Title: "Create dashboard"},
	}, s.createDashboard)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "upsert_panels",
		Title:       "Upsert panels",
		Description: "Create or update panels on a dashboard. Same records as POST /api/dashboards/{id}/panels and PUT /api/panels/{id}. Omit panel id to create; include id to update that row. query.expr/signal/legend_format and datasource_id are stored on the panel query JSON the Ace UI reads.",
		Annotations: &mcp.ToolAnnotations{Title: "Upsert panels"},
	}, s.upsertPanels)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "save_generated_dashboard",
		Title:       "Save generated dashboard",
		Description: "Persist a Copilot generate_dashboard spec as a real Ace dashboard with panels. Same create/panel handlers as the HTTP API. Optional top-level datasource_id is applied to panels that omit one. Optional org_id uses the same single-org default as list_datasources.",
		Annotations: &mcp.ToolAnnotations{Title: "Save generated dashboard"},
	}, s.saveGeneratedDashboard)
}

type listDashboardsInput struct {
	OrgID string `json:"org_id,omitempty" jsonschema:"Organization ID. Required if you belong to more than one organization."`
}

type listDashboardsOutput struct {
	Dashboards []models.Dashboard `json:"dashboards"`
	OrgID      string             `json:"org_id"`
}

type getDashboardInput struct {
	DashboardID string `json:"dashboard_id" jsonschema:"Dashboard ID"`
}

type getDashboardOutput struct {
	models.Dashboard
	Panels []models.Panel `json:"panels"`
}

type createDashboardInput struct {
	Title       string `json:"title" jsonschema:"Dashboard title"`
	Description string `json:"description,omitempty" jsonschema:"Optional dashboard description"`
	FolderID    string `json:"folder_id,omitempty" jsonschema:"Optional folder ID in the same organization"`
	OrgID       string `json:"org_id,omitempty" jsonschema:"Organization ID. Required if you belong to more than one organization."`
}

type gridPosInput struct {
	X int `json:"x" jsonschema:"Column position (0-11)"`
	Y int `json:"y" jsonschema:"Row position"`
	W int `json:"w" jsonschema:"Width in columns (1-12)"`
	H int `json:"h" jsonschema:"Height in rows"`
}

type panelQueryInput struct {
	Expr         string `json:"expr,omitempty" jsonschema:"Query expression (PromQL/MetricsQL, LogQL, TraceQL, etc.)"`
	LegendFormat string `json:"legend_format,omitempty" jsonschema:"Optional legend format string"`
	Signal       string `json:"signal,omitempty" jsonschema:"Signal type: metrics, logs, or traces"`
	DatasourceID string `json:"datasource_id,omitempty" jsonschema:"Datasource ID stored on the panel query"`
}

type upsertPanelInput struct {
	ID           string          `json:"id,omitempty" jsonschema:"Existing panel ID to update. Omit to create a new panel."`
	Title        string          `json:"title,omitempty" jsonschema:"Panel title (required when creating)"`
	Type         string          `json:"type,omitempty" jsonschema:"Visualization type: line_chart, bar_chart, gauge, stat, table, or pie"`
	GridPos      *gridPosInput   `json:"grid_pos,omitempty" jsonschema:"Panel layout"`
	DatasourceID string          `json:"datasource_id,omitempty" jsonschema:"Datasource ID stored on the panel query (same field the Ace UI reads)"`
	Query        panelQueryInput `json:"query,omitempty" jsonschema:"Query configuration"`
}

type upsertPanelsInput struct {
	DashboardID string             `json:"dashboard_id" jsonschema:"Dashboard ID"`
	Panels      []upsertPanelInput `json:"panels" jsonschema:"Panels to create or update"`
}

type upsertPanelsOutput struct {
	DashboardID string         `json:"dashboard_id"`
	Panels      []models.Panel `json:"panels"`
}

type saveGeneratedDashboardInput struct {
	Title        string             `json:"title" jsonschema:"Dashboard title"`
	Description  string             `json:"description,omitempty" jsonschema:"Optional dashboard description"`
	FolderID     string             `json:"folder_id,omitempty" jsonschema:"Optional folder ID in the same organization"`
	OrgID        string             `json:"org_id,omitempty" jsonschema:"Organization ID. Required if you belong to more than one organization."`
	DatasourceID string             `json:"datasource_id,omitempty" jsonschema:"Default datasource ID applied to panels that omit one"`
	Panels       []upsertPanelInput `json:"panels" jsonschema:"Panel specifications from generate_dashboard"`
}

func (s *server) requireDashboardHandlers() error {
	if s.dash == nil || s.panel == nil {
		return fmt.Errorf("dashboard tools are not configured")
	}
	return nil
}

func (s *server) callerUser(ctx context.Context) (uuid.UUID, error) {
	userID, ok := auth.GetUserID(ctx)
	if !ok {
		return uuid.Nil, fmt.Errorf("unauthorized")
	}
	return userID, nil
}

func (s *server) listDashboards(ctx context.Context, _ *mcp.CallToolRequest, input listDashboardsInput) (*mcp.CallToolResult, listDashboardsOutput, error) {
	if err := s.requireDashboardHandlers(); err != nil {
		return nil, listDashboardsOutput{}, err
	}
	userID, err := s.callerUser(ctx)
	if err != nil {
		return nil, listDashboardsOutput{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, toolTimeout)
	defer cancel()

	user, err := s.auth.GetUserWithOrgs(ctx, userID)
	if err != nil {
		return nil, listDashboardsOutput{}, fmt.Errorf("failed to load user")
	}

	orgID, err := resolveOrgID(user, input.OrgID)
	if err != nil {
		return nil, listDashboardsOutput{}, err
	}

	dashboards, err := s.dash.ListDashboards(ctx, userID, orgID)
	if err != nil {
		return nil, listDashboardsOutput{}, mapDashErr(err, "failed to list dashboards")
	}

	return nil, listDashboardsOutput{Dashboards: dashboards, OrgID: orgID.String()}, nil
}

func (s *server) getDashboard(ctx context.Context, _ *mcp.CallToolRequest, input getDashboardInput) (*mcp.CallToolResult, getDashboardOutput, error) {
	if err := s.requireDashboardHandlers(); err != nil {
		return nil, getDashboardOutput{}, err
	}
	userID, err := s.callerUser(ctx)
	if err != nil {
		return nil, getDashboardOutput{}, err
	}
	dashboardID, err := parseID(input.DashboardID, "dashboard_id")
	if err != nil {
		return nil, getDashboardOutput{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, toolTimeout)
	defer cancel()

	dashboard, err := s.dash.GetDashboard(ctx, userID, dashboardID)
	if err != nil {
		return nil, getDashboardOutput{}, mapDashErr(err, "failed to get dashboard")
	}
	panels, err := s.panel.ListPanels(ctx, userID, dashboardID)
	if err != nil {
		return nil, getDashboardOutput{}, mapDashErr(err, "failed to list panels")
	}

	return nil, getDashboardOutput{Dashboard: *dashboard, Panels: panels}, nil
}

func (s *server) createDashboard(ctx context.Context, _ *mcp.CallToolRequest, input createDashboardInput) (*mcp.CallToolResult, models.Dashboard, error) {
	empty := models.Dashboard{}
	if err := s.requireDashboardHandlers(); err != nil {
		return nil, empty, err
	}
	if input.Title == "" {
		return nil, empty, fmt.Errorf("title is required")
	}

	userID, err := s.callerUser(ctx)
	if err != nil {
		return nil, empty, err
	}

	ctx, cancel := context.WithTimeout(ctx, toolTimeout)
	defer cancel()

	user, err := s.auth.GetUserWithOrgs(ctx, userID)
	if err != nil {
		return nil, empty, fmt.Errorf("failed to load user")
	}

	orgID, err := resolveOrgID(user, input.OrgID)
	if err != nil {
		return nil, empty, err
	}

	folderID, err := parseOptionalID(input.FolderID, "folder_id")
	if err != nil {
		return nil, empty, err
	}

	req := models.CreateDashboardRequest{Title: input.Title}
	if input.Description != "" {
		req.Description = &input.Description
	}

	dashboard, err := s.dash.CreateDashboard(ctx, userID, orgID, req, folderID)
	if err != nil {
		return nil, empty, mapDashErr(err, "failed to create dashboard")
	}
	return nil, *dashboard, nil
}

func (s *server) upsertPanels(ctx context.Context, _ *mcp.CallToolRequest, input upsertPanelsInput) (*mcp.CallToolResult, upsertPanelsOutput, error) {
	empty := upsertPanelsOutput{}
	if err := s.requireDashboardHandlers(); err != nil {
		return nil, empty, err
	}
	userID, err := s.callerUser(ctx)
	if err != nil {
		return nil, empty, err
	}
	dashboardID, err := parseID(input.DashboardID, "dashboard_id")
	if err != nil {
		return nil, empty, err
	}
	if len(input.Panels) == 0 {
		return nil, empty, fmt.Errorf("panels is required")
	}

	ctx, cancel := context.WithTimeout(ctx, toolTimeout)
	defer cancel()

	if _, err := s.dash.GetDashboard(ctx, userID, dashboardID); err != nil {
		return nil, empty, mapDashErr(err, "failed to get dashboard")
	}

	written, err := s.applyPanelUpserts(ctx, userID, dashboardID, input.Panels, "")
	if err != nil {
		return nil, empty, err
	}
	return nil, upsertPanelsOutput{DashboardID: dashboardID.String(), Panels: written}, nil
}

func (s *server) saveGeneratedDashboard(ctx context.Context, _ *mcp.CallToolRequest, input saveGeneratedDashboardInput) (*mcp.CallToolResult, getDashboardOutput, error) {
	empty := getDashboardOutput{}
	if err := s.requireDashboardHandlers(); err != nil {
		return nil, empty, err
	}
	if input.Title == "" {
		return nil, empty, fmt.Errorf("title is required")
	}
	if len(input.Panels) == 0 {
		return nil, empty, fmt.Errorf("panels is required")
	}

	userID, err := s.callerUser(ctx)
	if err != nil {
		return nil, empty, err
	}

	ctx, cancel := context.WithTimeout(ctx, toolTimeout)
	defer cancel()

	user, err := s.auth.GetUserWithOrgs(ctx, userID)
	if err != nil {
		return nil, empty, fmt.Errorf("failed to load user")
	}

	orgID, err := resolveOrgID(user, input.OrgID)
	if err != nil {
		return nil, empty, err
	}
	folderID, err := parseOptionalID(input.FolderID, "folder_id")
	if err != nil {
		return nil, empty, err
	}

	req := models.CreateDashboardRequest{Title: input.Title}
	if input.Description != "" {
		req.Description = &input.Description
	}

	dashboard, err := s.dash.CreateDashboard(ctx, userID, orgID, req, folderID)
	if err != nil {
		return nil, empty, mapDashErr(err, "failed to create dashboard")
	}

	panels, err := s.applyPanelUpserts(ctx, userID, dashboard.ID, input.Panels, input.DatasourceID)
	if err != nil {
		_ = s.dash.DeleteDashboard(ctx, userID, dashboard.ID)
		return nil, empty, err
	}

	return nil, getDashboardOutput{Dashboard: *dashboard, Panels: panels}, nil
}

func (s *server) applyPanelUpserts(ctx context.Context, userID, dashboardID uuid.UUID, specs []upsertPanelInput, defaultDatasourceID string) ([]models.Panel, error) {
	existing, err := s.panel.ListPanels(ctx, userID, dashboardID)
	if err != nil {
		return nil, mapDashErr(err, "failed to list panels")
	}
	existingIDs := make(map[uuid.UUID]struct{}, len(existing))
	for _, p := range existing {
		existingIDs[p.ID] = struct{}{}
	}

	out := make([]models.Panel, 0, len(specs))
	for _, spec := range specs {
		panel, err := s.upsertOnePanel(ctx, userID, dashboardID, spec, defaultDatasourceID, existingIDs)
		if err != nil {
			return nil, err
		}
		out = append(out, *panel)
		existingIDs[panel.ID] = struct{}{}
	}
	return out, nil
}

func (s *server) upsertOnePanel(ctx context.Context, userID, dashboardID uuid.UUID, spec upsertPanelInput, defaultDatasourceID string, existingIDs map[uuid.UUID]struct{}) (*models.Panel, error) {
	if spec.ID == "" {
		if spec.Title == "" {
			return nil, fmt.Errorf("title is required")
		}
		req := models.CreatePanelRequest{
			Title:   spec.Title,
			GridPos: gridPosOrDefault(spec.GridPos),
			Query:   buildPanelQuery(spec, defaultDatasourceID),
		}
		if spec.Type != "" {
			req.Type = &spec.Type
		}
		panel, err := s.panel.CreatePanel(ctx, userID, dashboardID, req)
		if err != nil {
			return nil, mapDashErr(err, "failed to create panel")
		}
		return panel, nil
	}

	panelID, err := parseID(spec.ID, "id")
	if err != nil {
		return nil, err
	}
	if _, ok := existingIDs[panelID]; !ok {
		return nil, fmt.Errorf("panel not found on this dashboard")
	}

	req := models.UpdatePanelRequest{}
	if spec.Title != "" {
		req.Title = &spec.Title
	}
	if spec.Type != "" {
		req.Type = &spec.Type
	}
	if spec.GridPos != nil {
		gp := spec.GridPos.asModel()
		req.GridPos = &gp
	}
	if query := buildPanelQuery(spec, defaultDatasourceID); len(query) > 0 {
		req.Query = query
	}

	panel, err := s.panel.UpdatePanel(ctx, userID, panelID, req)
	if err != nil {
		return nil, mapDashErr(err, "failed to update panel")
	}
	return panel, nil
}

func (g gridPosInput) asModel() models.GridPos {
	return models.GridPos{X: g.X, Y: g.Y, W: g.W, H: g.H}
}

func gridPosOrDefault(g *gridPosInput) models.GridPos {
	if g == nil || (g.W == 0 && g.H == 0) {
		return models.GridPos{X: 0, Y: 0, W: 6, H: 3}
	}
	return g.asModel()
}

func buildPanelQuery(spec upsertPanelInput, defaultDatasourceID string) json.RawMessage {
	q := map[string]any{}
	if spec.Query.Expr != "" {
		q["expr"] = spec.Query.Expr
	}
	if spec.Query.LegendFormat != "" {
		q["legend_format"] = spec.Query.LegendFormat
	}
	if spec.Query.Signal != "" {
		q["signal"] = spec.Query.Signal
	}
	dsID := spec.DatasourceID
	if dsID == "" {
		dsID = spec.Query.DatasourceID
	}
	if dsID == "" {
		dsID = defaultDatasourceID
	}
	if dsID != "" {
		q["datasource_id"] = dsID
	}
	if len(q) == 0 {
		return nil
	}
	raw, err := json.Marshal(q)
	if err != nil {
		return nil
	}
	return raw
}

func parseID(raw, field string) (uuid.UUID, error) {
	if raw == "" {
		return uuid.Nil, fmt.Errorf("%s is required", field)
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid %s", field)
	}
	return id, nil
}

func parseOptionalID(raw, field string) (*uuid.UUID, error) {
	if raw == "" {
		return nil, nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid %s", field)
	}
	return &id, nil
}

func mapDashErr(err error, fallback string) error {
	switch {
	case errors.Is(err, handlers.ErrNotOrgMember):
		return fmt.Errorf("not a member of this organization")
	case errors.Is(err, handlers.ErrNotDashboardEditor):
		return fmt.Errorf("only admins and editors can create dashboards")
	case errors.Is(err, handlers.ErrForbidden):
		return fmt.Errorf("forbidden")
	case errors.Is(err, handlers.ErrDashboardNotFound):
		return fmt.Errorf("dashboard not found")
	case errors.Is(err, handlers.ErrPanelNotFound):
		return fmt.Errorf("panel not found")
	case errors.Is(err, handlers.ErrFolderNotFound):
		return fmt.Errorf("folder not found in organization")
	case errors.Is(err, handlers.ErrInvalidGridPos):
		return fmt.Errorf("invalid grid_pos")
	default:
		return fmt.Errorf("%s", fallback)
	}
}
