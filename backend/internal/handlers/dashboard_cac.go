package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/authz"
	"github.com/aceobservability/ace/backend/internal/converter"
	"github.com/aceobservability/ace/backend/internal/models"
)

// Export serializes a dashboard and its panels to a portable JSON or YAML document.
func (h *DashboardHandler) Export(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	dashboardID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	format := converter.NormalizeFormat(r.URL.Query().Get("format"))
	if format == "" {
		http.Error(w, `{"error":"format must be json or yaml"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var dashboard models.Dashboard
	err = h.pool.QueryRow(ctx,
		`SELECT id, title, description, created_at, updated_at, organization_id, created_by
		 FROM dashboards
		 WHERE id = $1`,
		dashboardID,
	).Scan(&dashboard.ID, &dashboard.Title, &dashboard.Description, &dashboard.CreatedAt, &dashboard.UpdatedAt, &dashboard.OrganizationID, &dashboard.CreatedBy)
	if err != nil {
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
		return
	}

	if dashboard.OrganizationID == nil {
		http.Error(w, `{"error":"dashboard organization not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, *dashboard.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	canView, err := h.authz.Can(ctx, userID, *dashboard.OrganizationID, authz.ResourceTypeDashboard, dashboard.ID, authz.ActionView)
	if err != nil {
		http.Error(w, `{"error":"failed to evaluate dashboard permissions"}`, http.StatusInternalServerError)
		return
	}
	if !canView {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	rows, err := h.pool.Query(ctx,
		`SELECT title, type, grid_pos, query
		 FROM panels
		 WHERE dashboard_id = $1
		 ORDER BY created_at ASC`,
		dashboard.ID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch dashboard panels"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Collect panels and extract datasource IDs from query blobs
	type rawPanel struct {
		title     string
		panelType string
		gridPos   json.RawMessage
		queryBlob json.RawMessage
		datasrcID string // extracted from query blob
	}
	var rawPanels []rawPanel
	dsIDs := make(map[string]bool)

	for rows.Next() {
		var rp rawPanel
		if err := rows.Scan(&rp.title, &rp.panelType, &rp.gridPos, &rp.queryBlob); err != nil {
			http.Error(w, `{"error":"failed to read dashboard panels"}`, http.StatusInternalServerError)
			return
		}
		rp.datasrcID = converter.ExtractDatasourceID(rp.queryBlob)
		if rp.datasrcID != "" {
			dsIDs[rp.datasrcID] = true
		}
		rawPanels = append(rawPanels, rp)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"failed to read dashboard panels"}`, http.StatusInternalServerError)
		return
	}

	// Batch-resolve datasource UUIDs to name+type
	resolver := NewDatasourceResolver(h.pool)
	var dsUUIDs []uuid.UUID
	for idStr := range dsIDs {
		if id, err := uuid.Parse(idStr); err == nil {
			dsUUIDs = append(dsUUIDs, id)
		}
	}
	dsRefs, err := resolver.LookupRefs(ctx, dsUUIDs)
	if err != nil {
		http.Error(w, `{"error":"failed to resolve datasources"}`, http.StatusInternalServerError)
		return
	}

	// Build v2 panels
	panels := make([]converter.PanelResource, 0, len(rawPanels))
	for _, rp := range rawPanels {
		var pos converter.GridPosition
		if err := json.Unmarshal(rp.gridPos, &pos); err != nil {
			http.Error(w, `{"error":"failed to decode panel layout"}`, http.StatusInternalServerError)
			return
		}

		q, d := converter.QueryBlobToResources(rp.queryBlob)

		panel := converter.PanelResource{
			Title:    rp.title,
			Type:     rp.panelType,
			Position: pos,
			Query:    q,
			Display:  d,
		}

		if rp.datasrcID != "" {
			if dsID, err := uuid.Parse(rp.datasrcID); err == nil {
				if ref, ok := dsRefs[dsID]; ok {
					panel.Datasource = &ref
				}
			}
		}

		panels = append(panels, panel)
	}

	description := ""
	if dashboard.Description != nil {
		description = *dashboard.Description
	}

	doc := converter.DashboardDocument{
		Version:     converter.CurrentSchemaVersion,
		Title:       dashboard.Title,
		Description: description,
		Panels:      panels,
	}

	payload, err := converter.EncodeDashboardDocument(doc, format)
	if err != nil {
		http.Error(w, `{"error":"failed to encode dashboard export"}`, http.StatusInternalServerError)
		return
	}

	if format == "yaml" {
		w.Header().Set("Content-Type", "application/x-yaml")
	} else {
		w.Header().Set("Content-Type", "application/json")
	}
	w.Write(payload)
}

// Import creates a dashboard and its panels from a JSON or YAML document. Requires admin or editor role.
func (h *DashboardHandler) Import(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("orgId"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	format := converter.NormalizeFormat(r.URL.Query().Get("format"))
	if format == "" {
		http.Error(w, `{"error":"format must be json or yaml"}`, http.StatusBadRequest)
		return
	}

	rawBody, err := readRawBody(r)
	if err != nil {
		http.Error(w, `{"error":"failed to read request body"}`, http.StatusBadRequest)
		return
	}

	doc, err := converter.DecodeDashboardDocument(rawBody, format)
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard document"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if role != "admin" && role != "editor" {
		http.Error(w, `{"error":"only admins and editors can import dashboards"}`, http.StatusForbidden)
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error":"failed to start import"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	descPtr := &doc.Description
	if doc.Description == "" {
		descPtr = nil
	}

	var imported models.Dashboard
	err = tx.QueryRow(ctx,
		`INSERT INTO dashboards (title, description, organization_id, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, title, description, folder_id, sort_order, created_at, updated_at, organization_id, created_by`,
		doc.Title,
		descPtr,
		orgID,
		userID,
	).Scan(&imported.ID, &imported.Title, &imported.Description, &imported.FolderID, &imported.SortOrder, &imported.CreatedAt, &imported.UpdatedAt, &imported.OrganizationID, &imported.CreatedBy)
	if err != nil {
		http.Error(w, `{"error":"failed to create dashboard during import"}`, http.StatusInternalServerError)
		return
	}

	resolver := NewDatasourceResolver(h.pool)

	for _, panel := range doc.Panels {
		gridPosRaw, err := json.Marshal(panel.Position)
		if err != nil {
			http.Error(w, `{"error":"failed to encode panel layout"}`, http.StatusBadRequest)
			return
		}

		// Resolve datasource ref to UUID
		var dsIDStr *string
		var datasourceID any
		if panel.Datasource != nil {
			resolved, err := resolver.ResolveRef(ctx, orgID, *panel.Datasource)
			if err != nil {
				http.Error(w, `{"error":"datasource not found: `+panel.Datasource.Type+`"}`, http.StatusBadRequest)
				return
			}
			datasourceID = *resolved
			s := resolved.String()
			dsIDStr = &s
		}

		// Re-assemble query blob from structured fields
		queryBlob := converter.ResourcesToQueryBlob(panel.Query, panel.Display, dsIDStr)

		_, err = tx.Exec(ctx,
			`INSERT INTO panels (dashboard_id, title, type, grid_pos, query, datasource_id, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			imported.ID,
			panel.Title,
			panel.Type,
			gridPosRaw,
			queryBlob,
			datasourceID,
			userID,
		)
		if err != nil {
			http.Error(w, `{"error":"failed to create panel during import"}`, http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error":"failed to finalize import"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(imported)
}

func readRawBody(r *http.Request) ([]byte, error) {
	defer r.Body.Close()
	return io.ReadAll(r.Body)
}
