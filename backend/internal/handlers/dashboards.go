package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/analytics"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/authz"
	"github.com/aceobservability/ace/backend/internal/models"
)

var (
	// ErrForbidden is returned when the user is an org member but lacks the required permission.
	ErrForbidden = errors.New("forbidden")
	// ErrDashboardNotFound is returned when the dashboard does not exist.
	ErrDashboardNotFound = errors.New("dashboard not found")
	// ErrPanelNotFound is returned when the panel does not exist.
	ErrPanelNotFound = errors.New("panel not found")
	// ErrNotDashboardEditor is returned when a non-admin/non-editor tries to create a dashboard.
	ErrNotDashboardEditor = errors.New("only admins and editors can create dashboards")
	// ErrFolderNotFound is returned when folder_id is not in the dashboard's organization.
	ErrFolderNotFound = errors.New("folder not found in organization")
	// ErrInvalidGridPos is returned when panel grid_pos cannot be encoded.
	ErrInvalidGridPos = errors.New("invalid grid_pos")
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

func (h *DashboardHandler) requireMember(ctx context.Context, userID, orgID uuid.UUID) (string, error) {
	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotOrgMember
		}
		return "", err
	}
	return role, nil
}

func writeDashboardHTTPError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, ErrNotOrgMember):
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
	case errors.Is(err, ErrNotDashboardEditor):
		http.Error(w, `{"error":"only admins and editors can create dashboards"}`, http.StatusForbidden)
	case errors.Is(err, ErrForbidden):
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
	case errors.Is(err, ErrDashboardNotFound):
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
	case errors.Is(err, ErrFolderNotFound):
		http.Error(w, `{"error":"folder not found in organization"}`, http.StatusBadRequest)
	default:
		http.Error(w, `{"error":"`+fallback+`"}`, http.StatusInternalServerError)
	}
}

const dashboardColumns = `id, title, description, folder_id, sort_order, created_at, updated_at, organization_id, created_by`

func scanDashboard(row interface {
	Scan(dest ...any) error
}, d *models.Dashboard) error {
	return row.Scan(&d.ID, &d.Title, &d.Description, &d.FolderID, &d.SortOrder,
		&d.CreatedAt, &d.UpdatedAt, &d.OrganizationID, &d.CreatedBy)
}

// CreateDashboard creates a dashboard in orgID. Same ACL as POST /api/orgs/{orgId}/dashboards.
// Optional folderID is assigned when the folder belongs to the organization.
func (h *DashboardHandler) CreateDashboard(ctx context.Context, userID, orgID uuid.UUID, req models.CreateDashboardRequest, folderID *uuid.UUID) (*models.Dashboard, error) {
	role, err := h.requireMember(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	if role != "admin" && role != "editor" {
		return nil, ErrNotDashboardEditor
	}

	if folderID != nil {
		if err := h.validateFolderInOrg(ctx, orgID, folderID); err != nil {
			return nil, err
		}
	}

	tx, err := h.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var dashboard models.Dashboard
	err = scanDashboard(tx.QueryRow(ctx,
		`INSERT INTO dashboards (title, description, organization_id, created_by, folder_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING `+dashboardColumns,
		req.Title, req.Description, orgID, userID, folderID,
	), &dashboard)
	if err != nil {
		return nil, err
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
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &dashboard, nil
}

// ListDashboards returns dashboards in orgID the user can view. Same ACL as GET /api/orgs/{orgId}/dashboards.
func (h *DashboardHandler) ListDashboards(ctx context.Context, userID, orgID uuid.UUID) ([]models.Dashboard, error) {
	if _, err := h.requireMember(ctx, userID, orgID); err != nil {
		return nil, err
	}

	rows, err := h.pool.Query(ctx,
		`SELECT `+dashboardColumns+`
		 FROM dashboards
		 WHERE organization_id = $1
		 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dashboards := []models.Dashboard{}
	for rows.Next() {
		var d models.Dashboard
		if err := scanDashboard(rows, &d); err != nil {
			return nil, err
		}

		canView, err := h.authz.Can(ctx, userID, orgID, authz.ResourceTypeDashboard, d.ID, authz.ActionView)
		if err != nil {
			return nil, err
		}
		if !canView {
			continue
		}
		dashboards = append(dashboards, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return dashboards, nil
}

// GetDashboard returns a dashboard by ID. Same ACL as GET /api/dashboards/{id}.
func (h *DashboardHandler) GetDashboard(ctx context.Context, userID, id uuid.UUID) (*models.Dashboard, error) {
	var dashboard models.Dashboard
	err := scanDashboard(h.pool.QueryRow(ctx,
		`SELECT `+dashboardColumns+` FROM dashboards WHERE id = $1`, id,
	), &dashboard)
	if err != nil {
		return nil, ErrDashboardNotFound
	}

	if dashboard.OrganizationID != nil {
		if _, err := h.requireMember(ctx, userID, *dashboard.OrganizationID); err != nil {
			return nil, err
		}

		canView, err := h.authz.Can(ctx, userID, *dashboard.OrganizationID, authz.ResourceTypeDashboard, dashboard.ID, authz.ActionView)
		if err != nil {
			return nil, err
		}
		if !canView {
			return nil, ErrForbidden
		}
	}

	return &dashboard, nil
}

// UpdateDashboard modifies title, description, or folder. Same ACL as PUT /api/dashboards/{id}.
func (h *DashboardHandler) UpdateDashboard(ctx context.Context, userID, id uuid.UUID, req models.UpdateDashboardRequest) (*models.Dashboard, error) {
	var orgID *uuid.UUID
	err := h.pool.QueryRow(ctx, `SELECT organization_id FROM dashboards WHERE id = $1`, id).Scan(&orgID)
	if err != nil {
		return nil, ErrDashboardNotFound
	}

	if orgID != nil {
		if _, err := h.requireMember(ctx, userID, *orgID); err != nil {
			return nil, err
		}

		canEdit, err := h.authz.Can(ctx, userID, *orgID, authz.ResourceTypeDashboard, id, authz.ActionEdit)
		if err != nil {
			return nil, err
		}
		if !canEdit {
			return nil, ErrForbidden
		}

		if req.FolderIDSet && req.FolderID != nil {
			if err := h.validateFolderInOrg(ctx, *orgID, req.FolderID); err != nil {
				return nil, err
			}
		}
	}

	var dashboard models.Dashboard
	err = scanDashboard(h.pool.QueryRow(ctx,
		`UPDATE dashboards
		 SET title = COALESCE($1, title),
		     description = COALESCE($2, description),
		     folder_id = CASE WHEN $3 THEN $4::uuid ELSE folder_id END,
		     updated_at = NOW()
		 WHERE id = $5
		 RETURNING `+dashboardColumns,
		req.Title, req.Description, req.FolderIDSet, req.FolderID, id,
	), &dashboard)
	if err != nil {
		return nil, ErrDashboardNotFound
	}
	return &dashboard, nil
}

// DeleteDashboard removes a dashboard and its panels. Same ACL as DELETE /api/dashboards/{id}.
func (h *DashboardHandler) DeleteDashboard(ctx context.Context, userID, id uuid.UUID) error {
	var orgID *uuid.UUID
	err := h.pool.QueryRow(ctx, `SELECT organization_id FROM dashboards WHERE id = $1`, id).Scan(&orgID)
	if err != nil {
		return ErrDashboardNotFound
	}

	if orgID != nil {
		if _, err := h.requireMember(ctx, userID, *orgID); err != nil {
			return err
		}

		canEdit, err := h.authz.Can(ctx, userID, *orgID, authz.ResourceTypeDashboard, id, authz.ActionEdit)
		if err != nil {
			return err
		}
		if !canEdit {
			return ErrForbidden
		}
	}

	result, err := h.pool.Exec(ctx, `DELETE FROM dashboards WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrDashboardNotFound
	}
	return nil
}

func (h *DashboardHandler) validateFolderInOrg(ctx context.Context, orgID uuid.UUID, folderID *uuid.UUID) error {
	var folderExists bool
	err := h.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM folders WHERE id = $1 AND organization_id = $2)`,
		folderID, orgID,
	).Scan(&folderExists)
	if err != nil {
		return err
	}
	if !folderExists {
		return ErrFolderNotFound
	}
	return nil
}

// Create creates a new dashboard in the specified organization. Requires admin or editor role.
func (h *DashboardHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

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

	dashboard, err := h.CreateDashboard(ctx, userID, orgID, req, nil)
	if err != nil {
		writeDashboardHTTPError(w, err, "failed to create dashboard")
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

// List returns all dashboards the user has view access to in the specified organization.
func (h *DashboardHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgIDStr := r.PathValue("orgId")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	dashboards, err := h.ListDashboards(ctx, userID, orgID)
	if err != nil {
		writeDashboardHTTPError(w, err, "failed to fetch dashboards")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboards)
}

// Get returns a single dashboard by ID.
func (h *DashboardHandler) Get(w http.ResponseWriter, r *http.Request) {
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

	dashboard, err := h.GetDashboard(ctx, userID, id)
	if err != nil {
		writeDashboardHTTPError(w, err, "failed to evaluate dashboard permissions")
		return
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

// Update modifies a dashboard's title, description, or folder assignment.
func (h *DashboardHandler) Update(w http.ResponseWriter, r *http.Request) {
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

	dashboard, err := h.UpdateDashboard(ctx, userID, id, req)
	if err != nil {
		fallback := "failed to evaluate dashboard permissions"
		if errors.Is(err, ErrFolderNotFound) {
			fallback = "failed to validate folder"
		}
		writeDashboardHTTPError(w, err, fallback)
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

// Delete removes a dashboard and its associated panels.
func (h *DashboardHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	var orgID *uuid.UUID
	_ = h.pool.QueryRow(ctx, `SELECT organization_id FROM dashboards WHERE id = $1`, id).Scan(&orgID)

	if err := h.DeleteDashboard(ctx, userID, id); err != nil {
		writeDashboardHTTPError(w, err, "failed to delete dashboard")
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
