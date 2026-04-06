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
		`SELECT title, type, grid_pos, query, datasource_id
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

	panels := make([]converter.PanelResource, 0)
	for rows.Next() {
		var panel converter.PanelResource
		var gridPosRaw []byte
		var queryRaw []byte
		var datasourceID *uuid.UUID

		if err := rows.Scan(&panel.Title, &panel.Type, &gridPosRaw, &queryRaw, &datasourceID); err != nil {
			http.Error(w, `{"error":"failed to read dashboard panels"}`, http.StatusInternalServerError)
			return
		}
		if err := json.Unmarshal(gridPosRaw, &panel.GridPos); err != nil {
			http.Error(w, `{"error":"failed to decode panel layout"}`, http.StatusInternalServerError)
			return
		}
		if len(queryRaw) > 0 {
			panel.Query = queryRaw
		}
		if datasourceID != nil {
			panel.DataSourceID = datasourceID
		}
		panels = append(panels, panel)
	}

	doc := converter.DashboardDocument{
		SchemaVersion: converter.CurrentSchemaVersion,
		Dashboard: converter.DashboardResource{
			ID:          &dashboard.ID,
			Title:       dashboard.Title,
			Description: dashboard.Description,
			Panels:      panels,
		},
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

	var imported models.Dashboard
	err = tx.QueryRow(ctx,
		`INSERT INTO dashboards (title, description, organization_id, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, title, description, folder_id, sort_order, created_at, updated_at, organization_id, created_by`,
		doc.Dashboard.Title,
		doc.Dashboard.Description,
		orgID,
		userID,
	).Scan(&imported.ID, &imported.Title, &imported.Description, &imported.FolderID, &imported.SortOrder, &imported.CreatedAt, &imported.UpdatedAt, &imported.OrganizationID, &imported.CreatedBy)
	if err != nil {
		http.Error(w, `{"error":"failed to create dashboard during import"}`, http.StatusInternalServerError)
		return
	}

	for _, panel := range doc.Dashboard.Panels {
		gridPosRaw, err := json.Marshal(panel.GridPos)
		if err != nil {
			http.Error(w, `{"error":"failed to encode panel layout"}`, http.StatusBadRequest)
			return
		}

		var datasourceID any
		if panel.DataSourceID != nil {
			datasourceID = *panel.DataSourceID
		}

		_, err = tx.Exec(ctx,
			`INSERT INTO panels (dashboard_id, title, type, grid_pos, query, datasource_id, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			imported.ID,
			panel.Title,
			panel.Type,
			gridPosRaw,
			panel.Query,
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
