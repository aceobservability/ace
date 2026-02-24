package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/janhoon/dash/backend/internal/analytics"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/authz"
	"github.com/janhoon/dash/backend/internal/models"
)

type DashboardHandler struct {
	pool  *pgxpool.Pool
	authz *authz.Service
}

func NewDashboardHandler(pool *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{
		pool:  pool,
		authz: authz.NewService(pool),
	}
}

// checkOrgMembership verifies the user is a member of the organization
func (h *DashboardHandler) checkOrgMembership(ctx context.Context, userID, orgID uuid.UUID) (string, error) {
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role)
	return role, err
}

func (h *DashboardHandler) Create(w http.ResponseWriter, r *http.Request) {
	// Get user from auth context
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Get organization ID from URL path
	orgIDStr := r.PathValue("orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	var req models.CreateDashboardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		http.Error(w, `{"error":"title is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Verify user is member of org
	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	// Only admin and editor can create dashboards
	if role == "viewer" {
		http.Error(w, `{"error":"viewers cannot create dashboards"}`, http.StatusForbidden)
		return
	}

	tx, err := h.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		http.Error(w, `{"error":"failed to create dashboard"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	var dashboard models.Dashboard
	err = tx.QueryRow(ctx,
		`INSERT INTO dashboards (title, description, organization_id, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, title, description, folder_id, sort_order, created_at, updated_at, organization_id, created_by`,
		req.Title, req.Description, orgID, userID,
	).Scan(&dashboard.ID, &dashboard.Title, &dashboard.Description, &dashboard.FolderID, &dashboard.SortOrder,
		&dashboard.CreatedAt, &dashboard.UpdatedAt, &dashboard.OrganizationID, &dashboard.CreatedBy)
	if err != nil {
		http.Error(w, `{"error":"failed to create dashboard"}`, http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission, created_by)
		 SELECT om.organization_id, $2, $3, $4, om.user_id,
		 	CASE WHEN om.user_id = $5 THEN $6 ELSE $7 END,
		 	$5
		 FROM organization_memberships om
		 WHERE om.organization_id = $1
		 ON CONFLICT (resource_type, resource_id, principal_type, principal_id)
		 DO UPDATE SET permission = EXCLUDED.permission, created_by = EXCLUDED.created_by, updated_at = NOW()`,
		orgID,
		authz.ResourceTypeDashboard,
		dashboard.ID,
		models.PrincipalTypeUser,
		userID,
		models.ResourcePermissionAdmin,
		models.ResourcePermissionView,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create dashboard"}`, http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error":"failed to create dashboard"}`, http.StatusInternalServerError)
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "dashboard_created",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":         userID.String(),
			"dashboard_id":    dashboard.ID.String(),
			"organization_id": orgID.String(),
		},
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(dashboard)
}

func (h *DashboardHandler) List(w http.ResponseWriter, r *http.Request) {
	// Get user from auth context
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Get organization ID from URL path
	orgIDStr := r.PathValue("orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err = h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	rows, err := h.pool.Query(ctx,
		`SELECT id, title, description, folder_id, sort_order, created_at, updated_at, organization_id, created_by
		 FROM dashboards
		 WHERE organization_id = $1
		 ORDER BY created_at DESC`, orgID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch dashboards"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	dashboards := []models.Dashboard{}
	for rows.Next() {
		var d models.Dashboard
		if err := rows.Scan(&d.ID, &d.Title, &d.Description, &d.FolderID, &d.SortOrder, &d.CreatedAt, &d.UpdatedAt, &d.OrganizationID, &d.CreatedBy); err != nil {
			http.Error(w, `{"error":"failed to scan dashboard"}`, http.StatusInternalServerError)
			return
		}

		canView, err := h.authz.Can(ctx, userID, orgID, authz.ResourceTypeDashboard, d.ID, authz.ActionView)
		if err != nil {
			http.Error(w, `{"error":"failed to evaluate dashboard permissions"}`, http.StatusInternalServerError)
			return
		}
		if !canView {
			continue
		}

		dashboards = append(dashboards, d)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"failed to iterate dashboards"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboards)
}

func (h *DashboardHandler) Get(w http.ResponseWriter, r *http.Request) {
	// Get user from auth context
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var dashboard models.Dashboard
	err = h.pool.QueryRow(ctx,
		`SELECT id, title, description, folder_id, sort_order, created_at, updated_at, organization_id, created_by
		 FROM dashboards
		 WHERE id = $1`, id,
	).Scan(&dashboard.ID, &dashboard.Title, &dashboard.Description, &dashboard.FolderID, &dashboard.SortOrder,
		&dashboard.CreatedAt, &dashboard.UpdatedAt, &dashboard.OrganizationID, &dashboard.CreatedBy)

	if err != nil {
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
		return
	}

	// Verify user is member of the dashboard's org
	if dashboard.OrganizationID != nil {
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
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "dashboard_viewed",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":      userID.String(),
			"dashboard_id": dashboard.ID.String(),
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

func (h *DashboardHandler) Update(w http.ResponseWriter, r *http.Request) {
	// Get user from auth context
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	var req models.UpdateDashboardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// First get the dashboard to check org membership
	var orgID *uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT organization_id FROM dashboards WHERE id = $1`, id).Scan(&orgID)
	if err != nil {
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
		return
	}

	// Verify user is member of the dashboard's org
	if orgID != nil {
		_, err := h.checkOrgMembership(ctx, userID, *orgID)
		if err != nil {
			http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
			return
		}

		canEdit, err := h.authz.Can(ctx, userID, *orgID, authz.ResourceTypeDashboard, id, authz.ActionEdit)
		if err != nil {
			http.Error(w, `{"error":"failed to evaluate dashboard permissions"}`, http.StatusInternalServerError)
			return
		}
		if !canEdit {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}

		if req.FolderIDSet && req.FolderID != nil {
			var folderExists bool
			err = h.pool.QueryRow(ctx,
				`SELECT EXISTS(SELECT 1 FROM folders WHERE id = $1 AND organization_id = $2)`,
				req.FolderID, *orgID,
			).Scan(&folderExists)
			if err != nil {
				http.Error(w, `{"error":"failed to validate folder"}`, http.StatusInternalServerError)
				return
			}
			if !folderExists {
				http.Error(w, `{"error":"folder not found in organization"}`, http.StatusBadRequest)
				return
			}
		}
	}

	var dashboard models.Dashboard
	err = h.pool.QueryRow(ctx,
		`UPDATE dashboards
		 SET title = COALESCE($1, title),
		     description = COALESCE($2, description),
		     folder_id = CASE WHEN $3 THEN $4::uuid ELSE folder_id END,
		     updated_at = NOW()
		 WHERE id = $5
		 RETURNING id, title, description, folder_id, sort_order, created_at, updated_at, organization_id, created_by`,
		req.Title, req.Description, req.FolderIDSet, req.FolderID, id,
	).Scan(&dashboard.ID, &dashboard.Title, &dashboard.Description, &dashboard.FolderID, &dashboard.SortOrder,
		&dashboard.CreatedAt, &dashboard.UpdatedAt, &dashboard.OrganizationID, &dashboard.CreatedBy)

	if err != nil {
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
		return
	}

	properties := map[string]any{
		"user_id":             userID.String(),
		"dashboard_id":        dashboard.ID.String(),
		"title_updated":       req.Title != nil,
		"description_updated": req.Description != nil,
		"folder_updated":      req.FolderIDSet,
	}
	if dashboard.OrganizationID != nil {
		properties["organization_id"] = dashboard.OrganizationID.String()
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "dashboard_updated",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: properties,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

func (h *DashboardHandler) Delete(w http.ResponseWriter, r *http.Request) {
	// Get user from auth context
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// First get the dashboard to check org membership
	var orgID *uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT organization_id FROM dashboards WHERE id = $1`, id).Scan(&orgID)
	if err != nil {
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
		return
	}

	// Verify user is member of the dashboard's org
	if orgID != nil {
		_, err := h.checkOrgMembership(ctx, userID, *orgID)
		if err != nil {
			http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
			return
		}

		canEdit, err := h.authz.Can(ctx, userID, *orgID, authz.ResourceTypeDashboard, id, authz.ActionEdit)
		if err != nil {
			http.Error(w, `{"error":"failed to evaluate dashboard permissions"}`, http.StatusInternalServerError)
			return
		}
		if !canEdit {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	result, err := h.pool.Exec(ctx, `DELETE FROM dashboards WHERE id = $1`, id)
	if err != nil {
		http.Error(w, `{"error":"failed to delete dashboard"}`, http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
		return
	}

	properties := map[string]any{
		"user_id":      userID.String(),
		"dashboard_id": id.String(),
	}
	if orgID != nil {
		properties["organization_id"] = orgID.String()
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "dashboard_deleted",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: properties,
	})

	w.WriteHeader(http.StatusNoContent)
}
